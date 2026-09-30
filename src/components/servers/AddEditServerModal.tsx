import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Server,
  Terminal,
  Monitor,
  Shield,
  Key,
  Layers,
  Tags,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Cpu,
  HardDrive,
  Globe,
  Settings,
  Eye,
  EyeOff,
  FolderTree,
  KeyRound,
  Lock,
  BookmarkPlus,
  Check,
  Database,
  RefreshCw,
} from 'lucide-react';
import { RemoteServer, ServerCategory } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { ManageServerCategoriesModal } from './ManageServerCategoriesModal';
import { VaultPasswordPickerModal } from '../vault/VaultPasswordPickerModal';
import { useAuth } from '../../context/AuthContext';
import { testStandaloneMysqlConnection, saveSecretToVault } from '../../services/api';

export interface AddEditServerModalProps {
  isOpen: boolean;
  serverToEdit?: RemoteServer | null;
  initialServiceMode?: 'standard' | 'linux' | 'windows' | 'nginx' | 'apache' | 'postgresql' | 'mysql';
  onClose: () => void;
  onMinimize: () => void;
  onSave: (serverData: Partial<RemoteServer>) => Promise<void>;
  isLightMode?: boolean;
  isEn?: boolean;
}

const COMMON_TAG_SUGGESTIONS = [
  'k8s',
  'prod',
  'staging',
  'dev',
  'dmz',
  'database',
  'postgres',
  'mysql',
  'nginx',
  'docker',
  'redis',
  'monitoring',
  'prometheus',
  'active-directory',
  'domain-controller',
  'backup-target',
  'ci-runner',
  'web-tier',
  'api-gateway',
  'ansible-managed'
];

const SERVER_CATEGORIES = [
  'Infrastructure',
  'Database',
  'Kubernetes',
  'Web / App',
  'Monitoring',
  'Active Directory',
  'General'
];

const ENVIRONMENTS = ['Production', 'Staging', 'Development', 'DMZ'];

export const AddEditServerModal: React.FC<AddEditServerModalProps> = ({
  isOpen,
  serverToEdit,
  initialServiceMode = 'standard',
  onClose,
  onMinimize,
  onSave,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [ip, setIp] = useState('');
  const [serverType, setServerType] = useState<'linux' | 'windows' | 'nginx' | 'apache' | 'postgresql' | 'mysql'>('linux');
  const [osType, setOsType] = useState<'linux' | 'windows'>('linux');
  const [osDistro, setOsDistro] = useState('Ubuntu 24.04 LTS');
  const [category, setCategory] = useState('Infrastructure');
  const [environment, setEnvironment] = useState('Production');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // Dynamic Server Categories
  const [dynamicCategories, setDynamicCategories] = useState<ServerCategory[]>([]);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/server-categories');
      const data = await res.json();
      if (data.success && Array.isArray(data.categories) && data.categories.length > 0) {
        setDynamicCategories(data.categories);
      }
    } catch (e) {
      console.warn('Failed to fetch server categories:', e);
    }
  };

  // Password & Security storage policy
  const { token } = useAuth();
  const [promptPasswordOnConnect, setPromptPasswordOnConnect] = useState(false);
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [showWinPassword, setShowWinPassword] = useState(false);
  const [isVaultPickerOpen, setIsVaultPickerOpen] = useState(false);
  const [vaultPickerTarget, setVaultPickerTarget] = useState<'ssh' | 'windows' | 'postgres' | 'mysql'>('ssh');

  // Vault saving state
  const [saveSshToVault, setSaveSshToVault] = useState(false);
  const [saveWinToVault, setSaveWinToVault] = useState(false);
  const [savePostgresToVault, setSavePostgresToVault] = useState(false);
  const [saveMysqlToVault, setSaveMysqlToVault] = useState(false);
  const [vaultSaveSuccess, setVaultSaveSuccess] = useState<string | null>(null);

  const [savingSshVault, setSavingSshVault] = useState(false);
  const [sshVaultSaved, setSshVaultSaved] = useState(false);
  const [savingWinVault, setSavingWinVault] = useState(false);
  const [winVaultSaved, setWinVaultSaved] = useState(false);
  const [savingPostgresVault, setSavingPostgresVault] = useState(false);
  const [postgresVaultSaved, setPostgresVaultSaved] = useState(false);
  const [savingMysqlVault, setSavingMysqlVault] = useState(false);
  const [mysqlVaultSaved, setMysqlVaultSaved] = useState(false);
  const [vaultFeedbackMsg, setVaultFeedbackMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Linux-specific
  const [sshPort, setSshPort] = useState<number | string>(22);
  const [sshUsername, setSshUsername] = useState('root');
  const [sshPassword, setSshPassword] = useState('');
  const [defaultShell, setDefaultShell] = useState<'bash' | 'zsh' | 'sh'>('bash');

  // Linux Web Server & Database Engine Checkboxes
  const [hasApache, setHasApache] = useState(false);
  const [hasNginx, setHasNginx] = useState(false);
  const [hasPostgres, setHasPostgres] = useState(false);
  const [hasMysql, setHasMysql] = useState(false);

  // Web server ports
  const [webHttpPort, setWebHttpPort] = useState<number | string>(80);
  const [webHttpsPort, setWebHttpsPort] = useState<number | string>(443);

  // PostgreSQL-specific connection credentials
  const [postgresPort, setPostgresPort] = useState<number | string>(5432);
  const [postgresUser, setPostgresUser] = useState('postgres');
  const [postgresPassword, setPostgresPassword] = useState('');
  const [postgresDatabase, setPostgresDatabase] = useState('postgres');
  const [showPostgresPassword, setShowPostgresPassword] = useState(false);
  const [isTestingPostgres, setIsTestingPostgres] = useState(false);
  const [postgresTestFeedback, setPostgresTestFeedback] = useState<string | null>(null);

  // MySQL-specific connection credentials
  const [mysqlPort, setMysqlPort] = useState<number | string>(3306);
  const [mysqlUser, setMysqlUser] = useState('root');
  const [mysqlPassword, setMysqlPassword] = useState('');
  const [mysqlDatabase, setMysqlDatabase] = useState('mysql');
  const [showMysqlPassword, setShowMysqlPassword] = useState(false);
  const [isTestingMysql, setIsTestingMysql] = useState(false);
  const [mysqlTestFeedback, setMysqlTestFeedback] = useState<string | null>(null);

  // Windows-specific
  const [winProtocol, setWinProtocol] = useState<'rdp' | 'powershell' | 'winrm' | 'ssh'>('rdp');
  const [winPort, setWinPort] = useState<number | string>(3389);
  const [winDomain, setWinDomain] = useState('');
  const [winUsername, setWinUsername] = useState('Administrator');
  const [winPassword, setWinPassword] = useState('');

  // Hardware specifications (authentic values; auto-detected or manually configured)
  const [cpuCores, setCpuCores] = useState<number | string>('');
  const [ramGb, setRamGb] = useState<number | string>('');
  const [diskGb, setDiskGb] = useState<number | string>('');

  // Track initialization to prevent form reset while user is actively typing
  const initializedServerIdRef = useRef<string | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      initializedServerIdRef.current = null;
      return;
    }

    fetchCategories();

    const currentId = serverToEdit ? serverToEdit.id : '__new__';
    // Only re-populate form when modal opens fresh or a different server was chosen
    if (!wasOpenRef.current || initializedServerIdRef.current !== currentId) {
      wasOpenRef.current = true;
      initializedServerIdRef.current = currentId;

      if (serverToEdit) {
        setName(serverToEdit.name || '');
        setHostname(serverToEdit.hostname || '');
        setIp(serverToEdit.ip || '');
        setOsType(serverToEdit.os_type || 'linux');
        setOsDistro(serverToEdit.os_distro || (serverToEdit.os_type === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'));
        setCategory(serverToEdit.category || 'Infrastructure');
        setEnvironment(serverToEdit.environment || 'Production');
        setDescription(serverToEdit.description || '');
        setTags(Array.isArray(serverToEdit.tags) ? [...serverToEdit.tags] : []);
        setPromptPasswordOnConnect(Boolean(serverToEdit.prompt_password_on_connect));
        setSshPort(serverToEdit.ssh_port || 22);
        setSshUsername(serverToEdit.ssh_username || 'root');
        setSshPassword(serverToEdit.ssh_password || '');
        setDefaultShell(serverToEdit.default_shell || 'bash');
        setWinProtocol(serverToEdit.win_protocol || 'rdp');
        setWinPort(serverToEdit.win_port || (serverToEdit.win_protocol === 'winrm' ? 5985 : 3389));
        setWinDomain(serverToEdit.win_domain || '');
        setWinUsername(serverToEdit.win_username || 'Administrator');
        setWinPassword(serverToEdit.win_password || '');
        setCpuCores(serverToEdit.cpu_cores !== undefined && serverToEdit.cpu_cores !== null ? serverToEdit.cpu_cores : '');
        setRamGb(serverToEdit.ram_gb !== undefined && serverToEdit.ram_gb !== null ? serverToEdit.ram_gb : '');
        setDiskGb(serverToEdit.disk_gb !== undefined && serverToEdit.disk_gb !== null ? serverToEdit.disk_gb : '');

        const wsList = Array.isArray(serverToEdit.installed_web_servers) ? serverToEdit.installed_web_servers : [];
        const dbList = Array.isArray(serverToEdit.installed_databases) ? serverToEdit.installed_databases : [];
        setHasApache(Boolean(serverToEdit.has_apache || wsList.includes('apache')));
        setHasNginx(Boolean(serverToEdit.has_nginx || wsList.includes('nginx')));
        setHasPostgres(Boolean(serverToEdit.has_postgresql || dbList.includes('postgresql')));
        setHasMysql(Boolean(serverToEdit.has_mysql || dbList.includes('mysql') || dbList.includes('mariadb')));
        setPostgresPort(serverToEdit.postgres_port || 5432);
        setPostgresUser(serverToEdit.postgres_user || 'postgres');
        setPostgresDatabase(serverToEdit.postgres_database || 'postgres');
        setPostgresPassword('');
        setShowPostgresPassword(false);
        setMysqlPort(serverToEdit.mysql_port || 3306);
        setMysqlUser(serverToEdit.mysql_user || 'root');
        setMysqlDatabase(serverToEdit.mysql_database || 'mysql');
        setMysqlPassword('');
        setShowMysqlPassword(false);
        setWebHttpPort(serverToEdit.web_http_port || 80);
        setWebHttpsPort(serverToEdit.web_https_port || 443);
        setServerType(serverToEdit.server_type || (serverToEdit.has_postgresql ? 'postgresql' : serverToEdit.has_mysql ? 'mysql' : serverToEdit.has_nginx ? 'nginx' : serverToEdit.has_apache ? 'apache' : serverToEdit.os_type || 'linux'));
      } else {
        // Defaults for new server or service based on initialServiceMode
        setHostname('');
        setIp('');
        setEnvironment('Production');
        setDescription('');
        setPromptPasswordOnConnect(false);
        setSshPort(22);
        setSshUsername('root');
        setSshPassword('');
        setDefaultShell('bash');
        setWinProtocol('rdp');
        setWinPort(3389);
        setWinDomain('');
        setWinUsername('Administrator');
        setWinPassword('');
        setCpuCores('');
        setRamGb('');
        setDiskGb('');
        setPostgresPort(5432);
        setPostgresUser('postgres');
        setPostgresDatabase('postgres');
        setPostgresPassword('');
        setShowPostgresPassword(false);
        setMysqlPort(3306);
        setMysqlUser('root');
        setMysqlDatabase('mysql');
        setMysqlPassword('');
        setShowMysqlPassword(false);
        setWebHttpPort(80);
        setWebHttpsPort(443);

        if (initialServiceMode === 'nginx') {
          setName(isEn ? 'Nginx Web Server' : 'وب‌سرور Nginx');
          setOsType('linux');
          setServerType('nginx');
          setOsDistro('Ubuntu 24.04 LTS');
          setCategory('Web / App');
          setTags(['nginx', 'web-tier']);
          setHasNginx(true);
          setHasApache(false);
          setHasPostgres(false);
          setHasMysql(false);
        } else if (initialServiceMode === 'apache') {
          setName(isEn ? 'Apache HTTP Server' : 'وب‌سرور Apache');
          setOsType('linux');
          setServerType('apache');
          setOsDistro('Ubuntu 24.04 LTS');
          setCategory('Web / App');
          setTags(['apache', 'web-tier']);
          setHasApache(true);
          setHasNginx(false);
          setHasPostgres(false);
          setHasMysql(false);
        } else if (initialServiceMode === 'postgresql') {
          setName(isEn ? 'PostgreSQL Database' : 'پایگاه داده PostgreSQL');
          setOsType('linux');
          setServerType('postgresql');
          setOsDistro('Ubuntu 24.04 LTS');
          setCategory('Database');
          setTags(['postgres', 'database']);
          setHasPostgres(true);
          setHasMysql(false);
          setHasApache(false);
          setHasNginx(false);
        } else if (initialServiceMode === 'mysql') {
          setName(isEn ? 'MySQL Database' : 'پایگاه داده MySQL');
          setOsType('linux');
          setServerType('mysql');
          setOsDistro('Ubuntu 24.04 LTS');
          setCategory('Database');
          setTags(['mysql', 'database']);
          setHasMysql(true);
          setHasPostgres(false);
          setHasApache(false);
          setHasNginx(false);
        } else if (initialServiceMode === 'windows') {
          setName('');
          setOsType('windows');
          setServerType('windows');
          setOsDistro('Windows Server 2022');
          setCategory('Infrastructure');
          setTags(['windows']);
          setHasApache(false);
          setHasNginx(false);
          setHasPostgres(false);
          setHasMysql(false);
        } else {
          setName('');
          setOsType('linux');
          setServerType('linux');
          setOsDistro('Ubuntu 24.04 LTS');
          setCategory('Infrastructure');
          setTags(['prod']);
          setHasApache(false);
          setHasNginx(false);
          setHasPostgres(false);
          setHasMysql(false);
        }
      }
      setShowSshPassword(false);
      setShowWinPassword(false);
      setSaveSshToVault(false);
      setSaveWinToVault(false);
      setSavePostgresToVault(false);
      setSaveMysqlToVault(false);
      setSavingSshVault(false);
      setSshVaultSaved(false);
      setSavingWinVault(false);
      setWinVaultSaved(false);
      setSavingPostgresVault(false);
      setPostgresVaultSaved(false);
      setSavingMysqlVault(false);
      setMysqlVaultSaved(false);
      setVaultFeedbackMsg(null);
      setPostgresTestFeedback(null);
      setMysqlTestFeedback(null);
      setVaultSaveSuccess(null);
      setError(null);
    }
  }, [isOpen, serverToEdit?.id, initialServiceMode]);

  // Handle OS type switch defaults
  const handleOsChange = (type: 'linux' | 'windows') => {
    setOsType(type);
    if (type === 'windows') {
      if (!serverToEdit) {
        setOsDistro('Windows Server 2022');
        setWinPort(3389);
      }
    } else {
      if (!serverToEdit) {
        setOsDistro('Ubuntu 24.04 LTS');
        setSshPort(22);
      }
    }
  };

  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Instant save handlers for personal vault
  const handleInstantSaveSshToVault = async () => {
    if (!sshPassword.trim()) return;
    setSavingSshVault(true);
    setVaultFeedbackMsg(null);
    const targetHostVal = ip.trim() || hostname.trim() || undefined;
    const secretName = `${name.trim() || targetHostVal || 'Linux Server'} (SSH)`;
    const res = await saveSecretToVault({
      name: secretName,
      username: sshUsername.trim() || 'root',
      password: sshPassword.trim(),
      category: 'ssh',
      targetHost: targetHostVal,
      notes: isEn
        ? `Saved from Server Registration: ${name.trim() || targetHostVal || ''}`
        : `ذخیره‌شده از فرم ثبت سرور: ${name.trim() || targetHostVal || ''}`,
      tags: ['server', 'linux', ...(tags.length > 0 ? tags : [])],
    });
    setSavingSshVault(false);
    if (res.success) {
      setSshVaultSaved(true);
      setSaveSshToVault(true);
      setVaultFeedbackMsg({
        text: isEn ? 'Password securely saved to your Personal Vault!' : 'گذرواژه با موفقیت در والت شخصی ذخیره گردید!',
      });
      setTimeout(() => setVaultFeedbackMsg(null), 5000);
    } else {
      setVaultFeedbackMsg({
        text: res.error || (isEn ? 'Failed to save password to vault.' : 'خطا در ذخیره‌سازی گذرواژه در والت.'),
        isError: true,
      });
    }
  };

  const handleInstantSaveWinToVault = async () => {
    if (!winPassword.trim()) return;
    setSavingWinVault(true);
    setVaultFeedbackMsg(null);
    const targetHostVal = ip.trim() || hostname.trim() || undefined;
    const secretName = `${name.trim() || targetHostVal || 'Windows Server'} (${winProtocol.toUpperCase()})`;
    const res = await saveSecretToVault({
      name: secretName,
      username: winUsername.trim() || 'Administrator',
      password: winPassword.trim(),
      category: winProtocol === 'winrm' || winProtocol === 'powershell' ? 'ssh' : 'general',
      targetHost: targetHostVal,
      notes: isEn
        ? `Saved from Windows Server Registration: ${name.trim() || targetHostVal || ''}`
        : `ذخیره‌شده از فرم ثبت سرور ویندوز: ${name.trim() || targetHostVal || ''}`,
      tags: ['server', 'windows', winProtocol, ...(tags.length > 0 ? tags : [])],
    });
    setSavingWinVault(false);
    if (res.success) {
      setWinVaultSaved(true);
      setSaveWinToVault(true);
      setVaultFeedbackMsg({
        text: isEn ? 'Password securely saved to your Personal Vault!' : 'گذرواژه با موفقیت در والت شخصی ذخیره گردید!',
      });
      setTimeout(() => setVaultFeedbackMsg(null), 5000);
    } else {
      setVaultFeedbackMsg({
        text: res.error || (isEn ? 'Failed to save password to vault.' : 'خطا در ذخیره‌سازی گذرواژه در والت.'),
        isError: true,
      });
    }
  };

  const handleInstantSavePostgresToVault = async () => {
    if (!postgresPassword.trim()) return;
    setSavingPostgresVault(true);
    const targetHostVal = ip.trim() || hostname.trim() || undefined;
    const res = await saveSecretToVault({
      name: `${name.trim() || targetHostVal || 'Server'} (PostgreSQL)`,
      username: postgresUser.trim() || 'postgres',
      password: postgresPassword.trim(),
      category: 'database',
      targetHost: targetHostVal,
      notes: isEn
        ? `Saved from Database Registration: ${name.trim() || targetHostVal || ''} (Port ${postgresPort || 5432})`
        : `ذخیره‌شده از فرم ثبت پایگاه داده: ${name.trim() || targetHostVal || ''} (پورت ${postgresPort || 5432})`,
      tags: ['database', 'postgres', ...(tags.length > 0 ? tags : [])],
    });
    setSavingPostgresVault(false);
    if (res.success) {
      setPostgresVaultSaved(true);
      setSavePostgresToVault(true);
    }
  };

  const handleInstantSaveMysqlToVault = async () => {
    if (!mysqlPassword.trim()) return;
    setSavingMysqlVault(true);
    const targetHostVal = ip.trim() || hostname.trim() || undefined;
    const res = await saveSecretToVault({
      name: `${name.trim() || targetHostVal || 'Server'} (MySQL)`,
      username: mysqlUser.trim() || 'root',
      password: mysqlPassword.trim(),
      category: 'database',
      targetHost: targetHostVal,
      notes: isEn
        ? `Saved from Database Registration: ${name.trim() || targetHostVal || ''} (Port ${mysqlPort || 3306})`
        : `ذخیره‌شده از فرم ثبت پایگاه داده: ${name.trim() || targetHostVal || ''} (پورت ${mysqlPort || 3306})`,
      tags: ['database', 'mysql', ...(tags.length > 0 ? tags : [])],
    });
    setSavingMysqlVault(false);
    if (res.success) {
      setMysqlVaultSaved(true);
      setSaveMysqlToVault(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(isEn ? 'Server Name is required.' : 'نام سرور الزامی است.');
      return;
    }
    if (!ip.trim()) {
      setError(isEn ? 'IP Address or FQDN is required.' : 'آدرس IP یا FQDN الزامی است.');
      return;
    }

    setIsSaving(true);
    try {
      const installedWebServers: string[] = [];
      if (hasApache) installedWebServers.push('apache');
      if (hasNginx) installedWebServers.push('nginx');

      const installedDatabases: string[] = [];
      if (hasPostgres) installedDatabases.push('postgresql');
      if (hasMysql) installedDatabases.push('mysql');

      const payload: Partial<RemoteServer> = {
        id: serverToEdit?.id,
        name: name.trim(),
        hostname: hostname.trim() || undefined,
        ip: ip.trim(),
        os_type: osType,
        os_distro: osDistro.trim() || undefined,
        category,
        environment,
        description: description.trim() || undefined,
        notes: description.trim() || undefined,
        tags,
        prompt_password_on_connect: promptPasswordOnConnect,
        installed_web_servers: osType === 'linux' ? installedWebServers : [],
        installed_databases: osType === 'linux' ? installedDatabases : [],
        has_apache: osType === 'linux' ? hasApache : false,
        has_nginx: osType === 'linux' ? hasNginx : false,
        has_postgresql: osType === 'linux' ? hasPostgres : false,
        has_mysql: osType === 'linux' ? hasMysql : false,
        server_type: serverType,
        web_http_port: (hasNginx || hasApache) ? (Number(webHttpPort) || 80) : undefined,
        web_https_port: (hasNginx || hasApache) ? (Number(webHttpsPort) || 443) : undefined,
        postgres_port: hasPostgres && osType === 'linux' ? (Number(postgresPort) || 5432) : undefined,
        postgres_user: hasPostgres && osType === 'linux' ? (postgresUser.trim() || 'postgres') : undefined,
        postgres_password: hasPostgres && osType === 'linux' && postgresPassword.trim() ? postgresPassword.trim() : undefined,
        postgres_database: hasPostgres && osType === 'linux' ? (postgresDatabase.trim() || 'postgres') : undefined,
        mysql_port: hasMysql && osType === 'linux' ? (Number(mysqlPort) || 3306) : undefined,
        mysql_user: hasMysql && osType === 'linux' ? (mysqlUser.trim() || 'root') : undefined,
        mysql_password: hasMysql && osType === 'linux' && mysqlPassword.trim() ? mysqlPassword.trim() : undefined,
        mysql_database: hasMysql && osType === 'linux' ? (mysqlDatabase.trim() || 'mysql') : undefined,
        status: serverToEdit?.status || 'online',
        cpu_cores: cpuCores !== '' && Number(cpuCores) > 0 ? Number(cpuCores) : undefined,
        ram_gb: ramGb !== '' && Number(ramGb) > 0 ? Number(ramGb) : undefined,
        disk_gb: diskGb !== '' && Number(diskGb) > 0 ? Number(diskGb) : undefined,
        ...(osType === 'linux'
          ? {
              ssh_port: Number(sshPort) || 22,
              ssh_username: sshUsername.trim() || 'root',
              ssh_password: promptPasswordOnConnect ? '' : sshPassword,
              default_shell: defaultShell,
            }
          : {
              win_protocol: winProtocol,
              win_port: Number(winPort) || (winProtocol === 'winrm' ? 5985 : 3389),
              win_domain: winDomain.trim() || undefined,
              win_username: winUsername.trim() || 'Administrator',
              win_password: promptPasswordOnConnect ? '' : winPassword,
            }),
      };

      await onSave(payload);

      // Save credentials to personal vault if user opted-in and not already saved
      const shouldSaveSsh = osType === 'linux' && saveSshToVault && !promptPasswordOnConnect && sshPassword.trim() && !sshVaultSaved;
      const shouldSaveWin = osType === 'windows' && saveWinToVault && !promptPasswordOnConnect && winPassword.trim() && !winVaultSaved;

      if (shouldSaveSsh || shouldSaveWin) {
        try {
          const secretPassword = shouldSaveSsh ? sshPassword.trim() : winPassword.trim();
          const secretUsername = shouldSaveSsh ? (sshUsername.trim() || 'root') : (winUsername.trim() || 'Administrator');
          const targetHostVal = ip.trim() || hostname.trim() || undefined;
          const secretCategory = osType === 'linux' ? 'ssh' : (winProtocol === 'winrm' || winProtocol === 'powershell' ? 'ssh' : 'general');
          const secretName = `${name.trim() || targetHostVal || 'Server'} (${osType === 'linux' ? 'SSH' : winProtocol.toUpperCase()})`;

          await saveSecretToVault({
            name: secretName,
            username: secretUsername,
            password: secretPassword,
            category: secretCategory,
            targetHost: targetHostVal,
            notes: isEn
              ? `Auto-saved from Server Registration: ${name.trim()} [${targetHostVal || ''}]`
              : `ذخیره‌سازی خودکار از فرم ثبت سرور: ${name.trim()} [${targetHostVal || ''}]`,
            tags: ['server', osType, ...(tags.length > 0 ? tags : [])],
          });
        } catch (vaultErr) {
          console.warn('Could not auto-save password to vault:', vaultErr);
        }
      }

      // Save PostgreSQL credentials to vault if opted-in
      if (hasPostgres && savePostgresToVault && postgresPassword.trim() && !postgresVaultSaved) {
        try {
          const targetHostVal = ip.trim() || hostname.trim() || undefined;
          await saveSecretToVault({
            name: `${name.trim() || targetHostVal || 'Server'} (PostgreSQL)`,
            username: postgresUser.trim() || 'postgres',
            password: postgresPassword.trim(),
            category: 'database',
            targetHost: targetHostVal,
            notes: isEn
              ? `Auto-saved from Database Registration: ${name.trim()} (Port ${postgresPort || 5432})`
              : `ذخیره‌سازی خودکار از فرم ثبت پایگاه داده: ${name.trim()} (پورت ${postgresPort || 5432})`,
            tags: ['database', 'postgres', ...(tags.length > 0 ? tags : [])],
          });
        } catch (vaultErr) {
          console.warn('Could not auto-save postgres password to vault:', vaultErr);
        }
      }

      // Save MySQL credentials to vault if opted-in
      if (hasMysql && saveMysqlToVault && mysqlPassword.trim() && !mysqlVaultSaved) {
        try {
          const targetHostVal = ip.trim() || hostname.trim() || undefined;
          await saveSecretToVault({
            name: `${name.trim() || targetHostVal || 'Server'} (MySQL)`,
            username: mysqlUser.trim() || 'root',
            password: mysqlPassword.trim(),
            category: 'database',
            targetHost: targetHostVal,
            notes: isEn
              ? `Auto-saved from Database Registration: ${name.trim()} (Port ${mysqlPort || 3306})`
              : `ذخیره‌سازی خودکار از فرم ثبت پایگاه داده: ${name.trim()} (پورت ${mysqlPort || 3306})`,
            tags: ['database', 'mysql', ...(tags.length > 0 ? tags : [])],
          });
        } catch (vaultErr) {
          console.warn('Could not auto-save mysql password to vault:', vaultErr);
        }
      }

      onClose();
    } catch (err: any) {
      setError(err.message || (isEn ? 'Failed to save server.' : 'خطا در ذخیره سرور.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed z-[9999] flex flex-col items-center justify-center ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0'
          : 'inset-0 p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl my-auto ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-2xl max-h-[94vh] sm:max-h-[90vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-900/20'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Universal Triad Controls & Lock */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-2.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg border ${
                osType === 'linux'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
              }`}
            >
              {osType === 'linux' ? <Terminal className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">
                  {serverToEdit
                    ? isEn
                      ? `Edit Server: ${serverToEdit.name}`
                      : `ویرایش سرور ریموت: ${serverToEdit.name}`
                    : isEn
                    ? 'Register Remote Server'
                    : 'ثبت سرور ریموت جدید'}
                </h3>
                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                    osType === 'linux'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  }`}
                >
                  {osType.toUpperCase()}
                </span>
              </div>
              <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Configure remote node access, credentials, environment, and automation tags'
                  : 'پیکربندی آدرس دسترسی، احراز هویت، محیط استقرار و تگ‌های اتوماسیون'}
              </p>
            </div>
          </div>

          {/* Triad Control Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Dock' : 'مینیمایز به نوار ابزار'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 hover:bg-rose-100 text-rose-600'
                  : 'border-slate-800 hover:bg-rose-950/50 text-rose-400 hover:text-rose-300'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body - Compact & Sleek Layout */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* OS Selector Tabs - Compact segmented cards */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {isEn ? 'Architecture & Operating System' : 'معماری و سیستم‌عامل سرور'}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Operating System' : 'سیستم عامل'}
                  whatIsIt={
                    isEn
                      ? 'Determines communication protocol, terminal shells (Bash/Zsh), and remote access features.'
                      : 'پروتکل ارتباطی، خط فرمان‌های لینوکسی (Bash/Zsh) و دسترسی ریموت را مشخص می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Allows tailored automation triggers, SSH shell launchers for Linux and RDP/PowerShell workflows for Windows.'
                      : 'امکان اتصال به شل‌های لینوکسی و اتوماسیون‌های ویندوزی بر اساس سیستم‌عامل را فراهم می‌سازد.'
                  }
                  example={isEn ? 'Linux (Ubuntu/RHEL) or Windows Server' : 'لینوکس یا ویندوز سرور'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleOsChange('linux')}
                className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  osType === 'linux'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30 shadow-xs'
                    : isLightMode
                    ? 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
                  <Terminal className="w-4 h-4" />
                </div>
                <div className="text-start">
                  <div className="font-bold">{isEn ? 'Linux Server' : 'سرور لینوکسی'}</div>
                  <div className="text-[10px] opacity-75 font-mono">SSH • Bash • Zsh</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleOsChange('windows')}
                className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  osType === 'windows'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30 shadow-xs'
                    : isLightMode
                    ? 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="text-start">
                  <div className="font-bold">{isEn ? 'Windows Server' : 'سرور ویندوزی'}</div>
                  <div className="text-[10px] opacity-75 font-mono">RDP • PowerShell • WinRM</div>
                </div>
              </button>
            </div>

            {/* Linux Web Server & Database Stack Checkboxes */}
            {osType === 'linux' && (
              <div
                className={`p-2.5 rounded-xl border space-y-2 mt-2 transition-all ${
                  isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800/90'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{isEn ? 'Installed Services & Engines' : 'سرویس‌ها و موتورهای نصب‌شده'}</span>
                    </span>
                    <FieldInfoTooltip
                      title={isEn ? 'Web Server & Database Engines' : 'وب‌سرورها و پایگاه‌های داده'}
                      whatIsIt={
                        isEn
                          ? 'Identifies installed web servers (Apache, Nginx) and database engines (PostgreSQL, MySQL/MariaDB) running on this Linux host.'
                          : 'مشخص‌کننده سرویس‌های وب‌سرور (آپاچی یا انجین‌ایکس) و موتورهای پایگاه داده (پستگرس یا مای‌اس‌کیوال/ماریا‌دی‌بی) فعال روی این سرور لینوکس.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Enables tailored service status inspection, watchdog rule configuration, database query routing, and automated dashboard badges.'
                          : 'امکان پایش وضعیت سرویس‌ها، واچ‌داگ خودکار، مسیریابی کوئری‌ها و نمایش بج‌های تفکیکی در لیست سرورها را فراهم می‌سازد.'
                      }
                      example={isEn ? 'Nginx + PostgreSQL or Apache + MySQL' : 'Nginx + PostgreSQL یا Apache + MySQL'}
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {isEn ? 'Linux Stack Selection' : 'انتخاب استک لینوکس'}
                  </span>
                </div>

                {/* Web Servers Group */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                    <Globe className="w-3 h-3 text-cyan-400" />
                    <span>{isEn ? 'Web Server (HTTP / Reverse Proxy):' : 'وب‌سرور (HTTP / Reverse Proxy):'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Apache Checkbox */}
                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                        hasApache
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
                          : isLightMode
                          ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={hasApache}
                        onChange={(e) => setHasApache(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          hasApache
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : isLightMode
                            ? 'border-slate-300 bg-slate-50'
                            : 'border-slate-700 bg-slate-950'
                        }`}
                      >
                        {hasApache && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="font-semibold text-xs flex items-center gap-1">
                          <span>{isEn ? 'Apache' : 'آپاچی (Apache)'}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            httpd
                          </span>
                        </div>
                        <span className="text-[10px] opacity-70 truncate font-mono">
                          {isEn ? 'Apache2 / HTTP Server' : 'وب‌سرور آپاچی'}
                        </span>
                      </div>
                    </label>

                    {/* Nginx Checkbox */}
                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                        hasNginx
                          ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/20'
                          : isLightMode
                          ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={hasNginx}
                        onChange={(e) => setHasNginx(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          hasNginx
                            ? 'bg-cyan-500 border-cyan-500 text-white'
                            : isLightMode
                            ? 'border-slate-300 bg-slate-50'
                            : 'border-slate-700 bg-slate-950'
                        }`}
                      >
                        {hasNginx && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="font-semibold text-xs flex items-center gap-1">
                          <span>{isEn ? 'Nginx' : 'انجین‌ایکس (Nginx)'}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            proxy
                          </span>
                        </div>
                        <span className="text-[10px] opacity-70 truncate font-mono">
                          {isEn ? 'Reverse Proxy / Web Server' : 'وب‌سرور و پروکسی معکوس'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Database Engines Group */}
                <div className="space-y-1 pt-1.5 border-t border-slate-700/20">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                    <Database className="w-3 h-3 text-emerald-400" />
                    <span>{isEn ? 'Database Engine (RDBMS):' : 'موتور پایگاه داده (دیتابیس):'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* PostgreSQL Checkbox */}
                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                        hasPostgres
                          ? 'border-blue-500/60 bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/20'
                          : isLightMode
                          ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={hasPostgres}
                        onChange={(e) => setHasPostgres(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          hasPostgres
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : isLightMode
                            ? 'border-slate-300 bg-slate-50'
                            : 'border-slate-700 bg-slate-950'
                        }`}
                      >
                        {hasPostgres && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="font-semibold text-xs flex items-center gap-1">
                          <span>{isEn ? 'PostgreSQL' : 'پستگرس (PostgreSQL)'}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            pgsql
                          </span>
                        </div>
                        <span className="text-[10px] opacity-70 truncate font-mono">
                          {isEn ? 'Port 5432 • Postgres' : 'پورت ۵۴۳۲ • پستگرس'}
                        </span>
                      </div>
                    </label>

                    {/* MySQL / MariaDB Checkbox */}
                    <label
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                        hasMysql
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20'
                          : isLightMode
                          ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={hasMysql}
                        onChange={(e) => setHasMysql(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          hasMysql
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : isLightMode
                            ? 'border-slate-300 bg-slate-50'
                            : 'border-slate-700 bg-slate-950'
                        }`}
                      >
                        {hasMysql && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="font-semibold text-xs flex items-center gap-1">
                          <span>{isEn ? 'MySQL / MariaDB' : 'مای‌اس‌کیوال (MySQL / MariaDB)'}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            mysql
                          </span>
                        </div>
                        <span className="text-[10px] opacity-70 truncate font-mono">
                          {isEn ? 'Port 3306 • MariaDB' : 'پورت ۳۳۰۶ • ماریا دی‌بی'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* PostgreSQL Specific Connection Parameters (Phase 1) */}
                {hasPostgres && (
                  <div
                    className={`p-3 rounded-xl border space-y-2 mt-2 transition-all ${
                      isLightMode
                        ? 'bg-blue-50/80 border-blue-200 text-slate-800'
                        : 'bg-blue-950/25 border-blue-500/30 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-blue-400" />
                        <span className={`text-[11px] font-bold ${isLightMode ? 'text-blue-950' : 'text-blue-300'}`}>
                          {isEn ? 'PostgreSQL Connection Parameters' : 'تنظیمات اتصال به PostgreSQL'}
                        </span>
                        <FieldInfoTooltip
                          title={isEn ? 'PostgreSQL Credentials & Port' : 'مشخصات احراز هویت و پورت PostgreSQL'}
                          whatIsIt={
                            isEn
                              ? 'Connection credentials (username, password, port) used by the panel backend to connect directly to PostgreSQL.'
                              : 'مشخصات اتصال (نام کاربری، کلمه عبور و پورت) که توسط بک‌اند پنل جهت اتصال مستقیم به پایگاه داده PostgreSQL سرور استفاده می‌شود.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Required for Phase 1 connection validation, database discovery, telemetry, and PostgreSQL Management.'
                              : 'برای اعتبارسنجی اتصال، پایش وضعیت و باز کردن پنجره مدیریت PostgreSQL الزامی است.'
                          }
                          example={isEn ? 'User: postgres, Port: 5432' : 'نام کاربری: postgres، پورت: ۵۴۳۲'}
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-blue-400">
                        {serverToEdit?.ip || ip || 'Host IP'}:{postgresPort || 5432}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                      {/* Username */}
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'Username' : 'نام کاربری'}
                        </label>
                        <input
                          type="text"
                          value={postgresUser}
                          onChange={(e) => setPostgresUser(e.target.value)}
                          placeholder="postgres"
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                              : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-400'
                          }`}
                        />
                      </div>
                      {/* Password */}
                      <div className="space-y-1 sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <label className={`block text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                            {isEn ? 'Password' : 'رمز عبور'}
                          </label>
                          {serverToEdit?.postgres_password_set && (
                            <span className="text-[10px] text-emerald-400 font-mono">
                              ({isEn ? 'Saved' : 'ذخیره‌شده'})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <input
                              type={showPostgresPassword ? 'text' : 'password'}
                              value={postgresPassword}
                              onChange={(e) => setPostgresPassword(e.target.value)}
                              placeholder={
                                serverToEdit?.postgres_password_set
                                  ? (isEn ? '•••••••• (Keep existing)' : '•••••••• (حفظ رمز فعلی)')
                                  : (isEn ? 'Enter password' : 'رمز عبور را وارد کنید')
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors pr-8 ${
                                isLightMode
                                  ? 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                                  : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-400'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPostgresPassword(!showPostgresPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
                              title={showPostgresPassword ? (isEn ? 'Hide' : 'مخفی کردن') : (isEn ? 'Show' : 'نمایش')}
                            >
                              {showPostgresPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setVaultPickerTarget('postgres');
                              setIsVaultPickerOpen(true);
                            }}
                            className="px-2 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-medium flex items-center gap-1 shrink-0 transition cursor-pointer"
                            title={isEn ? 'Pick password from Vault' : 'انتخاب رمز از والت'}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span className="text-[10px] hidden sm:inline">{isEn ? 'Vault' : 'والت'}</span>
                          </button>
                        </div>
                      </div>
                      {/* Port */}
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'Port' : 'پورت'}
                        </label>
                        <input
                          type="number"
                          value={postgresPort}
                          onChange={(e) => setPostgresPort(e.target.value)}
                          placeholder="5432"
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                              : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-400'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-slate-300">
                          {isEn ? 'Database Name:' : 'نام پایگاه‌داده:'}
                        </label>
                        <input
                          type="text"
                          value={postgresDatabase}
                          onChange={(e) => setPostgresDatabase(e.target.value)}
                          placeholder="postgres"
                          className={`w-28 px-2 py-1 rounded border text-xs font-mono ${
                            isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                          }`}
                        />
                      </div>

                      {postgresPassword.trim().length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleInstantSavePostgresToVault}
                            disabled={savingPostgresVault}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition shadow-sm ${
                              postgresVaultSaved
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30'
                            }`}
                            title={isEn ? 'Save password to Vault in database' : 'ذخیره این رمز در ولت پایگاه‌داده'}
                          >
                            {savingPostgresVault ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                            ) : postgresVaultSaved ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <BookmarkPlus className="w-3 h-3 text-blue-400" />
                            )}
                            <span>
                              {postgresVaultSaved
                                ? isEn
                                  ? 'Saved to Vault!'
                                  : 'در والت ذخیره شد!'
                                : isEn
                                ? 'Save this password to Vault'
                                : 'ذخیره این رمز در والت شخصی'}
                            </span>
                          </button>

                          <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer text-slate-400">
                            <input
                              type="checkbox"
                              checked={savePostgresToVault}
                              onChange={(e) => setSavePostgresToVault(e.target.checked)}
                              className="rounded accent-blue-500"
                            />
                            <span>{isEn ? 'Auto-save' : 'ذخیره خودکار'}</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* MySQL / MariaDB Specific Connection Parameters */}
                {hasMysql && (
                  <div
                    className={`p-3 rounded-xl border space-y-2 mt-2 transition-all ${
                      isLightMode
                        ? 'bg-amber-50/80 border-amber-200 text-slate-800'
                        : 'bg-amber-950/25 border-amber-500/30 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-amber-400" />
                        <span className={`text-[11px] font-bold ${isLightMode ? 'text-amber-950' : 'text-amber-300'}`}>
                          {isEn ? 'MySQL / MariaDB Connection Parameters' : 'تنظیمات اتصال به MySQL / MariaDB'}
                        </span>
                        <FieldInfoTooltip
                          title={isEn ? 'MySQL Credentials & Port' : 'مشخصات اتصال و پورت MySQL'}
                          whatIsIt={
                            isEn
                              ? 'Credentials (username, password, port 3306) used to connect directly to the MySQL database engine.'
                              : 'مشخصات احراز هویت (نام کاربری، کلمه عبور و پورت ۳۳۰۶) جهت اتصال مستقیم به موتور MySQL.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Required for database management, query execution, process list monitoring, and status overview.'
                              : 'برای باز کردن پنل مدیریت MySQL، اجرای کوئری و پایش پروسس‌ها الزامی است.'
                          }
                          example={isEn ? 'User: root, Port: 3306, Database: mysql' : 'کاربر: root، پورت: ۳۳۰۶، دیتابیس: mysql'}
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-amber-400">
                        {serverToEdit?.ip || ip || 'Host IP'}:{mysqlPort || 3306}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                      {/* Username */}
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'Username' : 'نام کاربری'}
                        </label>
                        <input
                          type="text"
                          value={mysqlUser}
                          onChange={(e) => setMysqlUser(e.target.value)}
                          placeholder="root"
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-800 focus:border-amber-500'
                              : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-400'
                          }`}
                        />
                      </div>

                      {/* Password with Vault picker */}
                      <div className="space-y-1 sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <label className={`block text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                            {isEn ? 'Password' : 'رمز عبور'}
                          </label>
                          {serverToEdit?.mysql_password_set && (
                            <span className="text-[10px] text-emerald-400 font-mono">
                              ({isEn ? 'Saved' : 'ذخیره‌شده'})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <input
                              type={showMysqlPassword ? 'text' : 'password'}
                              value={mysqlPassword}
                              onChange={(e) => setMysqlPassword(e.target.value)}
                              placeholder={
                                serverToEdit?.mysql_password_set
                                  ? (isEn ? '•••••••• (Keep existing)' : '•••••••• (حفظ رمز فعلی)')
                                  : (isEn ? 'Enter MySQL password' : 'رمز عبور MySQL را وارد کنید')
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors pr-8 ${
                                isLightMode
                                  ? 'bg-white border-slate-300 text-slate-800 focus:border-amber-500'
                                  : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-400'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowMysqlPassword(!showMysqlPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
                              title={showMysqlPassword ? (isEn ? 'Hide' : 'مخفی') : (isEn ? 'Show' : 'نمایش')}
                            >
                              {showMysqlPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {/* Pick from Vault button */}
                          <button
                            type="button"
                            onClick={() => {
                              setVaultPickerTarget('mysql');
                              setIsVaultPickerOpen(true);
                            }}
                            className="px-2 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-1 shrink-0 transition cursor-pointer"
                            title={isEn ? 'Pick password from Vault' : 'انتخاب رمز از والت'}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span className="text-[10px] hidden sm:inline">{isEn ? 'Vault' : 'والت'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Port */}
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'Port' : 'پورت'}
                        </label>
                        <input
                          type="number"
                          value={mysqlPort}
                          onChange={(e) => setMysqlPort(e.target.value)}
                          placeholder="3306"
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-800 focus:border-amber-500'
                              : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-400'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Database & Save to Vault */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-slate-300">
                          {isEn ? 'Default DB:' : 'دیتابیس پیش‌فرض:'}
                        </label>
                        <input
                          type="text"
                          value={mysqlDatabase}
                          onChange={(e) => setMysqlDatabase(e.target.value)}
                          placeholder="mysql"
                          className={`w-28 px-2 py-1 rounded border text-xs font-mono ${
                            isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                          }`}
                        />
                      </div>

                      {mysqlPassword.trim().length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleInstantSaveMysqlToVault}
                            disabled={savingMysqlVault}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition shadow-sm ${
                              mysqlVaultSaved
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                            title={isEn ? 'Save password to Vault in database' : 'ذخیره این رمز در ولت پایگاه‌داده'}
                          >
                            {savingMysqlVault ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                            ) : mysqlVaultSaved ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <BookmarkPlus className="w-3 h-3 text-amber-400" />
                            )}
                            <span>
                              {mysqlVaultSaved
                                ? isEn
                                  ? 'Saved to Vault!'
                                  : 'در والت ذخیره شد!'
                                : isEn
                                ? 'Save this password to Vault'
                                : 'ذخیره این رمز در والت شخصی'}
                            </span>
                          </button>

                          <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer text-slate-400">
                            <input
                              type="checkbox"
                              checked={saveMysqlToVault}
                              onChange={(e) => setSaveMysqlToVault(e.target.checked)}
                              className="rounded accent-amber-500"
                            />
                            <span>{isEn ? 'Auto-save' : 'ذخیره خودکار'}</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Web Server HTTP/HTTPS Ports if Nginx or Apache selected */}
                {(hasNginx || hasApache) && (
                  <div
                    className={`p-3 rounded-xl border space-y-2 mt-2 transition-all ${
                      isLightMode
                        ? 'bg-emerald-50/80 border-emerald-200 text-slate-800'
                        : 'bg-emerald-950/25 border-emerald-500/30 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-emerald-400" />
                        <span className={`text-[11px] font-bold ${isLightMode ? 'text-emerald-950' : 'text-emerald-300'}`}>
                          {isEn ? 'Web Server Ports Configuration' : 'پورت‌های سرویس وب‌سرور'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'HTTP Port' : 'پورت HTTP'}
                        </label>
                        <input
                          type="number"
                          value={webHttpPort}
                          onChange={(e) => setWebHttpPort(e.target.value)}
                          placeholder="80"
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                            isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'HTTPS (SSL) Port' : 'پورت HTTPS'}
                        </label>
                        <input
                          type="number"
                          value={webHttpsPort}
                          onChange={(e) => setWebHttpsPort(e.target.value)}
                          placeholder="443"
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                            isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* General Server Details Card */}
          <div
            className={`p-3 rounded-xl border space-y-2.5 ${
              isLightMode ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'General Host Information' : 'مشخصات اصلی میزبان'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {/* Server Name */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="font-semibold text-slate-300">
                    {isEn ? 'Server Name *' : 'نام سرور *'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Server Display Name' : 'نام نمایشی سرور'}
                    whatIsIt={isEn ? 'Friendly descriptive label for the server in inventory.' : 'نام مشخص و قابل فهم سرور در فهرست موجودی.'}
                    whyNeeded={isEn ? 'Easily identify servers in dashboard, automation scripts, and logs.' : 'شناسایی آسان سرور در داشبورد، اتوماسیون و لاگ‌ها.'}
                    example={isEn ? 'K8s Master 01, DB-PostgreSQL-Prod, DC-Corp-01' : 'سرور دیتابیس، کنترلر کوبرنتیز'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isEn ? 'e.g. K8s-Control-Plane-01' : 'مثال: سرور مرکزی دیتابیس'}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                  required
                />
              </div>

              {/* IP Address */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="font-semibold text-slate-300">
                    {isEn ? 'IP Address / Hostname *' : 'آدرس IP یا FQDN *'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Management IP' : 'آدرس آی‌پی مدیریتی'}
                    whatIsIt={isEn ? 'IPv4, IPv6, or resolvable DNS name used for connectivity.' : 'آدرس IPv4 یا هاست‌نیم شبکه جهت برقراری اتصال ریموت.'}
                    whyNeeded={isEn ? 'Target address for remote connection and reachability probes.' : 'مقصد اتصال شل، ریموت دسکتاپ و پایش سلامت پورت.'}
                    example="192.168.10.50, 10.0.100.22, srv01.lan"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="192.168.10.50"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                  required
                />
              </div>

              {/* FQDN / Hostname */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="font-semibold text-slate-300">
                    {isEn ? 'Internal Hostname (FQDN)' : 'نام هاست داخلی (FQDN)'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Hostname / FQDN' : 'نام هاست'}
                    whatIsIt={isEn ? 'Fully qualified domain name of the machine.' : 'نام کامل سیستم در شبکه و دامین داخلی.'}
                    whyNeeded={isEn ? 'Useful for Kerberos, SSL/TLS, and automated DNS targeting.' : 'کاربرد در احراز هویت کربروس و هدایت نام‌ها.'}
                    example="srv-k8s-cp01.prod.corp"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="node-01.infra.local"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* OS Distro */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="font-semibold text-slate-300">
                    {isEn ? 'OS Distribution / Release' : 'نسخه و توزیع سیستم‌عامل'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'OS Distribution' : 'نسخه توزیع'}
                    whatIsIt={isEn ? 'Operating system distribution release name.' : 'نام دقیق توزیع لینوکس یا نسخه ویندوز.'}
                    whyNeeded={isEn ? 'Assists automation engines in selecting package managers (apt, yum, dnf, winget).' : 'کمک به موتورهای اتوماسیون در تشخیص پکیج منیجر.'}
                    example={osType === 'linux' ? 'Ubuntu 24.04 LTS, Debian 12, RHEL 9' : 'Windows Server 2022, Windows 11 Pro'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={osDistro}
                  onChange={(e) => setOsDistro(e.target.value)}
                  placeholder={osType === 'linux' ? 'Ubuntu 24.04 LTS' : 'Windows Server 2022 Standard'}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="font-semibold text-slate-300">
                      {isEn ? 'Category / Role' : 'دسته‌بندی سرور'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Server Category' : 'دسته‌بندی سرور'}
                      whatIsIt={
                        isEn
                          ? 'Logical grouping for assigning this server to an operational fleet tier.'
                          : 'دسته‌بندی منطقی و عملیاتی جهت تفکیک و گروه‌بندی این سرور در ناوگان.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Enables role-based filtering, quick search, and category-level policy management.'
                          : 'امکان فیلتر سریع بر اساس نقش و دسته‌بندی و مدیریت یکپارچه سرورها را فراهم می‌کند.'
                      }
                      example={isEn ? 'Database, Kubernetes, Infrastructure' : 'پایگاه داده، کوبرنتیز، زیرساخت'}
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsManageCategoriesOpen(true)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <FolderTree className="w-3 h-3" />
                    <span>{isEn ? 'Manage' : 'مدیریت دسته‌ها'}</span>
                  </button>
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                >
                  {dynamicCategories.length > 0
                    ? dynamicCategories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {isEn ? cat.name : cat.name_fa || cat.name}
                        </option>
                      ))
                    : SERVER_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                </select>
              </div>

              {/* Environment */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">
                  {isEn ? 'Deployment Environment' : 'محیط استقرار'}
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                >
                  {ENVIRONMENTS.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Hardware Specifications (Authentic CPU, RAM, and Disk) */}
            <div className="mt-3 pt-3 border-t border-slate-700/40">
              <div className="text-[11px] font-bold tracking-wider uppercase text-cyan-400 mb-2 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'Hardware Specifications (Authentic or Manual)' : 'مشخصات سخت‌افزاری سرور (واقعی یا دستی)'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* CPU Cores */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <label className="font-medium text-xs text-slate-300">
                      {isEn ? 'CPU Cores (vCPU)' : 'هسته‌های پردازنده (vCPU)'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'vCPU Cores' : 'هسته‌های پردازنده'}
                      whatIsIt={isEn ? 'Total number of virtual or physical CPU cores.' : 'تعداد کل هسته‌های پردازشی مجازی یا فیزیکی سرور.'}
                      whyNeeded={isEn ? 'Accurately displays compute capacity on dashboards and monitors load balance.' : 'نمایش دقیق ظرفیت پردازشی در داشبورد و پایش توازن بار.'}
                      example="2, 4, 8, 16"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="512"
                    value={cpuCores}
                    onChange={(e) => setCpuCores(e.target.value)}
                    placeholder={isEn ? 'Auto-detected / e.g. 4' : 'تشخیص خودکار / مثال: ۴'}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none transition-all ${
                      isLightMode
                        ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                        : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                    }`}
                  />
                </div>

                {/* RAM (GB) */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <label className="font-medium text-xs text-slate-300">
                      {isEn ? 'Memory RAM (GB)' : 'حافظه رم (GB)'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Total RAM' : 'حافظه رم کل'}
                      whatIsIt={isEn ? 'Total system RAM in Gigabytes.' : 'میزان کل حافظه رم سرور بر حسب گیگابایت.'}
                      whyNeeded={isEn ? 'Evaluates memory footprint and prevents out-of-memory crashes.' : 'سنجش ظرفیت رم و جلوگیری از کمبود حافظه سرور.'}
                      example="4, 8, 16, 32, 64"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="2048"
                    value={ramGb}
                    onChange={(e) => setRamGb(e.target.value)}
                    placeholder={isEn ? 'Auto-detected / e.g. 16' : 'تشخیص خودکار / مثال: ۱۶'}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none transition-all ${
                      isLightMode
                        ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                        : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                    }`}
                  />
                </div>

                {/* Disk (GB) */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <label className="font-medium text-xs text-slate-300">
                      {isEn ? 'Disk Storage (GB)' : 'حجم کل دیسک (GB)'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Disk Storage Capacity' : 'حجم دیسک ذخیره‌سازی'}
                      whatIsIt={isEn ? 'Real authentic disk capacity in GB without hardcoded defaults.' : 'حجم واقعی حافظه ذخیره‌سازی بر حسب گیگابایت بدون هیچ مقدار فرضی.'}
                      whyNeeded={isEn ? 'Displays authentic server disk size instead of incorrect 250 GB default.' : 'نمایش اندازه دقیق دیسک سرور به جای مقدار نادرست ۲۵۰ گیگابایت.'}
                      example="40, 80, 120, 500, 1000"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    value={diskGb}
                    onChange={(e) => setDiskGb(e.target.value)}
                    placeholder={isEn ? 'Auto-detected / e.g. 100' : 'تشخیص خودکار / مثال: ۱۰۰'}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none transition-all ${
                      isLightMode
                        ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                        : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                    }`}
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                {isEn
                  ? '💡 If left empty, hardware specs are discovered automatically when Keepalive or SSH connects to the server.'
                  : '💡 در صورت خالی گذاشتن، مشخصات سخت‌افزار به صورت خودکار در اتصال Keepalive یا SSH از سرور استخراج می‌شود.'}
              </p>
            </div>
          </div>

          {/* Zero-Storage Security Policy Toggle */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
              promptPasswordOnConnect
                ? isLightMode
                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                  : 'bg-amber-950/20 border-amber-500/35 text-amber-200'
                : isLightMode
                ? 'bg-slate-50 border-slate-200'
                : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  promptPasswordOnConnect
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold">
                    {isEn ? 'Prompt for password at connection time' : 'عدم ذخیره رمز عبور (درخواست در زمان اتصال)'}
                  </span>
                  <FieldInfoTooltip
                    title={isEn ? 'Zero-Storage Credential Policy' : 'سیاست عدم ذخیره‌سازی گذرواژه'}
                    whatIsIt={
                      isEn
                        ? 'Instructs the system to NEVER store or persist this server password in the database or filesystem.'
                        : 'تنظیم امنیتی برای عدم ذخیره‌سازی همیشگی رمز عبور این سرور در دیتابیس یا فایل‌های سامانه.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Required for high-security environments, PCI-DSS compliance, or shared administrative workstations.'
                        : 'جهت انطباق با الزامات امنیتی حساس، سرورهای بحرانی و جلوگیری از افشای گذرواژه‌های ممتاز.'
                    }
                    example={
                      isEn
                        ? 'A lightweight prompt asks for the password when launching RDP/VNC or SSH console, then immediately discards it after session ends.'
                        : 'هنگام فشردن دکمه ریموت دسکتاپ، VNC یا ترمینال، کادر ورود موقت باز شده و پس از قطع ارتباط بلافاصله دور ریخته می‌شود.'
                    }
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                  {promptPasswordOnConnect && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {isEn ? 'ZERO-STORAGE' : 'بدون ذخیره‌سازی'}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  {isEn
                    ? 'Password will not be saved. You will be prompted to authenticate interactively on each connection.'
                    : 'رمز عبور در سامانه ذخیره نمی‌شود. در هر بار اتصال، پنجره موقت ورود رمز نمایش داده می‌شود.'}
                </p>
              </div>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={promptPasswordOnConnect}
              onClick={() => {
                const next = !promptPasswordOnConnect;
                setPromptPasswordOnConnect(next);
                if (next) {
                  setSshPassword('');
                  setWinPassword('');
                }
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                promptPasswordOnConnect ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  promptPasswordOnConnect ? (isEn ? 'translate-x-4' : '-translate-x-4') : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* OS-Specific Connection & Shell Credentials */}
          {osType === 'linux' ? (
            <div
              className={`p-3 rounded-xl border space-y-2.5 ${
                isLightMode ? 'bg-emerald-50/40 border-emerald-200/70' : 'bg-emerald-950/15 border-emerald-900/40'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5" />
                <span>{isEn ? 'Linux SSH & Terminal Credentials' : 'تنظیمات اتصال SSH و شل لینوکس'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {/* SSH Port */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'SSH Port' : 'پورت SSH'}</label>
                  <input
                    type="number"
                    value={sshPort === 0 ? '' : sshPort}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSshPort(val === '' ? 0 : Number(val));
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>

                {/* SSH Username */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Username' : 'نام کاربری'}</label>
                  <input
                    type="text"
                    value={sshUsername}
                    onChange={(e) => setSshUsername(e.target.value)}
                    placeholder="root / ubuntu"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>

                {/* Default Shell: Bash or Zshell */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Default Shell' : 'شل پیش‌فرض'}</label>
                  <select
                    value={defaultShell}
                    onChange={(e) => setDefaultShell(e.target.value as any)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  >
                    <option value="bash">Bash (/bin/bash)</option>
                    <option value="zsh">Zshell (/bin/zsh)</option>
                    <option value="sh">POSIX sh (/bin/sh)</option>
                  </select>
                </div>
              </div>

              {/* SSH Password / Auth Key */}
              <div className="space-y-1 text-xs">
                <label className="font-medium text-slate-300 flex items-center justify-between">
                  <span>{isEn ? 'SSH Password / Private Key Passphrase' : 'رمز عبور SSH / کلید خصوصی'}</span>
                  <div className="flex items-center gap-2">
                    {!promptPasswordOnConnect && (
                      <button
                        type="button"
                        onClick={() => {
                          setVaultPickerTarget('ssh');
                          setIsVaultPickerOpen(true);
                        }}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-normal transition px-1.5 py-0.5 rounded hover:bg-cyan-500/10 cursor-pointer"
                        title={isEn ? 'Select secret from your personal vault' : 'انتخاب رمز از ولت شخصی شما'}
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>{isEn ? 'Choose from Vault' : 'انتخاب از ولت شخصی'}</span>
                      </button>
                    )}
                    {promptPasswordOnConnect && (
                      <span className="text-[10px] text-amber-400 font-normal">
                        {isEn ? 'Disabled (On-Demand Auth)' : 'غیرفعال (احراز در لحظه)'}
                      </span>
                    )}
                  </div>
                </label>

                {promptPasswordOnConnect ? (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                      isLightMode
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                    }`}
                  >
                    <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      {isEn
                        ? 'Zero-storage active: Password will be requested when connecting to SSH terminal.'
                        : 'سیاست عدم ذخیره‌سازی فعال است: رمز عبور هنگام اتصال به کنسول SSH درخواست خواهد شد.'}
                    </span>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type={showSshPassword ? 'text' : 'password'}
                      value={sshPassword}
                      onChange={(e) => setSshPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoComplete="new-password"
                      spellCheck={false}
                      className={`w-full px-2.5 py-1.5 pr-8 rounded-lg border text-xs font-mono outline-none ${
                        isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSshPassword(!showSshPassword)}
                      title={showSshPassword ? (isEn ? 'Hide password' : 'مخفی‌سازی رمز') : (isEn ? 'Show password' : 'نمایش رمز')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition p-1 cursor-pointer"
                    >
                      {showSshPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                {/* Save to Personal Vault prompt and instant button */}
                {!promptPasswordOnConnect && sshPassword.trim().length > 0 && (
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleInstantSaveSshToVault}
                      disabled={savingSshVault}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition shadow-sm ${
                        sshVaultSaved
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : isLightMode
                          ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                          : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-200'
                      }`}
                      title={isEn ? 'Save this password directly to your personal vault in database' : 'ذخیره آنی این رمز در ولت پایگاه‌داده'}
                    >
                      {savingSshVault ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      ) : sshVaultSaved ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <BookmarkPlus className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span>
                        {sshVaultSaved
                          ? isEn
                            ? 'Saved to Personal Vault!'
                            : 'در والت شخصی ذخیره شد!'
                          : isEn
                          ? 'Save this password to your Personal Vault'
                          : 'ذخیره این رمز در والت شخصی'}
                      </span>
                    </button>

                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={saveSshToVault}
                        onChange={(e) => setSaveSshToVault(e.target.checked)}
                        className="rounded border-slate-600 text-amber-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-amber-500"
                      />
                      <span>{isEn ? 'Auto-save on server creation' : 'ذخیره خودکار پس از ثبت سرور'}</span>
                    </label>

                    {vaultFeedbackMsg && (
                      <span className={`text-[11px] font-medium ${vaultFeedbackMsg.isError ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {vaultFeedbackMsg.text}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`p-3 rounded-xl border space-y-2.5 ${
                isLightMode ? 'bg-blue-50/40 border-blue-200/70' : 'bg-blue-950/15 border-blue-900/40'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Monitor className="w-3.5 h-3.5" />
                <span>{isEn ? 'Windows Access & Remote Protocol' : 'تنظیمات دسترسی و پروتکل ریموت ویندوز'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {/* Protocol */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Protocol' : 'پروتکل دسترسی'}</label>
                  <select
                    value={winProtocol}
                    onChange={(e) => {
                      const p = e.target.value as any;
                      setWinProtocol(p);
                      if (p === 'winrm') setWinPort(5985);
                      else if (p === 'rdp') setWinPort(3389);
                      else if (p === 'ssh') setSshPort(22);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  >
                    <option value="rdp">RDP (Remote Desktop)</option>
                    <option value="powershell">PowerShell Remoting</option>
                    <option value="winrm">WinRM (HTTP / HTTPS)</option>
                    <option value="ssh">OpenSSH for Windows</option>
                  </select>
                </div>

                {/* Port */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Port' : 'پورت ریموت'}</label>
                  <input
                    type="number"
                    value={winPort === 0 ? '' : winPort}
                    onChange={(e) => {
                      const val = e.target.value;
                      setWinPort(val === '' ? 0 : Number(val));
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>

                {/* Domain (Optional) */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Domain' : 'دامین (اختیاری)'}</label>
                  <input
                    type="text"
                    value={winDomain}
                    onChange={(e) => setWinDomain(e.target.value)}
                    placeholder="CORP / WORKGROUP"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {/* Username */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Windows Username' : 'نام کاربری ویندوز'}</label>
                  <input
                    type="text"
                    value={winUsername}
                    onChange={(e) => setWinUsername(e.target.value)}
                    placeholder="Administrator"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300 flex items-center justify-between">
                    <span>{isEn ? 'Windows Password' : 'رمز عبور ویندوز'}</span>
                    <div className="flex items-center gap-2">
                      {!promptPasswordOnConnect && (
                        <button
                          type="button"
                          onClick={() => {
                            setVaultPickerTarget('windows');
                            setIsVaultPickerOpen(true);
                          }}
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-normal transition px-1.5 py-0.5 rounded hover:bg-cyan-500/10 cursor-pointer"
                          title={isEn ? 'Select secret from your personal vault' : 'انتخاب رمز از ولت شخصی شما'}
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>{isEn ? 'Choose from Vault' : 'انتخاب از ولت شخصی'}</span>
                        </button>
                      )}
                      {promptPasswordOnConnect && (
                        <span className="text-[10px] text-amber-400 font-normal">
                          {isEn ? 'Disabled (On-Demand Auth)' : 'غیرفعال (احراز در لحظه)'}
                        </span>
                      )}
                    </div>
                  </label>

                  {promptPasswordOnConnect ? (
                    <div
                      className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                        isLightMode
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                      }`}
                    >
                      <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        {isEn
                          ? 'Zero-storage active: Password will be requested when connecting to Remote Desktop/VNC.'
                          : 'سیاست عدم ذخیره‌سازی فعال است: رمز عبور هنگام اتصال به ریموت دسکتاپ/VNC درخواست خواهد شد.'}
                      </span>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type={showWinPassword ? 'text' : 'password'}
                        value={winPassword}
                        onChange={(e) => setWinPassword(e.target.value)}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        spellCheck={false}
                        className={`w-full px-2.5 py-1.5 pr-8 rounded-lg border text-xs font-mono outline-none ${
                          isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowWinPassword(!showWinPassword)}
                        title={showWinPassword ? (isEn ? 'Hide password' : 'مخفی‌سازی رمز') : (isEn ? 'Show password' : 'نمایش رمز')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition p-1 cursor-pointer"
                      >
                        {showWinPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}

                  {/* Save to Personal Vault prompt and instant button */}
                  {!promptPasswordOnConnect && winPassword.trim().length > 0 && (
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleInstantSaveWinToVault}
                        disabled={savingWinVault}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition shadow-sm ${
                          winVaultSaved
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : isLightMode
                            ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-200'
                        }`}
                        title={isEn ? 'Save this password directly to your personal vault in database' : 'ذخیره آنی این رمز در ولت پایگاه‌داده'}
                      >
                        {savingWinVault ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                        ) : winVaultSaved ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <BookmarkPlus className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span>
                          {winVaultSaved
                            ? isEn
                              ? 'Saved to Personal Vault!'
                              : 'در والت شخصی ذخیره شد!'
                            : isEn
                            ? 'Save this password to your Personal Vault'
                            : 'ذخیره این رمز در والت شخصی'}
                        </span>
                      </button>

                      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={saveWinToVault}
                          onChange={(e) => setSaveWinToVault(e.target.checked)}
                          className="rounded border-slate-600 text-amber-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-amber-500"
                        />
                        <span>{isEn ? 'Auto-save on server creation' : 'ذخیره خودکار پس از ثبت سرور'}</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Automation Tags Section - Compact */}
          <div
            className={`p-3 rounded-xl border space-y-2 text-xs ${
              isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Tags className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-bold uppercase tracking-wider text-slate-300">
                  {isEn ? 'Automation & Fleet Tags' : 'تگ‌های اتوماسیون و اجرای پلی‌بوک'}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Automation Tags' : 'تگ‌های اتوماسیون'}
                  whatIsIt={
                    isEn
                      ? 'Labels attached to servers to match Ansible/Terraform playbooks, automated backup targets, or batch config routines.'
                      : 'برچسب‌های هدفمند برای اتصال به پلی‌بوک‌های انسیبل، پایپ‌لاین‌های CI/CD، اتوماسیون بکاپ یا مانیتورینگ.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Allows targeting fleets of servers simultaneously (e.g., run update on all servers tagged "k8s" or "database").'
                      : 'امکان انتخاب دسته‌ای سرورها برای کارهای خودکارسازی در آینده بر اساس تگ مشترک.'
                  }
                  example="k8s, prod, nginx, postgres, worker, dc-tehran"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {tags.length} {isEn ? 'assigned' : 'تگ انتساب‌یافته'}
              </span>
            </div>

            {/* Current Tags Chips */}
            <div className="flex flex-wrap items-center gap-1 min-h-[28px]">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-rose-400 transition-colors cursor-pointer"
                    title={isEn ? 'Remove tag' : 'حذف تگ'}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}

              {tags.length === 0 && (
                <span className="text-[11px] text-slate-500 italic">
                  {isEn
                    ? 'No tags assigned. Add tags for automation targeting.'
                    : 'هیچ تگی ثبت نشده است. جهت اتوماسیون برچسب اضافه کنید.'}
                </span>
              )}
            </div>

            {/* Tag Input & Add Button */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(newTagInput);
                  }
                }}
                placeholder={isEn ? 'Type tag and press Enter...' : 'نام تگ را بنویسید و اینتر بزنید...'}
                className={`flex-1 px-2.5 py-1 rounded-lg border text-xs font-mono outline-none transition-all ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-900 focus:border-purple-500'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-purple-500'
                }`}
              />
              <button
                type="button"
                onClick={() => handleAddTag(newTagInput)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer shadow-xs active:scale-95"
              >
                <Plus className="w-3 h-3" />
                <span>{isEn ? 'Add' : 'افزودن'}</span>
              </button>
            </div>

            {/* Quick Tag Suggestions */}
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[10px] text-slate-500 me-1 font-medium">
                {isEn ? 'Suggestions:' : 'پیشنهادات:'}
              </span>
              {COMMON_TAG_SUGGESTIONS.filter((s) => !tags.includes(s))
                .slice(0, 8)
                .map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleAddTag(sug)}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                      isLightMode
                        ? 'border-slate-200 bg-white text-slate-600 hover:border-purple-400 hover:text-purple-600'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-purple-500/50 hover:text-purple-300'
                    }`}
                  >
                    +{sug}
                  </button>
                ))}
            </div>
          </div>

          {/* Optional Notes / Description */}
          <div className="space-y-1 text-xs">
            <label className="font-semibold text-slate-300">
              {isEn ? 'Notes / Role Description' : 'یادداشت‌ها و توضیحات نقش سرور'}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isEn
                  ? 'e.g. Primary control plane host running etcd and kube-apiserver. Managed via Ansible.'
                  : 'مثال: سرور مرکزی دیتابیس با پشتیبانی از کلاسترینگ و بکاپ ساعتی.'
              }
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none resize-none transition-all ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                  : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Form Actions Footer - Matches AddDeviceModal */}
          <div
            className={`flex items-center justify-between pt-3 border-t shrink-0 ${
              isLightMode ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-medium transition active:scale-95 cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {isSaving
                  ? isEn
                    ? 'Saving...'
                    : 'در حال ذخیره...'
                  : serverToEdit
                  ? isEn
                    ? 'Save Changes'
                    : 'ذخیره تغییرات'
                  : isEn
                  ? 'Register Server'
                  : 'ثبت سرور'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {isManageCategoriesOpen && (
        <ManageServerCategoriesModal
          isOpen={isManageCategoriesOpen}
          isLightMode={isLightMode}
          isEn={isEn}
          onClose={() => setIsManageCategoriesOpen(false)}
          onMinimize={() => setIsManageCategoriesOpen(false)}
          onCategoriesChanged={() => {
            fetchCategories();
          }}
        />
      )}

      {isVaultPickerOpen && (
        <VaultPasswordPickerModal
          isOpen={isVaultPickerOpen}
          isLightMode={isLightMode}
          isEn={isEn}
          targetHost={ip || hostname}
          onClose={() => setIsVaultPickerOpen(false)}
          onMinimize={() => setIsVaultPickerOpen(false)}
          onSelectPassword={(password, username) => {
            if (vaultPickerTarget === 'ssh') {
              setSshPassword(password);
              if (username && !sshUsername) {
                setSshUsername(username);
              }
            } else {
              setWinPassword(password);
              if (username && !winUsername) {
                setWinUsername(username);
              }
            }
            setIsVaultPickerOpen(false);
          }}
        />
      )}
    </div>,
    document.body
  );
};
