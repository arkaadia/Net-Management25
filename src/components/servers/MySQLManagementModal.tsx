import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Key,
  Terminal,
  Activity,
  Layers,
  Settings,
  Search,
  Archive,
  RotateCcw,
  HardDrive,
  BarChart3,
  Cpu,
  Table,
  Sliders,
  Play,
  Trash2,
  Pencil,
  Zap,
  Server,
  Users,
  User,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  ExternalLink,
  Code,
  Eye,
  EyeOff,
  Hash,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Filter,
  ListFilter,
  Link2,
  Sparkles,
  Plus,
  Power,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlConnectionTestResult,
  MysqlOverview,
  MysqlDatabaseItem,
  MysqlDatabaseDetails,
  MysqlDatabaseTableSummary,
  MysqlViewSummary,
  MysqlRoutineSummary,
  MysqlTriggerSummary,
  MysqlEventSummary,
  MysqlSequenceSummary,
  MysqlUserItem,
  MysqlProcessItem,
  MysqlVariableItem,
  MysqlQueryResult,
  MysqlTableStructure,
  MysqlColumnStructure,
  MysqlIndexDetail,
  MysqlForeignKeyConstraint,
  MysqlTableMetadataStats,
  MysqlTableDataRequest,
  MysqlTableDataResult,
  MysqlTableDataColumnInfo,
  MysqlTableDataFilter,
  MysqlFilterOperator,
  MysqlRowColumnValue,
  MysqlRoutineParameter,
} from '../../types';
import {
  testRemoteServerMysqlConnection,
  fetchRemoteServerMysqlOverview,
  fetchRemoteServerMysqlDatabases,
  fetchRemoteServerMysqlDatabaseDetails,
  fetchRemoteServerMysqlDatabaseObjects,
  fetchRemoteServerMysqlTableStructure,
  fetchRemoteServerMysqlTableData,
  insertRemoteServerMysqlTableRow,
  updateRemoteServerMysqlTableRow,
  deleteRemoteServerMysqlTableRow,
  fetchRemoteServerMysqlUsers,
  executeRemoteServerMysqlQuery,
  fetchRemoteServerMysqlProcesslist,
  killRemoteServerMysqlProcess,
  fetchRemoteServerMysqlVariables,
  getRemoteServerMysqlEventSchedulerStatus,
  setRemoteServerMysqlEventSchedulerStatus,
  alterRemoteServerMysqlEventStatus,
} from '../../services/api';
import { MysqlTableRowEditModal, MysqlRowModalColumn } from './MysqlTableRowEditModal';
import {
  MysqlTableStructureModal,
  MysqlTableStructureModalMode,
  MysqlDropTargetType,
} from './MysqlTableStructureModal';
import {
  MysqlProgrammabilityModal,
  MysqlProgrammabilityModalMode,
} from './MysqlProgrammabilityModal';
import { MysqlBackupExportModal } from './MysqlBackupExportModal';
import { MysqlSqlEditorTab } from './MysqlSqlEditorTab';
import { MysqlUsersManagerTab } from './MysqlUsersManagerTab';
import { MysqlPermissionsManagerTab } from './MysqlPermissionsManagerTab';
import { MysqlProcesslistTab } from './MysqlProcesslistTab';
import { MysqlConfigManagerTab } from './MysqlConfigManagerTab';
import { MysqlBackupRestoreManagerTab } from './MysqlBackupRestoreManagerTab';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MySQLManagementModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  onClose: () => void;
  onMinimize?: () => void;
  onOpenTerminal?: (server: RemoteServer) => void;
  onEditServer?: (server: RemoteServer) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

type MysqlTab = 'overview' | 'databases' | 'sql' | 'users' | 'privileges' | 'processlist' | 'backups' | 'config' | 'variables' | 'connection';

export const MySQLManagementModal: React.FC<MySQLManagementModalProps> = ({
  isOpen,
  server,
  onClose,
  onMinimize,
  onOpenTerminal,
  onEditServer,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<MysqlTab>('overview');

  // Connection testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<MysqlConnectionTestResult | null>(null);

  // Overview state
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [overview, setOverview] = useState<MysqlOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Databases state
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [databases, setDatabases] = useState<MysqlDatabaseItem[]>([]);
  const [dbSearch, setDbSearch] = useState('');

  // Processlist state
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);
  const [processes, setProcesses] = useState<MysqlProcessItem[]>([]);
  const [killingId, setKillingId] = useState<number | null>(null);

  // Variables state
  const [isLoadingVariables, setIsLoadingVariables] = useState(false);
  const [variables, setVariables] = useState<MysqlVariableItem[]>([]);
  const [varSearch, setVarSearch] = useState('');

  // SQL console state
  const [sqlQuery, setSqlQuery] = useState('SHOW DATABASES;');
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const [queryResult, setQueryResult] = useState<MysqlQueryResult | null>(null);

  // Database browser tree navigation state (Phase 3 & Phase 4)
  type TreeNodeType =
    | 'root'
    | 'databases_folder'
    | 'database'
    | 'tables_folder'
    | 'table'
    | 'views_folder'
    | 'view'
    | 'procedures_folder'
    | 'procedure'
    | 'functions_folder'
    | 'function'
    | 'triggers_folder'
    | 'trigger'
    | 'events_folder'
    | 'event'
    | 'sequences_folder'
    | 'sequence'
    | 'users_folder'
    | 'user'
    | 'server_folder';

  const [selectedTreeNode, setSelectedTreeNode] = useState<{
    type: TreeNodeType;
    id: string;
    name: string;
    dbName?: string;
    tableName?: string;
    viewName?: string;
    procedureName?: string;
    functionName?: string;
    triggerName?: string;
    eventName?: string;
    sequenceName?: string;
    userName?: string;
  }>({
    type: 'root',
    id: 'root',
    name: 'MySQL',
  });
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Set<string>>(
    () => new Set(['root', 'databases_folder', 'users_folder'])
  );
  const [treeSearch, setTreeSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [objectSearch, setObjectSearch] = useState('');
  const [dbActiveObjectTab, setDbActiveObjectTab] = useState<
    'tables' | 'views' | 'procedures' | 'functions' | 'triggers' | 'events' | 'sequences'
  >('tables');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Database details cache: dbName -> MysqlDatabaseDetails
  const [dbDetailsCache, setDbDetailsCache] = useState<Record<string, MysqlDatabaseDetails>>({});
  const [loadingDbDetails, setLoadingDbDetails] = useState<Set<string>>(new Set());
  const [dbDetailsError, setDbDetailsError] = useState<Record<string, string>>({});

  // Users state
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [users, setUsers] = useState<MysqlUserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Phase 5: Table Structure & Data Viewer States
  const [tableStructures, setTableStructures] = useState<Record<string, MysqlTableStructure>>({});
  const [loadingTableStructure, setLoadingTableStructure] = useState(false);
  const [tableStructureError, setTableStructureError] = useState<string | null>(null);

  const [tableActiveSubTab, setTableActiveSubTab] = useState<'data' | 'columns' | 'indexes' | 'foreignKeys' | 'options' | 'ddl'>('data');
  const [tableDataResult, setTableDataResult] = useState<MysqlTableDataResult | null>(null);
  const [loadingTableData, setLoadingTableData] = useState(false);
  const [tableDataError, setTableDataError] = useState<string | null>(null);
  const [tableDataPage, setTableDataPage] = useState(1);
  const [tableDataPageSize, setTableDataPageSize] = useState(50);
  const [tableDataSortColumn, setTableDataSortColumn] = useState<string | undefined>(undefined);
  const [tableDataSortDir, setTableDataSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [tableDataSearch, setTableDataSearch] = useState('');
  const [tableDataFilters, setTableDataFilters] = useState<MysqlTableDataFilter[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [newFilterColumn, setNewFilterColumn] = useState('');
  const [newFilterOperator, setNewFilterOperator] = useState<MysqlFilterOperator>('eq');
  const [newFilterValue, setNewFilterValue] = useState('');
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);
  const [dataHiddenColumns, setDataHiddenColumns] = useState<Record<string, boolean>>({});
  const [isColumnVisibilityOpen, setIsColumnVisibilityOpen] = useState(false);
  const [inspectingRowIndex, setInspectingRowIndex] = useState<number | null>(null);
  const [rowFieldSearch, setRowFieldSearch] = useState('');

  // Phase 7: Table Data Editing States
  const [isRowMutationModalOpen, setIsRowMutationModalOpen] = useState(false);
  const [rowMutationModalMode, setRowMutationModalMode] = useState<'insert' | 'edit' | 'delete'>('insert');
  const [selectedRowForMutation, setSelectedRowForMutation] = useState<Record<string, any> | null>(null);
  const [rowMutationNotice, setRowMutationNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Phase 13: Table, Column, Index & Constraint Structural Management States
  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [structureModalMode, setStructureModalMode] = useState<MysqlTableStructureModalMode>('create_table');
  const [structureTargetColumn, setStructureTargetColumn] = useState<MysqlColumnStructure | null>(null);
  const [structureTargetIndex, setStructureTargetIndex] = useState<MysqlIndexDetail | null>(null);
  const [structureTargetForeignKey, setStructureTargetForeignKey] = useState<MysqlForeignKeyConstraint | null>(null);
  const [structureDropTargetType, setStructureDropTargetType] = useState<MysqlDropTargetType>('table');
  const [structureTargetTableName, setStructureTargetTableName] = useState<string>('');

  const handleOpenStructureModal = useCallback((
    mode: MysqlTableStructureModalMode,
    options?: {
      tableName?: string;
      column?: MysqlColumnStructure;
      index?: MysqlIndexDetail;
      foreignKey?: MysqlForeignKeyConstraint;
      dropType?: MysqlDropTargetType;
    }
  ) => {
    setStructureModalMode(mode);
    setStructureTargetTableName(options?.tableName || selectedTreeNode.tableName || '');
    setStructureTargetColumn(options?.column || null);
    setStructureTargetIndex(options?.index || null);
    setStructureTargetForeignKey(options?.foreignKey || null);
    setStructureDropTargetType(options?.dropType || 'table');
    setIsStructureModalOpen(true);
  }, [selectedTreeNode.tableName]);

  // Phase 14: Views, Routines, Triggers & Events States
  const [isProgrammabilityModalOpen, setIsProgrammabilityModalOpen] = useState(false);
  const [programmabilityModalMode, setProgrammabilityModalMode] = useState<MysqlProgrammabilityModalMode>('create_view');
  const [programmabilityTargetName, setProgrammabilityTargetName] = useState<string>('');
  const [programmabilityRoutineParams, setProgrammabilityRoutineParams] = useState<MysqlRoutineParameter[]>([]);
  const [eventSchedulerEnabled, setEventSchedulerEnabled] = useState<boolean | null>(null);
  const [isTogglingEventScheduler, setIsTogglingEventScheduler] = useState(false);

  const handleOpenProgrammabilityModal = useCallback((
    mode: MysqlProgrammabilityModalMode,
    options?: {
      targetName?: string;
      routineParams?: MysqlRoutineParameter[];
    }
  ) => {
    setProgrammabilityModalMode(mode);
    setProgrammabilityTargetName(options?.targetName || '');
    setProgrammabilityRoutineParams(options?.routineParams || []);
    setIsProgrammabilityModalOpen(true);
  }, []);

  // Phase 15: MySQL Full Database & Table Backup, Dump & Export States
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupInitialTableName, setBackupInitialTableName] = useState<string | undefined>(undefined);

  const handleOpenBackupModal = useCallback((options?: { tableName?: string }) => {
    setBackupInitialTableName(options?.tableName);
    setIsBackupModalOpen(true);
  }, []);



  // Run initial test and overview on open
  const runTestConnection = useCallback(async () => {
    if (!server) return;
    setIsTesting(true);
    try {
      const res = await testRemoteServerMysqlConnection(server.id);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 'unknown_error',
        message: err.message,
        serverAddress: server.ip,
        port: server.mysql_port || 3306,
        username: server.mysql_user || 'root',
        testedAt: new Date().toISOString(),
      });
    } finally {
      setIsTesting(false);
    }
  }, [server]);

  const loadOverview = useCallback(async () => {
    if (!server) return;
    setIsLoadingOverview(true);
    setOverviewError(null);
    try {
      const res = await fetchRemoteServerMysqlOverview(server.id);
      if (res.success && res.overview) {
        setOverview(res.overview);
      } else {
        setOverviewError(res.error || 'Failed to fetch overview');
      }
    } catch (err: any) {
      setOverviewError(err.message);
    } finally {
      setIsLoadingOverview(false);
    }
  }, [server]);

  const loadDatabases = useCallback(async () => {
    if (!server) return;
    setIsLoadingDatabases(true);
    try {
      const res = await fetchRemoteServerMysqlDatabases(server.id);
      if (res.success && res.databases) {
        setDatabases(res.databases);
      }
    } catch {} finally {
      setIsLoadingDatabases(false);
    }
  }, [server]);

  const loadUsers = useCallback(async () => {
    if (!server) return;
    setIsLoadingUsers(true);
    try {
      const res = await fetchRemoteServerMysqlUsers(server.id);
      if (res.success && res.users) {
        setUsers(res.users);
      }
    } catch {} finally {
      setIsLoadingUsers(false);
    }
  }, [server]);

  const loadDatabaseDetails = useCallback(
    async (dbName: string, force = false) => {
      if (!server || !dbName) return;
      if (!force && dbDetailsCache[dbName]) return;

      setLoadingDbDetails((prev) => new Set(prev).add(dbName));
      setDbDetailsError((prev) => {
        const next = { ...prev };
        delete next[dbName];
        return next;
      });

      try {
        const res = await fetchRemoteServerMysqlDatabaseDetails(server.id, dbName);
        if (res.success && res.details) {
          setDbDetailsCache((prev) => ({ ...prev, [dbName]: res.details! }));
        } else {
          setDbDetailsError((prev) => ({ ...prev, [dbName]: res.error || 'Failed to fetch details' }));
        }
      } catch (err: any) {
        setDbDetailsError((prev) => ({ ...prev, [dbName]: err.message || 'Error fetching details' }));
      } finally {
        setLoadingDbDetails((prev) => {
          const next = new Set(prev);
          next.delete(dbName);
          return next;
        });
      }
    },
    [server, dbDetailsCache]
  );

  const handleProgrammabilityModalSuccess = useCallback((_message?: string) => {
    setIsProgrammabilityModalOpen(false);
    if (selectedTreeNode.dbName) {
      loadDatabaseDetails(selectedTreeNode.dbName, true);
    }
  }, [selectedTreeNode.dbName, loadDatabaseDetails]);

  // Load event scheduler status
  const loadEventSchedulerStatus = useCallback(async () => {
    if (!server) return;
    try {
      const res = await getRemoteServerMysqlEventSchedulerStatus(server.id);
      if (res && typeof res.enabled === 'boolean') {
        setEventSchedulerEnabled(res.enabled);
      }
    } catch {
      // ignore
    }
  }, [server]);

  // Toggle event scheduler
  const handleToggleEventScheduler = useCallback(async () => {
    if (!server) return;
    setIsTogglingEventScheduler(true);
    try {
      const nextState = eventSchedulerEnabled === null ? true : !eventSchedulerEnabled;
      const res = await setRemoteServerMysqlEventSchedulerStatus(server.id, { enabled: nextState });
      if (res.success) {
        setEventSchedulerEnabled(nextState);
      }
    } catch {
      // ignore
    } finally {
      setIsTogglingEventScheduler(false);
    }
  }, [server, eventSchedulerEnabled]);

  // Toggle individual event status
  const handleToggleEventStatus = useCallback(async (evName: string, nextStatus: 'ENABLE' | 'DISABLE') => {
    if (!server || !selectedTreeNode.dbName) return;
    try {
      const res = await alterRemoteServerMysqlEventStatus(server.id, {
        database: selectedTreeNode.dbName,
        eventName: evName,
        status: nextStatus,
      });
      if (res.success) {
        loadDatabaseDetails(selectedTreeNode.dbName, true);
      }
    } catch {
      // ignore
    }
  }, [server, selectedTreeNode.dbName, loadDatabaseDetails]);

  const toggleTreeNode = (nodeId: string, onExpand?: () => void) => {
    setExpandedTreeNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
        if (onExpand) onExpand();
      }
      return next;
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const handleOpenSqlForDatabase = (dbName: string, table?: string, customQuery?: string) => {
    let query = '';
    if (customQuery) {
      query = customQuery;
    } else if (table) {
      query = `USE \`${dbName}\`;\nSELECT * FROM \`${table}\` LIMIT 50;`;
    } else {
      query = `USE \`${dbName}\`;\nSHOW TABLES;`;
    }
    setSqlQuery(query);
    setActiveTab('sql');
  };

  // Phase 5: Load Table Structure
  const loadTableStructure = useCallback(
    async (dbName: string, tableName: string, force = false) => {
      if (!server || !dbName || !tableName) return;
      const key = `${dbName}:${tableName}`;
      if (!force && tableStructures[key]) return;

      setLoadingTableStructure(true);
      setTableStructureError(null);
      try {
        const res = await fetchRemoteServerMysqlTableStructure(server.id, dbName, tableName);
        if (res.success && res.structure) {
          setTableStructures((prev) => ({ ...prev, [key]: res.structure! }));
        } else {
          setTableStructureError(res.error || 'Failed to fetch table structure');
        }
      } catch (err: any) {
        setTableStructureError(err.message || 'Error fetching table structure');
      } finally {
        setLoadingTableStructure(false);
      }
    },
    [server, tableStructures]
  );

  // Phase 5: Load Table Data
  const loadTableData = useCallback(
    async (
      dbName: string,
      tableName: string,
      pageOverride?: number,
      pageSizeOverride?: number,
      sortColOverride?: string,
      sortDirOverride?: 'ASC' | 'DESC',
      searchOverride?: string,
      filtersOverride?: MysqlTableDataFilter[]
    ) => {
      if (!server || !dbName || !tableName) return;

      setLoadingTableData(true);
      setTableDataError(null);

      const page = pageOverride !== undefined ? pageOverride : tableDataPage;
      const pageSize = pageSizeOverride !== undefined ? pageSizeOverride : tableDataPageSize;
      const sortColumn = sortColOverride !== undefined ? sortColOverride : tableDataSortColumn;
      const sortDirection = sortDirOverride !== undefined ? sortDirOverride : tableDataSortDir;
      const search = searchOverride !== undefined ? searchOverride : tableDataSearch;
      const filters = filtersOverride !== undefined ? filtersOverride : tableDataFilters;

      try {
        const res = await fetchRemoteServerMysqlTableData(server.id, dbName, tableName, {
          database: dbName,
          table: tableName,
          page,
          pageSize,
          sortColumn,
          sortDirection,
          search,
          filters,
        });

        if (res.success && res.data) {
          setTableDataResult(res.data);
          if (pageOverride !== undefined) setTableDataPage(pageOverride);
          if (pageSizeOverride !== undefined) setTableDataPageSize(pageSizeOverride);
          if (sortColOverride !== undefined) setTableDataSortColumn(sortColOverride);
          if (sortDirOverride !== undefined) setTableDataSortDir(sortDirOverride);
        } else {
          setTableDataError(res.error || 'Failed to load table rows');
        }
      } catch (err: any) {
        setTableDataError(err.message || 'Error loading table data');
      } finally {
        setLoadingTableData(false);
      }
    },
    [server, tableDataPage, tableDataPageSize, tableDataSortColumn, tableDataSortDir, tableDataSearch, tableDataFilters]
  );

  const handleStructureModalSuccess = useCallback(() => {
    const db = selectedTreeNode.dbName;
    const tbl = structureTargetTableName || selectedTreeNode.tableName;
    if (db) {
      loadDatabaseDetails(db, true);
      if (tbl) {
        loadTableStructure(db, tbl, true);
        loadTableData(db, tbl, 1);
      }
    }
  }, [selectedTreeNode.dbName, selectedTreeNode.tableName, structureTargetTableName, loadDatabaseDetails, loadTableStructure, loadTableData]);

  // Auto-load table structure and data on table selection
  useEffect(() => {
    if (selectedTreeNode.type === 'table' && selectedTreeNode.dbName && selectedTreeNode.name) {
      const dbName = selectedTreeNode.dbName;
      const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
      loadTableStructure(dbName, tableName);
      loadTableData(dbName, tableName, 1);
    }
  }, [selectedTreeNode.type, selectedTreeNode.dbName, selectedTreeNode.tableName, selectedTreeNode.name]);

  // Phase 6: Sorting, Filtering & Column Visibility Handlers
  const toggleColumnSort = (colName: string) => {
    let newSortCol: string | undefined = colName;
    let newSortDir: 'ASC' | 'DESC' = 'ASC';

    if (tableDataSortColumn === colName) {
      if (tableDataSortDir === 'ASC') {
        newSortDir = 'DESC';
      } else {
        newSortCol = undefined;
      }
    }

    setTableDataSortColumn(newSortCol);
    setTableDataSortDir(newSortDir);
    setTableDataPage(1);

    if (selectedTreeNode.dbName) {
      const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
      loadTableData(selectedTreeNode.dbName, tableName, 1, undefined, newSortCol, newSortDir);
    }
  };

  const handleAddFilter = () => {
    const availableCols = tableDataResult?.columns || tableStructures[`${selectedTreeNode.dbName}:${selectedTreeNode.tableName || selectedTreeNode.name}`]?.columns || [];
    const col = newFilterColumn || availableCols[0]?.name || '';
    if (!col) return;
    const newF: MysqlTableDataFilter = {
      column: col,
      operator: newFilterOperator,
      value: newFilterValue,
    };
    const updated = [...tableDataFilters, newF];
    setTableDataFilters(updated);
    setNewFilterValue('');
    setTableDataPage(1);
    if (selectedTreeNode.dbName) {
      const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
      loadTableData(selectedTreeNode.dbName, tableName, 1, undefined, undefined, undefined, undefined, updated);
    }
  };

  const handleRemoveFilter = (index: number) => {
    const updated = tableDataFilters.filter((_, i) => i !== index);
    setTableDataFilters(updated);
    setTableDataPage(1);
    if (selectedTreeNode.dbName) {
      const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
      loadTableData(selectedTreeNode.dbName, tableName, 1, undefined, undefined, undefined, undefined, updated);
    }
  };

  const handleClearAllFilters = () => {
    setTableDataFilters([]);
    setTableDataPage(1);
    if (selectedTreeNode.dbName) {
      const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
      loadTableData(selectedTreeNode.dbName, tableName, 1, undefined, undefined, undefined, undefined, []);
    }
  };

  // Phase 5 & 6: Export Table Data (respects visible columns for CSV)
  const exportTableData = (format: 'csv' | 'json') => {
    if (!tableDataResult || !tableDataResult.rows || tableDataResult.rows.length === 0) return;
    const { rows, columns, tableName } = tableDataResult;
    const visibleCols = columns.filter((c) => !dataHiddenColumns[c.name]);

    let content = '';
    let mimeType = 'text/plain';
    let ext = 'txt';

    if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
      mimeType = 'application/json';
      ext = 'json';
    } else {
      const headers = visibleCols.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(',');
      const body = rows
        .map((r) =>
          visibleCols
            .map((c) => {
              const val = r[c.name];
              if (val === null || val === undefined) return '';
              const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
              return `"${str.replace(/"/g, '""')}"`;
            })
            .join(',')
        )
        .join('\n');
      content = `${headers}\n${body}`;
      mimeType = 'text/csv';
      ext = 'csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableName}_page_${tableDataPage}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Phase 7: MySQL Table Column Info for Mutation Modal
  const activeTableModalColumns = useMemo((): MysqlRowModalColumn[] => {
    const dbName = selectedTreeNode.dbName;
    const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
    if (!dbName || !tableName) return [];

    const struct = tableStructures[`${dbName}:${tableName}`];
    if (struct && struct.columns && struct.columns.length > 0) {
      return struct.columns.map((col) => ({
        name: col.name,
        dataType: col.dataType,
        columnType: col.columnType,
        isPrimaryKey: col.isPrimaryKey,
        isNullable: col.isNullable,
        defaultValue: col.columnDefault,
        isAutoIncrement: Boolean(
          col.extra?.toLowerCase().includes('auto_increment') ||
          col.columnType?.toLowerCase().includes('auto_increment') ||
          col.columnDefault?.toLowerCase().includes('auto_increment')
        ),
        comment: col.comment || undefined,
      }));
    }

    if (tableDataResult?.columns && tableDataResult.columns.length > 0) {
      return tableDataResult.columns.map((col) => ({
        name: col.name,
        dataType: col.dataType,
        columnType: col.columnType,
        isPrimaryKey: col.isPrimaryKey,
        isNullable: true,
      }));
    }

    return [];
  }, [selectedTreeNode.dbName, selectedTreeNode.tableName, selectedTreeNode.name, tableStructures, tableDataResult]);

  const handleInsertRowSubmit = useCallback(
    async (values: Record<string, MysqlRowColumnValue>): Promise<{ success: boolean; error?: string }> => {
      const dbName = selectedTreeNode.dbName;
      const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
      if (!server?.id || !dbName || !tableName) {
        return { success: false, error: isEn ? 'Table context not selected' : 'کانتکست جدول انتخاب نشده است' };
      }
      try {
        const res = await insertRemoteServerMysqlTableRow(server.id, {
          database: dbName,
          table: tableName,
          values,
        });

        if (res.success) {
          setRowMutationNotice({
            type: 'success',
            message: isEn
              ? res.message || 'Row successfully inserted.'
              : res.messageFa || 'سطر با موفقیت در جدول درج شد.',
          });
          loadTableData(dbName, tableName);
          loadTableStructure(dbName, tableName);
          return { success: true };
        } else {
          return {
            success: false,
            error: isEn ? res.error || 'Failed to insert row' : res.errorFa || res.error || 'خطا در درج سطر',
          };
        }
      } catch (err: any) {
        return { success: false, error: err.message || (isEn ? 'Network error' : 'خطای شبکه') };
      }
    },
    [server?.id, selectedTreeNode.dbName, selectedTreeNode.tableName, selectedTreeNode.name, isEn, loadTableData, loadTableStructure]
  );

  const handleUpdateRowSubmit = useCallback(
    async (
      updatedValues: Record<string, MysqlRowColumnValue>,
      primaryKeyValues?: Record<string, any>,
      originalRow?: Record<string, any>
    ): Promise<{ success: boolean; error?: string }> => {
      const dbName = selectedTreeNode.dbName;
      const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
      if (!server?.id || !dbName || !tableName) {
        return { success: false, error: isEn ? 'Table context not selected' : 'کانتکست جدول انتخاب نشده است' };
      }
      try {
        const res = await updateRemoteServerMysqlTableRow(server.id, {
          database: dbName,
          table: tableName,
          primaryKeyValues,
          originalRow,
          updatedValues,
        });

        if (res.success) {
          setRowMutationNotice({
            type: 'success',
            message: isEn
              ? res.message || 'Row successfully updated.'
              : res.messageFa || 'سطر با موفقیت به‌روزرسانی شد.',
          });
          loadTableData(dbName, tableName);
          return { success: true };
        } else {
          return {
            success: false,
            error: isEn ? res.error || 'Failed to update row' : res.errorFa || res.error || 'خطا در به‌روزرسانی سطر',
          };
        }
      } catch (err: any) {
        return { success: false, error: err.message || (isEn ? 'Network error' : 'خطای شبکه') };
      }
    },
    [server?.id, selectedTreeNode.dbName, selectedTreeNode.tableName, selectedTreeNode.name, isEn, loadTableData]
  );

  const handleDeleteRowSubmit = useCallback(
    async (
      primaryKeyValues?: Record<string, any>,
      originalRow?: Record<string, any>
    ): Promise<{ success: boolean; error?: string }> => {
      const dbName = selectedTreeNode.dbName;
      const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
      if (!server?.id || !dbName || !tableName) {
        return { success: false, error: isEn ? 'Table context not selected' : 'کانتکست جدول انتخاب نشده است' };
      }
      try {
        const res = await deleteRemoteServerMysqlTableRow(server.id, {
          database: dbName,
          table: tableName,
          primaryKeyValues,
          originalRow,
        });

        if (res.success) {
          setRowMutationNotice({
            type: 'success',
            message: isEn
              ? res.message || 'Row successfully deleted.'
              : res.messageFa || 'سطر با موفقیت از جدول حذف شد.',
          });
          loadTableData(dbName, tableName);
          loadTableStructure(dbName, tableName);
          return { success: true };
        } else {
          return {
            success: false,
            error: isEn ? res.error || 'Failed to delete row' : res.errorFa || res.error || 'خطا در حذف سطر',
          };
        }
      } catch (err: any) {
        return { success: false, error: err.message || (isEn ? 'Network error' : 'خطای شبکه') };
      }
    },
    [server?.id, selectedTreeNode.dbName, selectedTreeNode.tableName, selectedTreeNode.name, isEn, loadTableData, loadTableStructure]
  );

  const loadProcesslist = useCallback(async () => {
    if (!server) return;
    setIsLoadingProcesses(true);
    try {
      const res = await fetchRemoteServerMysqlProcesslist(server.id);
      if (res.success && res.processes) {
        setProcesses(res.processes);
      }
    } catch {} finally {
      setIsLoadingProcesses(false);
    }
  }, [server]);

  const loadVariables = useCallback(async () => {
    if (!server) return;
    setIsLoadingVariables(true);
    try {
      const res = await fetchRemoteServerMysqlVariables(server.id, varSearch);
      if (res.success && res.variables) {
        setVariables(res.variables);
      }
    } catch {} finally {
      setIsLoadingVariables(false);
    }
  }, [server, varSearch]);

  const handleExecuteSql = async () => {
    if (!server || !sqlQuery.trim()) return;
    setIsExecutingSql(true);
    setQueryResult(null);
    try {
      const res = await executeRemoteServerMysqlQuery(server.id, sqlQuery.trim());
      setQueryResult(res);
    } catch (err: any) {
      setQueryResult({
        success: false,
        error: err.message,
        errorFa: `خطا در اجرای کوئری: ${err.message}`,
      });
    } finally {
      setIsExecutingSql(false);
    }
  };

  const handleKillProcess = async (processId: number) => {
    if (!server) return;
    setKillingId(processId);
    try {
      await killRemoteServerMysqlProcess(server.id, processId);
      await loadProcesslist();
    } catch {} finally {
      setKillingId(null);
    }
  };

  useEffect(() => {
    if (isOpen && server) {
      runTestConnection();
      loadOverview();
    }
  }, [isOpen, server, runTestConnection, loadOverview]);

  useEffect(() => {
    if (!isOpen || !server) return;
    if (activeTab === 'databases') {
      loadDatabases();
      loadUsers();
    }
    if (activeTab === 'processlist') loadProcesslist();
    if (activeTab === 'variables') loadVariables();
  }, [isOpen, server, activeTab, loadDatabases, loadUsers, loadProcesslist, loadVariables]);

  const filteredDatabases = useMemo(() => {
    if (!dbSearch.trim()) return databases;
    return databases.filter((db) => db.name.toLowerCase().includes(dbSearch.toLowerCase()));
  }, [databases, dbSearch]);

  const filteredVariables = useMemo(() => {
    if (!varSearch.trim()) return variables;
    return variables.filter((v) => v.name.toLowerCase().includes(varSearch.toLowerCase()));
  }, [variables, varSearch]);

  if (!isOpen || !server) return null;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex flex-col p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full h-full rounded-2xl flex flex-col overflow-hidden border shadow-2xl transition-all ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-slate-900/20'
            : 'bg-slate-950 border-white/15 text-slate-100 shadow-black/80'
        } ${isMaximized ? 'm-0 rounded-none' : 'max-w-6xl mx-auto'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
              <Database className="w-5 h-5" />

      {/* Phase 15: MySQL Full Database & Table Backup, Dump & Export Modal */}
      <MysqlBackupExportModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onMinimize={() => setIsBackupModalOpen(false)}
        serverId={server.id}
        serverName={server.name}
        databaseName={selectedTreeNode.dbName || ""}
        initialTableName={backupInitialTableName}
        availableTables={dbDetailsCache[selectedTreeNode.dbName || ""]?.tables?.map((t) => t.name) || []}
        isLightMode={isLightMode}
        isEn={isEn}
      />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">
                  {isEn ? 'MySQL Management' : 'مدیریت MySQL'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  Port {server.mysql_port || 3306}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                <span>{server.name}</span>
                <span>•</span>
                <span>{server.ip}</span>
                {overview?.version && (
                  <>
                    <span>•</span>
                    <span className="text-cyan-400">{overview.version}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 3 Header Control Buttons (Close, Minimize, Maximize) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={runTestConnection}
              disabled={isTesting}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  : 'border-white/10 hover:bg-white/10 text-slate-300'
              }`}
              title={isEn ? 'Test Connection' : 'تست مجدد اتصال'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-orange-400' : ''}`} />
              <span className="hidden sm:inline">{isEn ? 'Ping' : 'تست'}</span>
            </button>
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                title={isEn ? 'Minimize' : 'کوچک‌نمایی (کمینه‌سازی)'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              title={isEn ? (isMaximized ? 'Restore' : 'Maximize') : isMaximized ? 'حالت پنجره' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className={`flex items-center gap-1 px-4 border-b shrink-0 overflow-x-auto ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/50 border-white/10'
          }`}
        >
          {[
            { id: 'overview', label: isEn ? 'Overview & Metrics' : 'داشبورد و وضعیت', icon: Activity },
            { id: 'databases', label: isEn ? 'Database Browser' : 'کاوشگر پایگاه داده', icon: Layers },
            { id: 'sql', label: isEn ? 'SQL Console' : 'کنسول SQL', icon: Terminal },
            { id: 'users', label: isEn ? 'Users & Accounts' : 'کاربران و اکانت‌ها', icon: Users },
            { id: 'privileges', label: isEn ? 'Privileges & Grants' : 'سطوح دسترسی و مجوزها', icon: Key },
            { id: 'processlist', label: isEn ? 'Active Threads' : 'پروسس‌ها و اتصالات', icon: Cpu },
            { id: 'backups', label: isEn ? 'Backups & Restore' : 'پشتیبان‌گیری و بازیابی', icon: Archive },
            { id: 'config', label: isEn ? 'Client Auth & my.cnf' : 'احراز هویت و my.cnf', icon: ShieldCheck },
            { id: 'variables', label: isEn ? 'System Variables' : 'تنظیمات و متغیرها', icon: Sliders },
            { id: 'connection', label: isEn ? 'Connection' : 'تنظیمات اتصال', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as MysqlTab)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-orange-500 text-orange-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {/* 1. OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Connection Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  testResult?.success
                    ? isLightMode
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : testResult
                    ? isLightMode
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200'
                    : 'bg-slate-900/60 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {testResult?.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : testResult ? (
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  ) : (
                    <RefreshCw className="w-5 h-5 text-slate-400 animate-spin shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-xs">
                      {testResult?.success
                        ? isEn
                          ? 'MySQL Instance Reachable & Online'
                          : 'موتور پایگاه‌داده MySQL فعال و برخط است'
                        : testResult
                        ? isEn
                          ? 'Connection Notice'
                          : 'خطا در ارتباط با دیتابیس'
                        : isEn
                        ? 'Testing MySQL Connection...'
                        : 'در حال بررسی اتصال به MySQL...'}
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5 font-mono">
                      {isEn ? testResult?.message : testResult?.messageFa || testResult?.message}
                    </div>
                  </div>
                </div>
                {testResult?.latencyMs !== undefined && (
                  <span className="px-2 py-1 rounded text-xs font-mono font-bold bg-black/20 shrink-0">
                    {testResult.latencyMs} ms
                  </span>
                )}
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Connected Threads' : 'تعداد اتصالات فعال'}
                  </div>
                  <div className="text-2xl font-bold font-mono text-cyan-400 mt-2">
                    {overview?.threadsConnected ?? '—'}
                    <span className="text-xs text-slate-400 font-normal"> / {overview?.maxConnections ?? '151'}</span>
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Engine Uptime' : 'مدت زمان کارکرد'}
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-2">
                    {overview?.uptimePretty || '—'}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Total Queries' : 'کل کوئری‌های اجراشده'}
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
                    {overview ? overview.totalQueries.toLocaleString() : '—'}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'InnoDB Buffer Pool' : 'حافظه بافر InnoDB'}
                  </div>
                  <div className="text-lg font-bold font-mono text-purple-400 mt-2">
                    {overview?.bufferPoolSize || '—'}
                  </div>
                </div>
              </div>

              {/* Detailed Specs Panel */}
              <div
                className={`p-4 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold">{isEn ? 'Server Specs & Telemetry' : 'مشخصات سرور و تلمتری'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={loadOverview}
                    disabled={isLoadingOverview}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingOverview ? 'animate-spin text-orange-400' : ''}`} />
                    <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-xs font-mono">
                  {/* 1. MySQL Version */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'MySQL Version' : 'نسخه MySQL'}</span>
                    <span className="font-bold text-amber-300">{overview?.version || 'MySQL'}</span>
                  </div>

                  {/* 2. Server Version & Flavor */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Server Version & Comment' : 'نسخه کامل و توزیع سرور'}</span>
                    <span className="font-bold text-slate-200 truncate block" title={overview?.serverVersion || overview?.versionComment}>
                      {overview?.serverVersion || overview?.versionComment || 'Community Server'}
                    </span>
                  </div>

                  {/* 3. Host */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Host / IP' : 'هاست / آدرس IP'}</span>
                    <span className="font-bold text-slate-200">{overview?.serverAddress || server.ip}</span>
                  </div>

                  {/* 4. Port */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'MySQL Port' : 'پورت MySQL'}</span>
                    <span className="font-bold text-orange-400">{overview?.port || server.mysql_port || 3306}</span>
                  </div>

                  {/* 5. Current User */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Current User' : 'کاربر متصل'}</span>
                    <span className="font-bold text-emerald-400">{overview?.connectedUser || server.mysql_user || 'root'}</span>
                  </div>

                  {/* 6. Current Database */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Current Database' : 'پایگاه داده متصل'}</span>
                    <span className="font-bold text-cyan-400">{overview?.connectedDatabase || server.mysql_database || 'mysql'}</span>
                  </div>

                  {/* 7. Timezone */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Server Timezone' : 'منطقه زمانی سرور'}</span>
                    <span className="font-bold text-slate-200">{overview?.timezone || 'SYSTEM'}</span>
                  </div>

                  {/* 8. Character Set & Collation */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Charset / Collation' : 'کدگذاری و ترتیه‌بندی'}</span>
                    <span className="font-bold text-purple-300 truncate block" title={`${overview?.characterSet || 'utf8mb4'} / ${overview?.collation || 'utf8mb4_general_ci'}`}>
                      {overview?.characterSet || 'utf8mb4'} / {overview?.collation || 'utf8mb4_general_ci'}
                    </span>
                  </div>

                  {/* 9. Server Uptime */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Server Uptime' : 'مدت زمان فعالیت (Uptime)'}</span>
                    <span className="font-bold text-emerald-400">{overview?.uptimePretty || '—'}</span>
                  </div>

                  {/* 10. Connections (Current / Max) */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5 sm:col-span-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>{isEn ? 'Connections (Current / Max)' : 'اتصالات (فعال / حداکثر)'}</span>
                      <span className="font-mono text-cyan-400">
                        {overview?.threadsConnected ?? 0} / {overview?.maxConnections ?? 151}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.round(((overview?.threadsConnected ?? 0) / (overview?.maxConnections || 151)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* 11. Slow Queries */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Slow Queries' : 'کوئری‌های کند'}</span>
                    <span className={`font-bold ${(overview?.slowQueries ?? 0) > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {overview?.slowQueries ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. DATABASE BROWSER TAB (Phase 3) */}
          {activeTab === 'databases' && (
            <div className="flex flex-col h-full space-y-3">
              {/* Top Quick Status & Actions Bar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    <Layers className="w-4 h-4 text-orange-400" />
                    <span>{isEn ? 'MySQL Database Browser' : 'مرورگر و درخت ساختار پایگاه‌های داده MySQL'}</span>
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                      isLightMode ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {databases.length} {isEn ? 'Databases' : 'دیتابیس'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                      isLightMode ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {users.length} {isEn ? 'Users' : 'کاربر'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      loadDatabases();
                      loadUsers();
                      if (selectedTreeNode.type === 'database' && selectedTreeNode.dbName) {
                        loadDatabaseDetails(selectedTreeNode.dbName, true);
                      }
                    }}
                    disabled={isLoadingDatabases || isLoadingUsers}
                    className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition cursor-pointer ${
                      isLightMode
                        ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                        : 'border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDatabases || isLoadingUsers ? 'animate-spin text-orange-400' : ''}`} />
                    <span>{isEn ? 'Refresh Catalog' : 'بروزرسانی کاتالوگ'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const dbName = selectedTreeNode.dbName || server.mysql_database || 'mysql';
                      handleOpenSqlForDatabase(dbName);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>{isEn ? 'SQL Console' : 'کنسول SQL'}</span>
                  </button>
                </div>
              </div>

              {/* Main Split-Pane Explorer Layout */}
              <div
                className={`flex-1 flex flex-col md:flex-row rounded-xl border overflow-hidden min-h-[520px] ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                {/* ======================================================== */}
                {/* LEFT PANE: Hierarchical Database Object Tree              */}
                {/* ======================================================== */}
                <div
                  className={`w-full md:w-72 lg:w-80 shrink-0 border-b md:border-b-0 md:border-r flex flex-col ${
                    isLightMode ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/80 border-slate-800'
                  }`}
                >
                  {/* Tree Search Box */}
                  <div className="p-2.5 border-b border-inherit">
                    <div
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                        isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={treeSearch}
                        onChange={(e) => setTreeSearch(e.target.value)}
                        placeholder={isEn ? 'Filter tree nodes...' : 'فیلتر درخت اجزا...'}
                        className="w-full bg-transparent focus:outline-hidden text-xs"
                      />
                      {treeSearch && (
                        <button
                          type="button"
                          onClick={() => setTreeSearch('')}
                          className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tree Node Hierarchy */}
                  <div className="flex-1 overflow-y-auto p-2 text-xs select-none space-y-0.5 font-mono custom-scrollbar">
                    {/* 1. ROOT NODE: MySQL Server */}
                    <div>
                      <div
                        onClick={() =>
                          setSelectedTreeNode({
                            type: 'root',
                            id: 'root',
                            name: 'MySQL',
                          })
                        }
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition ${
                          selectedTreeNode.type === 'root'
                            ? isLightMode
                              ? 'bg-orange-100 text-orange-900 font-bold'
                              : 'bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30'
                            : isLightMode
                            ? 'hover:bg-slate-200/70 text-slate-800'
                            : 'hover:bg-slate-800/60 text-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTreeNode('root');
                          }}
                          className="p-0.5 hover:text-white"
                        >
                          {expandedTreeNodes.has('root') ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <Server className="w-4 h-4 text-orange-400 shrink-0" />
                        <span className="truncate font-sans font-semibold text-xs">MySQL</span>
                        <span className="text-[10px] text-slate-400 ml-auto font-mono">
                          {server.mysql_port || 3306}
                        </span>
                      </div>

                      {/* Children of Root */}
                      {expandedTreeNodes.has('root') && (
                        <div className="pl-4 pr-1 mt-1 space-y-0.5 border-l border-slate-700/30 ml-2.5">
                          {/* ======================================================== */}
                          {/* BRANCH A: Databases                                      */}
                          {/* ======================================================== */}
                          <div>
                            <div
                              onClick={() => {
                                setSelectedTreeNode({
                                  type: 'databases_folder',
                                  id: 'databases_folder',
                                  name: isEn ? 'Databases' : 'پایگاه‌های داده',
                                });
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                                selectedTreeNode.type === 'databases_folder'
                                  ? isLightMode
                                    ? 'bg-orange-100 text-orange-900 font-bold'
                                    : 'bg-orange-500/20 text-orange-400 font-bold'
                                  : isLightMode
                                  ? 'hover:bg-slate-200/70 text-slate-700'
                                  : 'hover:bg-slate-800/60 text-slate-300'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTreeNode('databases_folder');
                                }}
                                className="p-0.5 hover:text-white"
                              >
                                {expandedTreeNodes.has('databases_folder') ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {expandedTreeNodes.has('databases_folder') ? (
                                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              ) : (
                                <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                              <span className="truncate font-sans font-medium text-xs">
                                {isEn ? 'Databases' : 'پایگاه‌های داده'}
                              </span>
                              <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                                {databases.length}
                              </span>
                            </div>

                            {/* Database List */}
                            {expandedTreeNodes.has('databases_folder') && (
                              <div className="pl-3 mt-0.5 space-y-0.5 border-l border-slate-700/20 ml-2">
                                {databases
                                  .filter((db) => !treeSearch || db.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                  .map((db) => {
                                    const isSelected = selectedTreeNode.type === 'database' && selectedTreeNode.dbName === db.name;
                                    const isExpanded = expandedTreeNodes.has(`db:${db.name}`);
                                    const details = dbDetailsCache[db.name];
                                    const isLoadingDetails = loadingDbDetails.has(db.name);

                                    return (
                                      <div key={db.name}>
                                        <div
                                          onClick={() => {
                                            setSelectedTreeNode({
                                              type: 'database',
                                              id: `db:${db.name}`,
                                              name: db.name,
                                              dbName: db.name,
                                            });
                                            loadDatabaseDetails(db.name);
                                          }}
                                          className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition text-xs ${
                                            isSelected
                                              ? isLightMode
                                                ? 'bg-orange-100 text-orange-900 font-bold'
                                                : 'bg-orange-500/25 text-orange-300 font-bold border border-orange-500/30'
                                              : isLightMode
                                              ? 'hover:bg-slate-200 text-slate-700'
                                              : 'hover:bg-slate-800/60 text-slate-300'
                                          }`}
                                        >
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTreeNode(`db:${db.name}`, () => loadDatabaseDetails(db.name));
                                            }}
                                            className="p-0.5 hover:text-white"
                                          >
                                            {isExpanded ? (
                                              <ChevronDown className="w-3 h-3" />
                                            ) : (
                                              <ChevronRight className="w-3 h-3" />
                                            )}
                                          </button>
                                          <Database
                                            className={`w-3.5 h-3.5 shrink-0 ${
                                              db.isSystem ? 'text-slate-500' : 'text-orange-400'
                                            }`}
                                          />
                                          <span className="truncate flex-1 font-mono text-[11px]" title={db.name}>
                                            {db.name}
                                          </span>
                                          {db.isSystem ? (
                                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-500 font-sans">
                                              SYS
                                            </span>
                                          ) : (
                                            <span className="text-[10px] text-slate-400 font-mono">
                                              {db.tableCount}
                                            </span>
                                          )}
                                        </div>

                                        {/* Schema Objects sub-branches under database (Phase 4) */}
                                        {isExpanded && (
                                          <div className="pl-3 mt-0.5 space-y-0.5 border-l border-slate-700/20 ml-2">
                                            {isLoadingDetails ? (
                                              <div className="py-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                                                <RefreshCw className="w-3 h-3 animate-spin text-orange-400" />
                                                <span>{isEn ? 'Loading schema objects...' : 'در حال خواندن اجزای دیتابیس...'}</span>
                                              </div>
                                            ) : (
                                              <>
                                                {/* 1. TABLES FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'tables_folder',
                                                        id: `db:${db.name}:tables`,
                                                        name: isEn ? 'Tables' : 'جداول',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('tables');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'tables_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-orange-500/20 text-orange-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:tables`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:tables`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Table className="w-3 h-3 text-cyan-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Tables' : 'جداول'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.tables?.length ?? details?.tableCount ?? db.tableCount}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:tables`) && details?.tables && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.tables
                                                        .filter((t) => !treeSearch || t.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .slice(0, 100)
                                                        .map((table) => {
                                                          const isTableSelected =
                                                            selectedTreeNode.type === 'table' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.tableName === table.name;
                                                          return (
                                                            <div
                                                              key={table.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'table',
                                                                  id: `table:${db.name}:${table.name}`,
                                                                  name: table.name,
                                                                  dbName: db.name,
                                                                  tableName: table.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isTableSelected
                                                                  ? 'bg-orange-500/20 text-orange-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Table className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                                                              <span className="truncate flex-1" title={table.name}>
                                                                {table.name}
                                                              </span>
                                                              <span className="text-[9px] text-slate-500 font-mono">
                                                                {table.approxRows > 0 ? table.approxRows.toLocaleString() : '0'}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 2. VIEWS FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'views_folder',
                                                        id: `db:${db.name}:views`,
                                                        name: isEn ? 'Views' : 'نماها',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('views');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'views_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-purple-500/20 text-purple-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:views`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:views`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Eye className="w-3 h-3 text-purple-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Views' : 'نماها'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.views?.length ?? details?.viewsCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:views`) && details?.views && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.views
                                                        .filter((v) => !treeSearch || v.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((view) => {
                                                          const isViewSelected =
                                                            selectedTreeNode.type === 'view' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.viewName === view.name;
                                                          return (
                                                            <div
                                                              key={view.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'view',
                                                                  id: `view:${db.name}:${view.name}`,
                                                                  name: view.name,
                                                                  dbName: db.name,
                                                                  viewName: view.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isViewSelected
                                                                  ? 'bg-purple-500/25 text-purple-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Eye className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                                                              <span className="truncate flex-1" title={view.name}>
                                                                {view.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 3. STORED PROCEDURES FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'procedures_folder',
                                                        id: `db:${db.name}:procedures`,
                                                        name: isEn ? 'Stored Procedures' : 'رویه‌های ذخیره‌شده',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('procedures');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'procedures_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:procedures`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:procedures`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Code className="w-3 h-3 text-emerald-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Procedures' : 'رویه‌ها'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.procedures?.length ?? details?.proceduresCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:procedures`) && details?.procedures && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.procedures
                                                        .filter((p) => !treeSearch || p.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((proc) => {
                                                          const isProcSelected =
                                                            selectedTreeNode.type === 'procedure' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.procedureName === proc.name;
                                                          return (
                                                            <div
                                                              key={proc.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'procedure',
                                                                  id: `procedure:${db.name}:${proc.name}`,
                                                                  name: proc.name,
                                                                  dbName: db.name,
                                                                  procedureName: proc.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isProcSelected
                                                                  ? 'bg-emerald-500/25 text-emerald-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Code className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                                              <span className="truncate flex-1" title={proc.name}>
                                                                {proc.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 4. STORED FUNCTIONS FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'functions_folder',
                                                        id: `db:${db.name}:functions`,
                                                        name: isEn ? 'Stored Functions' : 'توابع ذخیره‌شده',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('functions');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'functions_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:functions`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:functions`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Functions' : 'توابع'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.functions?.length ?? details?.functionsCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:functions`) && details?.functions && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.functions
                                                        .filter((f) => !treeSearch || f.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((func) => {
                                                          const isFuncSelected =
                                                            selectedTreeNode.type === 'function' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.functionName === func.name;
                                                          return (
                                                            <div
                                                              key={func.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'function',
                                                                  id: `function:${db.name}:${func.name}`,
                                                                  name: func.name,
                                                                  dbName: db.name,
                                                                  functionName: func.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isFuncSelected
                                                                  ? 'bg-amber-500/25 text-amber-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                                              <span className="truncate flex-1" title={func.name}>
                                                                {func.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 5. TRIGGERS FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'triggers_folder',
                                                        id: `db:${db.name}:triggers`,
                                                        name: isEn ? 'Triggers' : 'تریگرها',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('triggers');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'triggers_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-rose-500/20 text-rose-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:triggers`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:triggers`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Activity className="w-3 h-3 text-rose-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Triggers' : 'تریگرها'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.triggers?.length ?? details?.triggersCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:triggers`) && details?.triggers && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.triggers
                                                        .filter((tr) => !treeSearch || tr.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((trig) => {
                                                          const isTrigSelected =
                                                            selectedTreeNode.type === 'trigger' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.triggerName === trig.name;
                                                          return (
                                                            <div
                                                              key={trig.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'trigger',
                                                                  id: `trigger:${db.name}:${trig.name}`,
                                                                  name: trig.name,
                                                                  dbName: db.name,
                                                                  triggerName: trig.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isTrigSelected
                                                                  ? 'bg-rose-500/25 text-rose-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Activity className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                                              <span className="truncate flex-1" title={trig.name}>
                                                                {trig.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 6. EVENTS FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'events_folder',
                                                        id: `db:${db.name}:events`,
                                                        name: isEn ? 'Scheduled Events' : 'رویدادها',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('events');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'events_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-blue-500/20 text-blue-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:events`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:events`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Events' : 'رویدادها'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.events?.length ?? details?.eventsCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:events`) && details?.events && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.events
                                                        .filter((ev) => !treeSearch || ev.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((event) => {
                                                          const isEventSelected =
                                                            selectedTreeNode.type === 'event' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.eventName === event.name;
                                                          return (
                                                            <div
                                                              key={event.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'event',
                                                                  id: `event:${db.name}:${event.name}`,
                                                                  name: event.name,
                                                                  dbName: db.name,
                                                                  eventName: event.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isEventSelected
                                                                  ? 'bg-blue-500/25 text-blue-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Clock className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                                                              <span className="truncate flex-1" title={event.name}>
                                                                {event.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 7. SEQUENCES FOLDER (if supported) */}
                                                {details?.sequences && details.sequences.length > 0 && (
                                                  <div>
                                                    <div
                                                      onClick={() => {
                                                        setSelectedTreeNode({
                                                          type: 'sequences_folder',
                                                          id: `db:${db.name}:sequences`,
                                                          name: isEn ? 'Sequences' : 'دنباله‌ها',
                                                          dbName: db.name,
                                                        });
                                                        setDbActiveObjectTab('sequences');
                                                      }}
                                                      className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                        selectedTreeNode.type === 'sequences_folder' && selectedTreeNode.dbName === db.name
                                                          ? 'bg-teal-500/20 text-teal-300 font-bold'
                                                          : isLightMode
                                                          ? 'hover:bg-slate-200 text-slate-700'
                                                          : 'hover:bg-white/5 text-slate-300'
                                                      }`}
                                                    >
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          toggleTreeNode(`db:${db.name}:sequences`);
                                                        }}
                                                        className="p-0.5 hover:text-white"
                                                      >
                                                        {expandedTreeNodes.has(`db:${db.name}:sequences`) ? (
                                                          <ChevronDown className="w-2.5 h-2.5" />
                                                        ) : (
                                                          <ChevronRight className="w-2.5 h-2.5" />
                                                        )}
                                                      </button>
                                                      <Hash className="w-3 h-3 text-teal-400 shrink-0" />
                                                      <span className="truncate flex-1">{isEn ? 'Sequences' : 'دنباله‌ها'}</span>
                                                      <span className="text-[10px] text-slate-500 font-mono">
                                                        {details.sequences.length}
                                                      </span>
                                                    </div>
                                                    {expandedTreeNodes.has(`db:${db.name}:sequences`) && (
                                                      <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                        {details.sequences
                                                          .filter((s) => !treeSearch || s.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                          .map((seq) => {
                                                            const isSeqSelected =
                                                              selectedTreeNode.type === 'sequence' &&
                                                              selectedTreeNode.dbName === db.name &&
                                                              selectedTreeNode.sequenceName === seq.name;
                                                            return (
                                                              <div
                                                                key={seq.name}
                                                                onClick={() => {
                                                                  setSelectedTreeNode({
                                                                    type: 'sequence',
                                                                    id: `sequence:${db.name}:${seq.name}`,
                                                                    name: seq.name,
                                                                    dbName: db.name,
                                                                    sequenceName: seq.name,
                                                                  });
                                                                }}
                                                                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                  isSeqSelected
                                                                    ? 'bg-teal-500/25 text-teal-300 font-bold'
                                                                    : isLightMode
                                                                    ? 'hover:bg-slate-200 text-slate-600'
                                                                    : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                                }`}
                                                              >
                                                                <Hash className="w-2.5 h-2.5 text-teal-400 shrink-0" />
                                                                <span className="truncate flex-1" title={seq.name}>
                                                                  {seq.name}
                                                                </span>
                                                              </div>
                                                            );
                                                          })}
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>

                          {/* ======================================================== */}
                          {/* BRANCH B: Users & Accounts                               */}
                          {/* ======================================================== */}
                          <div>
                            <div
                              onClick={() => {
                                setSelectedTreeNode({
                                  type: 'users_folder',
                                  id: 'users_folder',
                                  name: isEn ? 'Users & Accounts' : 'کاربران و دسترسی‌ها',
                                });
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                                selectedTreeNode.type === 'users_folder'
                                  ? isLightMode
                                    ? 'bg-orange-100 text-orange-900 font-bold'
                                    : 'bg-orange-500/20 text-orange-400 font-bold'
                                  : isLightMode
                                  ? 'hover:bg-slate-200/70 text-slate-700'
                                  : 'hover:bg-slate-800/60 text-slate-300'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTreeNode('users_folder');
                                }}
                                className="p-0.5 hover:text-white"
                              >
                                {expandedTreeNodes.has('users_folder') ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="truncate font-sans font-medium text-xs">
                                {isEn ? 'Users' : 'کاربران'}
                              </span>
                              <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                                {users.length}
                              </span>
                            </div>

                            {/* Users list */}
                            {expandedTreeNodes.has('users_folder') && (
                              <div className="pl-3 mt-0.5 space-y-0.5 border-l border-slate-700/20 ml-2">
                                {users
                                  .filter(
                                    (u) =>
                                      !treeSearch ||
                                      u.user.toLowerCase().includes(treeSearch.toLowerCase()) ||
                                      u.host.toLowerCase().includes(treeSearch.toLowerCase())
                                  )
                                  .map((u) => {
                                    const userKey = `${u.user}@${u.host}`;
                                    const isSelected = selectedTreeNode.type === 'user' && selectedTreeNode.userName === userKey;
                                    return (
                                      <div
                                        key={userKey}
                                        onClick={() => {
                                          setSelectedTreeNode({
                                            type: 'user',
                                            id: `user:${userKey}`,
                                            name: userKey,
                                            userName: userKey,
                                          });
                                        }}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[11px] transition font-mono ${
                                          isSelected
                                            ? 'bg-orange-500/25 text-orange-300 font-bold border border-orange-500/30'
                                            : isLightMode
                                            ? 'hover:bg-slate-200 text-slate-700'
                                            : 'hover:bg-slate-800/60 text-slate-300'
                                        }`}
                                      >
                                        <User className="w-3 h-3 text-cyan-400 shrink-0" />
                                        <span className="truncate flex-1" title={userKey}>
                                          {userKey}
                                        </span>
                                        {u.accountLocked && (
                                          <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 font-sans">
                                            {isEn ? 'Locked' : 'قفل'}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>

                          {/* ======================================================== */}
                          {/* BRANCH C: Server                                         */}
                          {/* ======================================================== */}
                          <div>
                            <div
                              onClick={() => {
                                setSelectedTreeNode({
                                  type: 'server_folder',
                                  id: 'server_folder',
                                  name: isEn ? 'Server' : 'سرور و متغیرها',
                                });
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                                selectedTreeNode.type === 'server_folder'
                                  ? isLightMode
                                    ? 'bg-orange-100 text-orange-900 font-bold'
                                    : 'bg-orange-500/20 text-orange-400 font-bold'
                                  : isLightMode
                                  ? 'hover:bg-slate-200/70 text-slate-700'
                                  : 'hover:bg-slate-800/60 text-slate-300'
                              }`}
                            >
                              <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-4" />
                              <span className="truncate font-sans font-medium text-xs">
                                {isEn ? 'Server & Engine' : 'سرور و متغیرها'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ======================================================== */}
                {/* RIGHT PANE: Object Details & Tables Browser View         */}
                {/* ======================================================== */}
                <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar">
                  {/* Breadcrumb Header */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                      <span>MySQL</span>
                      <span>/</span>
                      {selectedTreeNode.type === 'databases_folder' && (
                        <span className="text-orange-400 font-bold">{isEn ? 'Databases' : 'پایگاه‌های داده'}</span>
                      )}
                      {selectedTreeNode.type === 'database' && (
                        <>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}
                          >
                            {isEn ? 'Databases' : 'پایگاه‌های داده'}
                          </span>
                          <span>/</span>
                          <span className="text-orange-400 font-bold">{selectedTreeNode.dbName}</span>
                        </>
                      )}
                      {(selectedTreeNode.type === 'tables_folder' ||
                        selectedTreeNode.type === 'views_folder' ||
                        selectedTreeNode.type === 'procedures_folder' ||
                        selectedTreeNode.type === 'functions_folder' ||
                        selectedTreeNode.type === 'triggers_folder' ||
                        selectedTreeNode.type === 'events_folder' ||
                        selectedTreeNode.type === 'sequences_folder') && (
                        <>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}
                          >
                            {isEn ? 'Databases' : 'پایگاه‌های داده'}
                          </span>
                          <span>/</span>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() =>
                              setSelectedTreeNode({
                                type: 'database',
                                id: `db:${selectedTreeNode.dbName}`,
                                name: selectedTreeNode.dbName!,
                                dbName: selectedTreeNode.dbName,
                              })
                            }
                          >
                            {selectedTreeNode.dbName}
                          </span>
                          <span>/</span>
                          <span className="text-orange-400 font-bold">{selectedTreeNode.name}</span>
                        </>
                      )}
                      {(selectedTreeNode.type === 'table' ||
                        selectedTreeNode.type === 'view' ||
                        selectedTreeNode.type === 'procedure' ||
                        selectedTreeNode.type === 'function' ||
                        selectedTreeNode.type === 'trigger' ||
                        selectedTreeNode.type === 'event' ||
                        selectedTreeNode.type === 'sequence') && (
                        <>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}
                          >
                            {isEn ? 'Databases' : 'پایگاه‌های داده'}
                          </span>
                          <span>/</span>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() =>
                              setSelectedTreeNode({
                                type: 'database',
                                id: `db:${selectedTreeNode.dbName}`,
                                name: selectedTreeNode.dbName!,
                                dbName: selectedTreeNode.dbName,
                              })
                            }
                          >
                            {selectedTreeNode.dbName}
                          </span>
                          <span>/</span>
                          <span className="text-cyan-400 font-bold">{selectedTreeNode.name}</span>
                        </>
                      )}
                      {selectedTreeNode.type === 'users_folder' && (
                        <span className="text-blue-400 font-bold">{isEn ? 'Users & Accounts' : 'کاربران و دسترسی‌ها'}</span>
                      )}
                      {selectedTreeNode.type === 'user' && (
                        <>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() => setSelectedTreeNode({ type: 'users_folder', id: 'users_folder', name: 'Users' })}
                          >
                            {isEn ? 'Users' : 'کاربران'}
                          </span>
                          <span>/</span>
                          <span className="text-cyan-400 font-bold">{selectedTreeNode.userName}</span>
                        </>
                      )}
                      {selectedTreeNode.type === 'server_folder' && (
                        <span className="text-purple-400 font-bold">{isEn ? 'Server Overview' : 'مشخصات سرور'}</span>
                      )}
                      {selectedTreeNode.type === 'root' && (
                        <span className="text-slate-200 font-bold">{isEn ? 'Root' : 'ریشه'}</span>
                      )}
                    </div>

                    {selectedTreeNode.dbName && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedTreeNode.dbName!, 'db-name')}
                          className="px-2 py-1 rounded bg-black/20 hover:bg-black/40 text-[11px] font-mono flex items-center gap-1 text-slate-300 cursor-pointer"
                        >
                          {copiedSnippet === 'db-name' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedSnippet === 'db-name' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Name' : 'کپی نام')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSqlForDatabase(selectedTreeNode.dbName!, selectedTreeNode.tableName)}
                          className="px-2.5 py-1 rounded bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Terminal className="w-3 h-3" />
                          <span>{isEn ? 'Query in Console' : 'کوئری در کنسول'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* VIEW A: ROOT OR SERVER FOLDER                        */}
                  {/* ---------------------------------------------------- */}
                  {(selectedTreeNode.type === 'root' || selectedTreeNode.type === 'server_folder') && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-white/10 bg-black/10">
                        <h4 className="font-bold text-sm text-slate-200 mb-1 flex items-center gap-2">
                          <Server className="w-4 h-4 text-orange-400" />
                          <span>{server.name} — MySQL Engine</span>
                        </h4>
                        <p className="text-xs text-slate-400">
                          {overview?.serverVersion || `${overview?.version || 'MySQL'} Community Server`} • Port {server.mysql_port || 3306}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Databases' : 'تعداد دیتابیس‌ها'}</div>
                          <div className="text-xl font-bold text-orange-400 mt-1">{databases.length}</div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Total Tables' : 'مجموع جداول'}</div>
                          <div className="text-xl font-bold text-cyan-400 mt-1">
                            {databases.reduce((sum, d) => sum + d.tableCount, 0)}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Users' : 'کاربران سرور'}</div>
                          <div className="text-xl font-bold text-blue-400 mt-1">{users.length}</div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Uptime' : 'مدت فعالیت'}</div>
                          <div className="text-sm font-bold text-emerald-400 mt-1 truncate">{overview?.uptimePretty || '—'}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-slate-300"
                        >
                          <Folder className="w-3.5 h-3.5 text-amber-400" />
                          <span>{isEn ? 'Explore Databases' : 'مشاهده دیتابیس‌ها'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('users')}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-slate-300"
                        >
                          <Users className="w-3.5 h-3.5 text-blue-400" />
                          <span>{isEn ? 'Manage Accounts' : 'مشاهده کاربران'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('variables')}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-slate-300"
                        >
                          <Sliders className="w-3.5 h-3.5 text-purple-400" />
                          <span>{isEn ? 'System Variables' : 'متغیرهای سیستمی'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ---------------------------------------------------- */}
                  {/* VIEW B: ALL DATABASES GRID VIEW                      */}
                  {/* ---------------------------------------------------- */}
                  {selectedTreeNode.type === 'databases_folder' && (
                    <div className="space-y-4">
                      {/* Stat summary cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">{isEn ? 'All Databases' : 'کل دیتابیس‌ها'}</div>
                          <div className="text-xl font-bold font-mono text-orange-400 mt-1">{databases.length}</div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">{isEn ? 'User Databases' : 'دیتابیس‌های کاربری'}</div>
                          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                            {databases.filter((d) => !d.isSystem).length}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">{isEn ? 'System Schemas' : 'طرح‌واره‌های سیستمی'}</div>
                          <div className="text-xl font-bold font-mono text-slate-400 mt-1">
                            {databases.filter((d) => d.isSystem).length}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">{isEn ? 'Total Storage' : 'حجم کل داده‌ها'}</div>
                          <div className="text-base font-bold font-mono text-purple-400 mt-1">
                            {(() => {
                              const totalBytes = databases.reduce((sum, d) => sum + d.sizeBytes, 0);
                              if (totalBytes >= 1024 * 1024 * 1024) return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                              if (totalBytes >= 1024 * 1024) return `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
                              return `${(totalBytes / 1024).toFixed(1)} KB`;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Databases Table */}
                      <div className="rounded-xl border border-white/10 overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                            <tr className="border-b border-white/10 text-slate-400 font-semibold">
                              <th className="p-3">{isEn ? 'Database Name' : 'نام پایگاه داده'}</th>
                              <th className="p-3">{isEn ? 'Charset / Collation' : 'کدگذاری و ترتیه‌بندی'}</th>
                              <th className="p-3 text-center">{isEn ? 'Tables' : 'تعداد جداول'}</th>
                              <th className="p-3 text-right">{isEn ? 'Size' : 'حجم دیتابیس'}</th>
                              <th className="p-3 text-center">{isEn ? 'Action' : 'عملیات'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {databases.map((db) => (
                              <tr
                                key={db.name}
                                onClick={() => {
                                  setSelectedTreeNode({
                                    type: 'database',
                                    id: `db:${db.name}`,
                                    name: db.name,
                                    dbName: db.name,
                                  });
                                  loadDatabaseDetails(db.name);
                                }}
                                className={`transition cursor-pointer ${
                                  isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                }`}
                              >
                                <td className="p-3 flex items-center gap-2 font-bold text-slate-200">
                                  <Database className={`w-3.5 h-3.5 ${db.isSystem ? 'text-slate-500' : 'text-orange-400'}`} />
                                  <span>{db.name}</span>
                                  {db.isSystem && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-sans">
                                      SYSTEM
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-slate-400 text-[11px]">
                                  {db.defaultCharacterSet || 'utf8mb4'} • {db.defaultCollation}
                                </td>
                                <td className="p-3 text-center text-cyan-400 font-bold">{db.tableCount}</td>
                                <td className="p-3 text-right text-emerald-400 font-bold">{db.sizePretty}</td>
                                <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSqlForDatabase(db.name)}
                                    className="p-1 rounded hover:bg-orange-500/20 text-slate-400 hover:text-orange-300"
                                    title={isEn ? 'Query Database' : 'کوئری روی دیتابیس'}
                                  >
                                    <Terminal className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ---------------------------------------------------- */}
                  {/* VIEW C: INDIVIDUAL DATABASE SCHEMA & OBJECT EXPLORER */}
                  {/* ---------------------------------------------------- */}
                  {selectedTreeNode.dbName &&
                    (selectedTreeNode.type === 'database' ||
                      selectedTreeNode.type === 'tables_folder' ||
                      selectedTreeNode.type === 'views_folder' ||
                      selectedTreeNode.type === 'procedures_folder' ||
                      selectedTreeNode.type === 'functions_folder' ||
                      selectedTreeNode.type === 'triggers_folder' ||
                      selectedTreeNode.type === 'events_folder' ||
                      selectedTreeNode.type === 'sequences_folder' ||
                      selectedTreeNode.type === 'table' ||
                      selectedTreeNode.type === 'view' ||
                      selectedTreeNode.type === 'procedure' ||
                      selectedTreeNode.type === 'function' ||
                      selectedTreeNode.type === 'trigger' ||
                      selectedTreeNode.type === 'event' ||
                      selectedTreeNode.type === 'sequence') && (
                      <div className="space-y-4">
                        {(() => {
                          const dbName = selectedTreeNode.dbName!;
                          const details = dbDetailsCache[dbName];
                          const dbMeta = databases.find((d) => d.name === dbName);
                          const isLoading = loadingDbDetails.has(dbName);

                          // ========================================================
                          // SUB-VIEW 1: INDIVIDUAL VIEW INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'view') {
                            const currentView = details?.views?.find(
                              (v) => v.name === selectedTreeNode.viewName || v.name === selectedTreeNode.name
                            );
                            const viewDef = currentView?.definition
                              ? `CREATE OR REPLACE ALGORITHM = UNDEFINED\nVIEW \`${dbName}\`.\`${currentView.name}\` AS\n${currentView.definition};`
                              : `-- No definition retrieved for view \`${dbName}\`.\`${selectedTreeNode.name}\``;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'views_folder',
                                          id: `db:${dbName}:views`,
                                          name: isEn ? 'Views' : 'نماها',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('views');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Views' : 'بازگشت به نماها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Eye className="w-4 h-4 text-purple-400" />
                                      <span className="font-bold text-sm font-mono text-purple-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-sans font-bold">
                                        VIEW
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(viewDef, `view-def-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `view-def-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `view-def-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied SQL' : 'کپی شد'
                                          : isEn ? 'Copy View SQL' : 'کپی SQL نما'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSqlForDatabase(dbName, selectedTreeNode.name)}
                                      className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                      <span>{isEn ? 'Query View' : 'اجرای کوئری'}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Updatable' : 'قابل ویرایش'}
                                    </div>
                                    <div className="text-sm font-bold font-mono mt-1">
                                      {currentView?.isUpdatable ? (
                                        <span className="text-emerald-400">YES</span>
                                      ) : (
                                        <span className="text-slate-400">NO</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Check Option' : 'بررسی محدودیت'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                                      {currentView?.checkOption || 'NONE'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Security Type' : 'نوع امنیت'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-purple-300 mt-1">
                                      {currentView?.securityType || 'DEFINER'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Created At' : 'تاریخ ساخت'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate">
                                      {currentView?.createTime ? new Date(currentView.createTime).toLocaleDateString() : '—'}
                                    </div>
                                  </div>
                                </div>

                                {/* Definition Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Code className="w-3.5 h-3.5 text-purple-400" />
                                      <span>{isEn ? 'View Definition (SQL DDL)' : 'تعریف SQL نما (DDL)'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-purple-500/20 bg-slate-950 font-mono text-xs text-purple-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {viewDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 2: INDIVIDUAL STORED PROCEDURE INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'procedure') {
                            const proc = details?.procedures?.find(
                              (p) => p.name === selectedTreeNode.procedureName || p.name === selectedTreeNode.name
                            );
                            const procDef = proc?.definition || proc?.body || `-- Routine body not available or empty`;
                            const callStmt = `CALL \`${dbName}\`.\`${selectedTreeNode.name}\`();`;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'procedures_folder',
                                          id: `db:${dbName}:procedures`,
                                          name: isEn ? 'Stored Procedures' : 'رویه‌های ذخیره‌شده',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('procedures');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Procedures' : 'بازگشت به رویه‌ها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Code className="w-4 h-4 text-emerald-400" />
                                      <span className="font-bold text-sm font-mono text-emerald-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-sans font-bold">
                                        PROCEDURE
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(callStmt, `call-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `call-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `call-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied' : 'کپی شد'
                                          : isEn ? 'Copy CALL' : 'کپی دستور CALL'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSqlForDatabase(dbName, undefined, callStmt)}
                                      className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                      <span>{isEn ? 'Open in Console' : 'کنسول SQL'}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Definer' : 'مالک/تعریف‌کننده'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={proc?.definer}>
                                      {proc?.definer || 'root@localhost'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Security Context' : 'زمینه امنیتی'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                                      {proc?.securityType || 'DEFINER'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Deterministic' : 'قطعی/تکرارپذیر'}
                                    </div>
                                    <div className="text-sm font-bold font-mono mt-1">
                                      {proc?.isDeterministic ? (
                                        <span className="text-emerald-400">YES</span>
                                      ) : (
                                        <span className="text-slate-400">NO</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Data Access' : 'سطح دسترسی داده'}
                                    </div>
                                    <div className="text-xs font-mono text-amber-300 mt-1 truncate">
                                      {proc?.sqlDataAccess || 'CONTAINS SQL'}
                                    </div>
                                  </div>
                                </div>

                                {/* Definition Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Code className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>{isEn ? 'Procedure Routine Definition' : 'متن و کدهای رویه ذخیره‌شده'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-emerald-500/20 bg-slate-950 font-mono text-xs text-emerald-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {procDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 3: INDIVIDUAL STORED FUNCTION INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'function') {
                            const func = details?.functions?.find(
                              (f) => f.name === selectedTreeNode.functionName || f.name === selectedTreeNode.name
                            );
                            const funcDef = func?.definition || func?.body || `-- Function body not available or empty`;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'functions_folder',
                                          id: `db:${dbName}:functions`,
                                          name: isEn ? 'Stored Functions' : 'توابع ذخیره‌شده',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('functions');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Functions' : 'بازگشت به توابع'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Zap className="w-4 h-4 text-amber-400" />
                                      <span className="font-bold text-sm font-mono text-amber-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-sans font-bold">
                                        FUNCTION
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(funcDef, `func-def-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `func-def-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `func-def-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied' : 'کپی شد'
                                          : isEn ? 'Copy Function SQL' : 'کپی متن تابع'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Return Type' : 'نوع بازگشتی'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-amber-300 mt-1">
                                      {func?.returnType || 'text'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Definer' : 'مالک'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={func?.definer}>
                                      {func?.definer || 'root@localhost'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Security Type' : 'نوع امنیت'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                                      {func?.securityType || 'DEFINER'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Deterministic' : 'قطعی'}
                                    </div>
                                    <div className="text-sm font-bold font-mono mt-1">
                                      {func?.isDeterministic ? (
                                        <span className="text-emerald-400">YES</span>
                                      ) : (
                                        <span className="text-slate-400">NO</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Definition Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                                      <span>{isEn ? 'Function Routine Body' : 'کدهای بدنه تابع'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-amber-500/20 bg-slate-950 font-mono text-xs text-amber-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {funcDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 4: INDIVIDUAL TRIGGER INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'trigger') {
                            const trig = details?.triggers?.find(
                              (tr) => tr.name === selectedTreeNode.triggerName || tr.name === selectedTreeNode.name
                            );
                            const trigDef = trig?.statement
                              ? `CREATE TRIGGER \`${trig.name}\`\n${trig.timing} ${trig.event} ON \`${trig.tableName}\`\nFOR EACH ROW\n${trig.statement};`
                              : `-- Trigger statement not available`;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'triggers_folder',
                                          id: `db:${dbName}:triggers`,
                                          name: isEn ? 'Triggers' : 'تریگرها',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('triggers');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Triggers' : 'بازگشت به تریگرها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Activity className="w-4 h-4 text-rose-400" />
                                      <span className="font-bold text-sm font-mono text-rose-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-sans font-bold">
                                        TRIGGER
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(trigDef, `trig-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `trig-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `trig-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied' : 'کپی شد'
                                          : isEn ? 'Copy Trigger SQL' : 'کپی متن تریگر'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Target Table' : 'جدول هدف'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1 truncate">
                                      {trig?.tableName || '—'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Timing' : 'زمان اجرا'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-rose-300 mt-1">
                                      {trig?.timing || 'BEFORE'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Event' : 'عملیات عامل'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-amber-300 mt-1">
                                      {trig?.event || 'INSERT'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Definer' : 'مالک'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={trig?.definer}>
                                      {trig?.definer || 'root@localhost'}
                                    </div>
                                  </div>
                                </div>

                                {/* Statement Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Activity className="w-3.5 h-3.5 text-rose-400" />
                                      <span>{isEn ? 'Trigger Action Statement' : 'دستورات اجرایی تریگر'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-rose-500/20 bg-slate-950 font-mono text-xs text-rose-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {trigDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 5: INDIVIDUAL SCHEDULED EVENT INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'event') {
                            const ev = details?.events?.find(
                              (e) => e.name === selectedTreeNode.eventName || e.name === selectedTreeNode.name
                            );
                            const evDef = ev?.definition || `-- Scheduled event body not available`;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'events_folder',
                                          id: `db:${dbName}:events`,
                                          name: isEn ? 'Scheduled Events' : 'رویدادها',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('events');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Events' : 'بازگشت به رویدادها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-4 h-4 text-blue-400" />
                                      <span className="font-bold text-sm font-mono text-blue-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-sans font-bold">
                                        EVENT
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(evDef, `ev-def-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `ev-def-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `ev-def-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied' : 'کپی شد'
                                          : isEn ? 'Copy Event SQL' : 'کپی متن رویداد'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Status' : 'وضعیت'}
                                    </div>
                                    <div className="text-sm font-bold font-mono mt-1">
                                      {ev?.status === 'ENABLED' ? (
                                        <span className="text-emerald-400">ENABLED</span>
                                      ) : (
                                        <span className="text-rose-400">{ev?.status || 'DISABLED'}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Schedule Type' : 'نوع زمان‌بندی'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                                      {ev?.type || 'RECURRING'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Interval' : 'دوره تکرار'}
                                    </div>
                                    <div className="text-xs font-mono text-amber-300 mt-1">
                                      {ev?.intervalValue ? `${ev.intervalValue} ${ev.intervalField || ''}` : 'One-time'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Definer' : 'مالک'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={ev?.definer}>
                                      {ev?.definer || 'root@localhost'}
                                    </div>
                                  </div>
                                </div>

                                {/* Event Definition Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                                      <span>{isEn ? 'Event Scheduler Body' : 'کدهای رویداد زمان‌بندی‌شده'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-blue-500/20 bg-slate-950 font-mono text-xs text-blue-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {evDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 6: INDIVIDUAL SEQUENCE INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'sequence') {
                            const seq = details?.sequences?.find(
                              (s) => s.name === selectedTreeNode.sequenceName || s.name === selectedTreeNode.name
                            );

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'sequences_folder',
                                          id: `db:${dbName}:sequences`,
                                          name: isEn ? 'Sequences' : 'دنباله‌ها',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('sequences');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Sequences' : 'بازگشت به دنباله‌ها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Hash className="w-4 h-4 text-teal-400" />
                                      <span className="font-bold text-sm font-mono text-teal-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-teal-500/20 text-teal-300 font-sans font-bold">
                                        SEQUENCE
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Start Value' : 'مقدار شروع'}
                                    </div>
                                    <div className="text-sm font-bold text-teal-300 mt-1">{seq?.startValue ?? '1'}</div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Minimum Value' : 'حداقل مقدار'}
                                    </div>
                                    <div className="text-sm font-bold text-slate-300 mt-1">{seq?.minimumValue ?? '1'}</div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Maximum Value' : 'حداکثر مقدار'}
                                    </div>
                                    <div className="text-sm font-bold text-slate-300 mt-1">{seq?.maximumValue ?? '—'}</div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Increment' : 'گام افزایش'}
                                    </div>
                                    <div className="text-sm font-bold text-emerald-400 mt-1">{seq?.increment ?? '1'}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 0: PHASE 5 - INDIVIDUAL TABLE INSPECTOR & DATA VIEWER
                          // ========================================================
                          if (selectedTreeNode.type === 'table') {
                            const tableName = selectedTreeNode.tableName || selectedTreeNode.name;
                            const structKey = `${dbName}:${tableName}`;
                            const struct = tableStructures[structKey];
                            const summary = details?.tables?.find((t) => t.name === tableName);

                            return (
                              <div className="space-y-4">
                                {/* Table Header Bar */}
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'tables_folder',
                                          id: `db:${dbName}:tables`,
                                          name: isEn ? 'Tables' : 'جداول',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('tables');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Tables' : 'بازگشت به جداول'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        <Table className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-base font-mono text-emerald-200">{tableName}</span>
                                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-sans font-bold border border-emerald-500/30">
                                            {struct?.metadata.engine || summary?.engine || 'InnoDB'}
                                          </span>
                                          {struct && struct.primaryKeyColumns.length > 0 && (
                                            <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-mono font-bold border border-blue-500/30 flex items-center gap-1">
                                              <Key className="w-3 h-3" />
                                              <span>PK: {struct.primaryKeyColumns.join(', ')}</span>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(tableName, `tbl-name-${tableName}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `tbl-name-${tableName}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>{isEn ? 'Copy Name' : 'کپی نام'}</span>
                                    </button>
                                    {/* Phase 13: Table Structure & Options Modal Trigger */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenStructureModal("alter_table", { tableName })}
                                      className="px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                                      title={isEn ? "Alter Table Engine, Charset & Options or Rename" : "تنظیمات موتور، نویسه‌ها یا تغییر نام جدول"}
                                    >
                                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                                      <span>{isEn ? "Table Options" : "تنظیمات جدول"}</span>
                                    </button>
                                    {/* Phase 15: Table Export & Dump Modal Trigger */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenBackupModal({ tableName })}
                                      className="px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                                      title={isEn ? "Export or Dump this table to SQL/JSON/CSV" : "استخراج و تهیه فایل پشتیبان از این جدول"}
                                    >
                                      <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                                      <span>{isEn ? "Export / Dump" : "پشتیبان / خروجی"}</span>
                                    </button>

                                    {/* Phase 13: Truncate Table Action */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenStructureModal("drop_confirm", { tableName, dropType: "truncate_table" })}
                                      className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                                      title={isEn ? "Truncate all rows in this table" : "پاکسازی تمام سطرهای جدول"}
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                      <span>{isEn ? "Truncate" : "پاکسازی"}</span>
                                    </button>

                                    {/* Phase 13: Drop Table Action */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenStructureModal("drop_confirm", { tableName, dropType: "table" })}
                                      className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                                      title={isEn ? "Permanently drop this table" : "حذف کامل این جدول"}
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                      <span>{isEn ? "Drop Table" : "حذف جدول"}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenSqlForDatabase(dbName, tableName)}
                                      className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                      <span>{isEn ? 'SQL Console' : 'کنسول SQL'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        loadTableStructure(dbName, tableName, true);
                                        loadTableData(dbName, tableName, tableDataPage);
                                      }}
                                      disabled={loadingTableStructure || loadingTableData}
                                      className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                      title={isEn ? 'Refresh' : 'تازه‌سازی'}
                                    >
                                      <RefreshCw className={`w-3.5 h-3.5 ${(loadingTableStructure || loadingTableData) ? 'animate-spin text-orange-400' : ''}`} />
                                    </button>
                                  </div>
                                </div>

                                {/* Quick Metrics Bar */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono">
                                  <div className="p-2.5 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 font-sans font-bold uppercase truncate">{isEn ? 'Rows (Approx)' : 'تعداد سطر (تقریبی)'}</div>
                                    <div className="text-sm font-bold text-cyan-400 mt-0.5">
                                      {(struct ? struct.metadata.approxRows : summary?.approxRows || 0).toLocaleString()}
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 font-sans font-bold uppercase truncate">{isEn ? 'Columns' : 'تعداد ستون‌ها'}</div>
                                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                                      {struct ? struct.columns.length : '—'}
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 font-sans font-bold uppercase truncate">{isEn ? 'Total Size' : 'فضای کل'}</div>
                                    <div className="text-sm font-bold text-purple-400 mt-0.5">
                                      {struct ? struct.metadata.totalSizePretty : summary?.totalSizePretty || '0 B'}
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 font-sans font-bold uppercase truncate">{isEn ? 'Data Length' : 'حجم داده'}</div>
                                    <div className="text-sm font-bold text-slate-200 mt-0.5">
                                      {struct ? struct.metadata.dataLengthPretty : summary?.dataLengthPretty || '0 B'}
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 font-sans font-bold uppercase truncate">{isEn ? 'Index Length' : 'حجم ایندکس'}</div>
                                    <div className="text-sm font-bold text-blue-400 mt-0.5">
                                      {struct ? struct.metadata.indexLengthPretty : summary?.indexLengthPretty || '0 B'}
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 font-sans font-bold uppercase truncate">{isEn ? 'Row Format' : 'فرمت سطر'}</div>
                                    <div className="text-sm font-bold text-amber-300 mt-0.5 truncate">
                                      {struct?.metadata.rowFormat || 'Dynamic'}
                                    </div>
                                  </div>
                                </div>

                                {/* Sub-Tabs Selector */}
                                <div className="flex items-center gap-1.5 border-b border-white/10 pb-2 overflow-x-auto text-xs font-semibold">
                                  <button
                                    type="button"
                                    onClick={() => setTableActiveSubTab('data')}
                                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                      tableActiveSubTab === 'data'
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                    }`}
                                  >
                                    <Table className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Data Viewer' : 'مرورگر داده‌ها'}</span>
                                    {tableDataResult && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-orange-500/30 text-orange-200">
                                        {tableDataResult.totalRows.toLocaleString()}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTableActiveSubTab('columns')}
                                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                      tableActiveSubTab === 'columns'
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                    }`}
                                  >
                                    <Layers className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Columns' : 'ستون‌ها'}</span>
                                    {struct && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white/10 text-slate-300">
                                        {struct.columns.length}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTableActiveSubTab('indexes')}
                                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                      tableActiveSubTab === 'indexes'
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                    }`}
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Indexes' : 'ایندکس‌ها'}</span>
                                    {struct && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white/10 text-slate-300">
                                        {struct.indexes.length}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTableActiveSubTab('foreignKeys')}
                                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                      tableActiveSubTab === 'foreignKeys'
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                    }`}
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Foreign Keys' : 'کلیدهای خارجی'}</span>
                                    {struct && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white/10 text-slate-300">
                                        {struct.foreignKeys.length}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTableActiveSubTab('options')}
                                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                      tableActiveSubTab === 'options'
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                    }`}
                                  >
                                    <Sliders className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Engine & Options' : 'موتور و تنظیمات'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTableActiveSubTab('ddl')}
                                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                      tableActiveSubTab === 'ddl'
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                    }`}
                                  >
                                    <Code className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'CREATE TABLE DDL' : 'کد DDL'}</span>
                                  </button>
                                </div>

                                {/* Loading Structure State */}
                                {loadingTableStructure && !struct && (
                                  <div className="p-8 rounded-xl border border-white/10 bg-black/20 text-center space-y-2">
                                    <RefreshCw className="w-7 h-7 text-orange-400 animate-spin mx-auto" />
                                    <p className="text-sm font-bold text-slate-200">
                                      {isEn ? 'Inspecting Table Structure & Metadata...' : 'در حال بررسی ساختار جدول و متادیتا...'}
                                    </p>
                                    <p className="text-xs text-slate-400 font-mono">
                                      {isEn ? 'Querying columns, keys, indexes, and storage engine specifications' : 'واکشی مشخصات ستون‌ها، کلیدها، ایندکس‌ها و موتور ذخیره‌سازی'}
                                    </p>
                                  </div>
                                )}

                                {/* Error State */}
                                {tableStructureError && !struct && (
                                  <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                                      <span>{tableStructureError}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => loadTableStructure(dbName, tableName, true)}
                                      className="px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/40 font-bold hover:bg-rose-500/30 cursor-pointer"
                                    >
                                      {isEn ? 'Retry' : 'تلاش مجدد'}
                                    </button>
                                  </div>
                                )}

                                {/* SUB-TAB 1: PHASE 6 - LIVE TABLE DATA VIEWER */}
                                {tableActiveSubTab === 'data' && (() => {
                                  const structKey = `${dbName}:${tableName}`;
                                  const struct = tableStructures[structKey];
                                  const availableCols: MysqlTableDataColumnInfo[] =
                                    tableDataResult?.columns && tableDataResult.columns.length > 0
                                      ? tableDataResult.columns
                                      : (struct?.columns || []).map((c) => ({
                                          name: c.name,
                                          dataType: c.dataType,
                                          columnType: c.columnType || c.dataType,
                                          isPrimaryKey: c.isPrimaryKey,
                                        }));
                                  const visibleCols = availableCols.filter((c) => !dataHiddenColumns[c.name]);
                                  const inspectingRow =
                                    inspectingRowIndex !== null && tableDataResult?.rows
                                      ? tableDataResult.rows[inspectingRowIndex]
                                      : null;

                                  return (
                                    <div className="space-y-3">
                                      {/* Phase 7: Mutation Notice Banner */}
                                      {rowMutationNotice && (
                                        <div
                                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150 ${
                                            rowMutationNotice.type === 'success'
                                              ? isLightMode
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                                              : isLightMode
                                              ? 'bg-red-50 border-red-200 text-red-800'
                                              : 'bg-red-950/40 border-red-800/60 text-red-300'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            {rowMutationNotice.type === 'success' ? (
                                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                            ) : (
                                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                            )}
                                            <span className="font-medium">{rowMutationNotice.message}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setRowMutationNotice(null)}
                                            className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )}

                                      {/* Data Controls Bar */}
                                      <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
                                        isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-black/20 border-white/10'
                                      }`}>
                                        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-xl flex-wrap">
                                          {/* Search Input Form */}
                                          <div className="relative flex-1 min-w-[180px]">
                                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            <input
                                              type="text"
                                              value={tableDataSearch}
                                              onChange={(e) => setTableDataSearch(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  loadTableData(dbName, tableName, 1, undefined, undefined, undefined, tableDataSearch);
                                                }
                                              }}
                                              placeholder={isEn ? 'Search records (Press Enter)...' : 'جستجو در رکوردها (اینتر بزنید)...'}
                                              className={`w-full pl-9 pr-14 py-1.5 rounded-lg border text-xs outline-none transition font-mono ${
                                                isLightMode
                                                  ? 'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-orange-500'
                                                  : 'bg-slate-900/80 border-white/10 text-slate-200 placeholder:text-slate-500 focus:border-orange-500/60'
                                              }`}
                                            />
                                            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                              {tableDataSearch && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setTableDataSearch('');
                                                    loadTableData(dbName, tableName, 1, undefined, undefined, undefined, '');
                                                  }}
                                                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                                                  title={isEn ? 'Clear search' : 'پاک کردن جستجو'}
                                                >
                                                  <X className="w-3 h-3" />
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => loadTableData(dbName, tableName, 1, undefined, undefined, undefined, tableDataSearch)}
                                                className="px-1.5 py-0.5 rounded bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-[10px] font-bold cursor-pointer"
                                              >
                                                {isEn ? 'Go' : 'برو'}
                                              </button>
                                            </div>
                                          </div>

                                          {/* Filters Toggle Button */}
                                          <button
                                            type="button"
                                            onClick={() => setShowFilterBuilder((prev) => !prev)}
                                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                                              showFilterBuilder || tableDataFilters.length > 0
                                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-sm'
                                                : isLightMode
                                                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                                : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                                            }`}
                                          >
                                            <Filter className="w-3.5 h-3.5 text-blue-400" />
                                            <span>{isEn ? 'Filters' : 'فیلترها'}</span>
                                            {tableDataFilters.length > 0 && (
                                              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-500 text-white font-bold">
                                                {tableDataFilters.length}
                                              </span>
                                            )}
                                          </button>

                                          {/* Columns Visibility Toggle Button */}
                                          <button
                                            type="button"
                                            onClick={() => setIsColumnVisibilityOpen((prev) => !prev)}
                                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                                              isColumnVisibilityOpen || Object.keys(dataHiddenColumns).length > 0
                                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm'
                                                : isLightMode
                                                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                                : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                                            }`}
                                          >
                                            <Eye className="w-3.5 h-3.5 text-purple-400" />
                                            <span>{isEn ? 'Columns' : 'ستون‌ها'}</span>
                                            <span className="text-[10px] font-mono text-slate-400">
                                              ({visibleCols.length}/{availableCols.length})
                                            </span>
                                          </button>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap text-xs">
                                          {/* Page Size Selector */}
                                          <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                                            <span className="text-[11px] font-sans">{isEn ? 'Rows:' : 'سطر:'}</span>
                                            <select
                                              value={tableDataPageSize}
                                              onChange={(e) => {
                                                const newSize = Number(e.target.value);
                                                setTableDataPageSize(newSize);
                                                loadTableData(dbName, tableName, 1, newSize);
                                              }}
                                              className={`px-2 py-1 rounded-lg border text-xs outline-none cursor-pointer ${
                                                isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/10 text-slate-200'
                                              }`}
                                            >
                                              <option value={25}>25</option>
                                              <option value={50}>50</option>
                                              <option value={100}>100</option>
                                              <option value={200}>200</option>
                                              <option value={500}>500</option>
                                            </select>
                                          </div>

                                          {/* Export CSV / JSON */}
                                          <div className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={() => exportTableData('csv')}
                                              disabled={!tableDataResult || tableDataResult.rows.length === 0}
                                              className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1 cursor-pointer transition disabled:opacity-40 text-[11px] font-semibold ${
                                                isLightMode
                                                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                                  : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                                              }`}
                                              title={isEn ? 'Export visible columns as CSV' : 'خروجی CSV از ستون‌های قابل مشاهده'}
                                            >
                                              <Download className="w-3.5 h-3.5 text-emerald-400" />
                                              <span>CSV</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => exportTableData('json')}
                                              disabled={!tableDataResult || tableDataResult.rows.length === 0}
                                              className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1 cursor-pointer transition disabled:opacity-40 text-[11px] font-semibold ${
                                                isLightMode
                                                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                                  : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                                              }`}
                                              title={isEn ? 'Export page records as JSON' : 'خروجی JSON از رکوردهای صفحه'}
                                            >
                                              <Download className="w-3.5 h-3.5 text-purple-400" />
                                              <span>JSON</span>
                                            </button>
                                          </div>

                                          {/* Refresh Button */}
                                          <button
                                            type="button"
                                            onClick={() => loadTableData(dbName, tableName, tableDataPage)}
                                            disabled={loadingTableData}
                                            className={`p-1.5 rounded-lg border cursor-pointer transition disabled:opacity-50 ${
                                              isLightMode
                                                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                                : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                                            }`}
                                            title={isEn ? 'Reload table data' : 'بارگذاری مجدد داده‌های جدول'}
                                          >
                                            <RefreshCw className={`w-3.5 h-3.5 ${loadingTableData ? 'animate-spin text-orange-400' : ''}`} />
                                          </button>

                                          {/* Phase 7: Insert Row Button */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedRowForMutation(null);
                                              setRowMutationModalMode('insert');
                                              setIsRowMutationModalOpen(true);
                                            }}
                                            className="px-3 py-1.5 rounded-lg border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer transition bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm shadow-emerald-600/30"
                                            title={isEn ? 'Insert new row into this table' : 'درج سطر جدید در این جدول'}
                                          >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>{isEn ? 'Insert Row' : 'درج سطر جدید'}</span>
                                          </button>
                                        </div>
                                      </div>

                                      {/* Collapsible Filter Builder Panel */}
                                      {showFilterBuilder && (
                                        <div
                                          className={`p-3.5 rounded-xl border space-y-3 animate-in fade-in duration-150 ${
                                            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800 shadow-xl'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <h6 className="font-bold text-xs flex items-center gap-1.5 text-blue-400 uppercase tracking-wider">
                                              <Filter className="w-3.5 h-3.5" />
                                              <span>{isEn ? 'Advanced Table Column Filters' : 'فیلترهای پیشرفته ستون‌ها'}</span>
                                            </h6>
                                            {tableDataFilters.length > 0 && (
                                              <button
                                                type="button"
                                                onClick={handleClearAllFilters}
                                                className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 transition cursor-pointer"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                                <span>{isEn ? 'Clear All Filters' : 'حذف همه فیلترها'}</span>
                                              </button>
                                            )}
                                          </div>

                                          {/* Active Filters Badges */}
                                          {tableDataFilters.length > 0 && (
                                            <div className="space-y-1.5">
                                              {tableDataFilters.map((f, idx) => (
                                                <div
                                                  key={idx}
                                                  className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-black/20 border border-slate-800 text-xs font-mono"
                                                >
                                                  <span className="font-bold text-slate-200">`{f.column}`</span>
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                    {f.operator}
                                                  </span>
                                                  {f.operator !== 'isNull' && f.operator !== 'isNotNull' && (
                                                    <span className="text-amber-300 font-bold bg-black/40 px-1.5 py-0.5 rounded">
                                                      "{f.value}"
                                                    </span>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={() => handleRemoveFilter(idx)}
                                                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition ml-auto cursor-pointer"
                                                    title={isEn ? 'Remove filter' : 'حذف فیلتر'}
                                                  >
                                                    <X className="w-3.5 h-3.5" />
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {/* Add New Filter Row */}
                                          <div className="flex items-center gap-2 flex-wrap pt-1">
                                            <select
                                              value={newFilterColumn || (availableCols[0]?.name || '')}
                                              onChange={(e) => setNewFilterColumn(e.target.value)}
                                              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                                                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                                              }`}
                                            >
                                              {availableCols.map((c) => (
                                                <option key={c.name} value={c.name}>
                                                  {c.name} ({c.dataType})
                                                </option>
                                              ))}
                                            </select>

                                            <select
                                              value={newFilterOperator}
                                              onChange={(e) => setNewFilterOperator(e.target.value as MysqlFilterOperator)}
                                              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                                                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                                              }`}
                                            >
                                              <option value="eq">= ({isEn ? 'Equals' : 'برابر'})</option>
                                              <option value="neq">!= ({isEn ? 'Not Equals' : 'نامساوی'})</option>
                                              <option value="contains">LIKE %v% ({isEn ? 'Contains' : 'شامل'})</option>
                                              <option value="notContains">NOT LIKE %v% ({isEn ? 'Not Contains' : 'شامل نشود'})</option>
                                              <option value="startsWith">LIKE v% ({isEn ? 'Starts With' : 'شروع با'})</option>
                                              <option value="endsWith">LIKE %v ({isEn ? 'Ends With' : 'پایان با'})</option>
                                              <option value="gt">&gt; ({isEn ? 'Greater Than' : 'بزرگتر'})</option>
                                              <option value="gte">&gt;= ({isEn ? 'Greater/Equal' : 'بزرگتر مساوی'})</option>
                                              <option value="lt">&lt; ({isEn ? 'Less Than' : 'کوچکتر'})</option>
                                              <option value="lte">&lt;= ({isEn ? 'Less/Equal' : 'کوچکتر مساوی'})</option>
                                              <option value="isNull">IS NULL</option>
                                              <option value="isNotNull">IS NOT NULL</option>
                                            </select>

                                            {newFilterOperator !== 'isNull' && newFilterOperator !== 'isNotNull' && (
                                              <input
                                                type="text"
                                                value={newFilterValue}
                                                onChange={(e) => setNewFilterValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') handleAddFilter();
                                                }}
                                                placeholder={isEn ? 'Filter value...' : 'مقدار شرط...'}
                                                className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none flex-1 min-w-[140px] ${
                                                  isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                                                }`}
                                              />
                                            )}

                                            <button
                                              type="button"
                                              onClick={handleAddFilter}
                                              className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold text-xs flex items-center gap-1 transition shadow-sm cursor-pointer"
                                            >
                                              <Plus className="w-3.5 h-3.5" />
                                              <span>{isEn ? 'Add Filter' : 'افزودن فیلتر'}</span>
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {/* Collapsible Column Visibility Panel */}
                                      {isColumnVisibilityOpen && (
                                        <div
                                          className={`p-3.5 rounded-xl border space-y-2.5 animate-in fade-in duration-150 ${
                                            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800 shadow-xl'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <h6 className="font-bold text-xs flex items-center gap-1.5 text-purple-400 uppercase tracking-wider">
                                              <Eye className="w-3.5 h-3.5" />
                                              <span>{isEn ? 'Column Visibility' : 'نمایش و مخفی‌سازی ستون‌ها'}</span>
                                            </h6>
                                            <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBackupModal()}
                                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                    title={isEn ? "Generate full or selective MySQL Dump / Backup" : "تهیه فایل پشتیبان و استخراج دیتابیس (Dump/Backup)"}
                                  >
                                    <HardDrive className="w-3.5 h-3.5" />
                                    <span>{isEn ? "Dump / Backup" : "پشتیبان‌گیری (Dump)"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveTab('backups')}
                                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                    title={isEn ? "Open Advanced Restore & SQL Import Hub" : "بازیابی و ایمپورت پیشرفته (Restore/Import)"}
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>{isEn ? "Restore / Import" : "بازیابی (Restore)"}</span>
                                  </button>
                                              <button
                                                type="button"
                                                onClick={() => setDataHiddenColumns({})}
                                                className="text-[11px] font-semibold text-cyan-400 hover:underline cursor-pointer"
                                              >
                                                {isEn ? 'Show All' : 'نمایش همه'}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const allHidden: Record<string, boolean> = {};
                                                  availableCols.forEach((c) => {
                                                    allHidden[c.name] = true;
                                                  });
                                                  // Keep at least primary key or first column visible
                                                  if (availableCols[0]) delete allHidden[availableCols[0].name];
                                                  setDataHiddenColumns(allHidden);
                                                }}
                                                className="text-[11px] font-semibold text-slate-400 hover:underline cursor-pointer"
                                              >
                                                {isEn ? 'Hide All' : 'مخفی کردن همه'}
                                              </button>
                                            </div>
                                          </div>

                                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto pt-1 custom-scrollbar">
                                            {availableCols.map((c) => {
                                              const isHidden = Boolean(dataHiddenColumns[c.name]);
                                              return (
                                                <label
                                                  key={c.name}
                                                  className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs font-mono cursor-pointer transition select-none ${
                                                    isHidden
                                                      ? isLightMode
                                                        ? 'bg-slate-100 border-slate-200 text-slate-400'
                                                        : 'bg-black/20 border-slate-800/60 text-slate-500'
                                                      : isLightMode
                                                      ? 'bg-white border-purple-300 text-purple-900 font-semibold'
                                                      : 'bg-purple-500/10 border-purple-500/30 text-purple-200'
                                                  }`}
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={!isHidden}
                                                    onChange={(e) => {
                                                      const checked = e.target.checked;
                                                      setDataHiddenColumns((prev) => {
                                                        const copy = { ...prev };
                                                        if (checked) {
                                                          delete copy[c.name];
                                                        } else {
                                                          copy[c.name] = true;
                                                        }
                                                        return copy;
                                                      });
                                                    }}
                                                    className="w-3.5 h-3.5 rounded border-slate-600 text-purple-500 focus:ring-purple-400"
                                                  />
                                                  <span className="truncate flex-1" title={c.name}>
                                                    {c.name}
                                                  </span>
                                                  <span className="text-[9px] text-slate-400 font-normal">
                                                    {c.dataType}
                                                  </span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      {/* Execution Metrics Info Banner */}
                                      {tableDataResult && (
                                        <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono flex-wrap gap-2">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span>
                                              {isEn
                                                ? `Showing ${tableDataResult.rows.length} of ${tableDataResult.totalRows.toLocaleString()} rows`
                                                : `نمایش ${tableDataResult.rows.length} از ${tableDataResult.totalRows.toLocaleString()} سطر`}
                                            </span>
                                            {tableDataSortColumn && (
                                              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px]">
                                                <span>
                                                  {isEn ? 'Sorted by:' : 'مرتب‌سازی:'} {tableDataSortColumn} {tableDataSortDir}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => toggleColumnSort(tableDataSortColumn)}
                                                  className="hover:text-white"
                                                  title={isEn ? 'Clear sort' : 'حذف مرتب‌سازی'}
                                                >
                                                  <X className="w-2.5 h-2.5" />
                                                </button>
                                              </div>
                                            )}
                                            {tableDataFilters.length > 0 && (
                                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px]">
                                                {tableDataFilters.length} {isEn ? 'filters active' : 'فیلتر فعال'}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <Clock className="w-3 h-3 text-cyan-400" />
                                            <span className="text-cyan-300">{tableDataResult.executionTimeMs} ms</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Data Table Grid */}
                                      <div className={`rounded-xl border overflow-hidden shadow-inner ${
                                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-white/10'
                                      }`}>
                                        {loadingTableData ? (
                                          <div className="p-12 text-center space-y-2">
                                            <RefreshCw className="w-6 h-6 text-orange-400 animate-spin mx-auto" />
                                            <p className="text-xs text-slate-300 font-bold">
                                              {isEn ? 'Querying records from MySQL...' : 'در حال خواندن رکوردها از پایگاه داده...'}
                                            </p>
                                          </div>
                                        ) : tableDataError ? (
                                          <div className="p-6 text-center space-y-2 text-rose-300 text-xs">
                                            <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                                            <p className="font-bold">{tableDataError}</p>
                                            <button
                                              type="button"
                                              onClick={() => loadTableData(dbName, tableName, tableDataPage)}
                                              className="px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                                            >
                                              {isEn ? 'Retry' : 'تلاش مجدد'}
                                            </button>
                                          </div>
                                        ) : !tableDataResult || tableDataResult.rows.length === 0 ? (
                                          <div className="p-12 text-center space-y-2 text-slate-400">
                                            <Table className="w-8 h-8 text-slate-600 mx-auto" />
                                            <p className="text-xs font-bold text-slate-300">
                                              {isEn ? 'No records found in this table' : 'هیچ رکوردی در این جدول یافت نشد'}
                                            </p>
                                            <p className="text-[11px] text-slate-500">
                                              {isEn ? 'The table is empty or no rows match the filter criteria.' : 'جدول خالی است یا داده‌ای با شرایط جستجو مطابقت ندارد.'}
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                                            <table className="w-full text-xs text-left border-collapse font-mono">
                                              <thead className={`sticky top-0 z-10 border-b text-[11px] uppercase tracking-wider ${
                                                isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-900 border-white/10 text-slate-300'
                                              }`}>
                                                <tr>
                                                  <th
                                                    className="py-2.5 px-3 w-12 text-center text-slate-500 font-sans font-bold select-none cursor-default"
                                                    title={isEn ? 'Row index (click row # to inspect)' : 'شماره سطر (جهت بازرسی کلیک کنید)'}
                                                  >
                                                    #
                                                  </th>
                                                  <th
                                                    className="py-2.5 px-3 w-28 text-center text-slate-500 font-sans font-bold select-none cursor-default"
                                                    title={isEn ? 'Row Actions' : 'عملیات سطر'}
                                                  >
                                                    {isEn ? 'Actions' : 'عملیات'}
                                                  </th>
                                                  {visibleCols.map((col) => {
                                                    const isSorted = tableDataSortColumn === col.name;
                                                    return (
                                                      <th
                                                        key={col.name}
                                                        onClick={() => toggleColumnSort(col.name)}
                                                        className={`py-2.5 px-3 font-semibold cursor-pointer select-none transition ${
                                                          isSorted
                                                            ? 'bg-orange-500/15 text-orange-300'
                                                            : isLightMode
                                                            ? 'hover:bg-slate-200 text-slate-700'
                                                            : 'hover:bg-white/5 text-slate-200'
                                                        }`}
                                                        title={isEn ? `Sort by ${col.name} (click to toggle)` : `مرتب‌سازی بر اساس ${col.name}`}
                                                      >
                                                        <div className="flex items-center gap-1.5">
                                                          {col.isPrimaryKey && (
                                                            <Key className="w-3 h-3 text-blue-400 shrink-0" />
                                                          )}
                                                          <span className={col.isPrimaryKey ? 'text-blue-300 font-bold' : ''}>
                                                            {col.name}
                                                          </span>
                                                          <span className="text-[9px] lowercase text-slate-400 font-normal">
                                                            {col.dataType}
                                                          </span>
                                                          <span className="ml-auto text-slate-400">
                                                            {isSorted ? (
                                                              tableDataSortDir === 'ASC' ? (
                                                                <ArrowUp className="w-3 h-3 text-orange-400" />
                                                              ) : (
                                                                <ArrowDown className="w-3 h-3 text-orange-400" />
                                                              )
                                                            ) : (
                                                              <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                                                            )}
                                                          </span>
                                                        </div>
                                                      </th>
                                                    );
                                                  })}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-white/5">
                                                {tableDataResult.rows.map((row, rowIdx) => {
                                                  const rowNumber = (tableDataResult.page - 1) * tableDataResult.pageSize + rowIdx + 1;
                                                  return (
                                                    <tr key={rowIdx} className="hover:bg-white/5 transition group">
                                                      <td
                                                        onClick={() => setInspectingRowIndex(rowIdx)}
                                                        className="py-2 px-3 text-center text-slate-400 font-sans text-[11px] select-none cursor-pointer hover:bg-orange-500/20 hover:text-orange-300 font-bold"
                                                        title={isEn ? 'Click to inspect full row details' : 'کلیک جهت مشاهده کامل جزئیات سطر'}
                                                      >
                                                        {rowNumber}
                                                      </td>
                                                      <td className="py-1.5 px-2 text-center whitespace-nowrap">
                                                        <div className="flex items-center justify-center gap-1">
                                                          <button
                                                            type="button"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              setSelectedRowForMutation(row);
                                                              setRowMutationModalMode('edit');
                                                              setIsRowMutationModalOpen(true);
                                                            }}
                                                            className={`p-1 rounded-md border transition-colors cursor-pointer ${
                                                              isLightMode
                                                                ? 'border-slate-200 text-slate-500 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-300'
                                                                : 'border-white/5 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/30'
                                                            }`}
                                                            title={isEn ? 'Edit this row' : 'ویرایش این سطر'}
                                                          >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                          </button>
                                                          <button
                                                            type="button"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              setSelectedRowForMutation(row);
                                                              setRowMutationModalMode('insert');
                                                              setIsRowMutationModalOpen(true);
                                                            }}
                                                            className={`p-1 rounded-md border transition-colors cursor-pointer ${
                                                              isLightMode
                                                                ? 'border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300'
                                                                : 'border-white/5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-500/30'
                                                            }`}
                                                            title={isEn ? 'Duplicate / Clone into new row' : 'تکثیر سطر برای درج جدید'}
                                                          >
                                                            <Copy className="w-3.5 h-3.5" />
                                                          </button>
                                                          <button
                                                            type="button"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              setInspectingRowIndex(rowIdx);
                                                            }}
                                                            className={`p-1 rounded-md border transition-colors cursor-pointer ${
                                                              isLightMode
                                                                ? 'border-slate-200 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 hover:border-cyan-300'
                                                                : 'border-white/5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/30'
                                                            }`}
                                                            title={isEn ? 'Inspect full row' : 'مشاهده جزئیات سطر'}
                                                          >
                                                            <Eye className="w-3.5 h-3.5" />
                                                          </button>
                                                          <button
                                                            type="button"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              setSelectedRowForMutation(row);
                                                              setRowMutationModalMode('delete');
                                                              setIsRowMutationModalOpen(true);
                                                            }}
                                                            className={`p-1 rounded-md border transition-colors cursor-pointer ${
                                                              isLightMode
                                                                ? 'border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-300'
                                                                : 'border-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30'
                                                            }`}
                                                            title={isEn ? 'Delete this row' : 'حذف این سطر'}
                                                          >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                          </button>
                                                        </div>
                                                      </td>
                                                      {visibleCols.map((col) => {
                                                        const cellValue = row[col.name];
                                                        const cellId = `cell-${rowIdx}-${col.name}`;
                                                        const isNull = cellValue === null || cellValue === undefined;
                                                        const isCopied = copiedCellId === cellId;

                                                        return (
                                                          <td
                                                            key={col.name}
                                                            onClick={() => {
                                                              if (!isNull) {
                                                                copyToClipboard(String(cellValue), cellId);
                                                                setCopiedCellId(cellId);
                                                                setTimeout(() => setCopiedCellId(null), 1500);
                                                              }
                                                            }}
                                                            className={`py-2 px-3 max-w-xs truncate cursor-pointer transition relative ${
                                                              isLightMode
                                                                ? 'text-slate-800 hover:bg-orange-500/10'
                                                                : 'text-slate-300 hover:bg-orange-500/10'
                                                            }`}
                                                            title={isNull ? 'NULL' : String(cellValue)}
                                                          >
                                                            {isNull ? (
                                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-bold bg-white/5 text-slate-500">
                                                                NULL
                                                              </span>
                                                            ) : typeof cellValue === 'boolean' ? (
                                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                                                                cellValue ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                                              }`}>
                                                                {cellValue ? 'TRUE' : 'FALSE'}
                                                              </span>
                                                            ) : typeof cellValue === 'object' ? (
                                                              <span className="text-purple-300 truncate block">
                                                                {JSON.stringify(cellValue)}
                                                              </span>
                                                            ) : (
                                                              <span className="truncate block">{String(cellValue)}</span>
                                                            )}
                                                            {isCopied && (
                                                              <span className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold text-[9px] shadow z-20">
                                                                {isEn ? 'Copied' : 'کپی شد'}
                                                              </span>
                                                            )}
                                                          </td>
                                                        );
                                                      })}
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}

                                        {/* Pagination Footer */}
                                        {tableDataResult && tableDataResult.totalPages > 1 && (
                                          <div className={`p-3 border-t flex items-center justify-between gap-3 flex-wrap text-xs font-mono ${
                                            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-white/10'
                                          }`}>
                                            <div className="text-slate-400">
                                              {isEn
                                                ? `Page ${tableDataResult.page} of ${tableDataResult.totalPages} (${tableDataResult.totalRows.toLocaleString()} total rows)`
                                                : `صفحه ${tableDataResult.page} از ${tableDataResult.totalPages} (مجموعاً ${tableDataResult.totalRows.toLocaleString()} سطر)`}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => loadTableData(dbName, tableName, 1)}
                                                disabled={tableDataResult.page <= 1 || loadingTableData}
                                                className={`p-1.5 rounded-lg border text-slate-300 disabled:opacity-30 cursor-pointer ${
                                                  isLightMode ? 'hover:bg-slate-200 border-slate-300' : 'hover:bg-white/10 border-white/10'
                                                }`}
                                                title={isEn ? 'First Page' : 'صفحه نخست'}
                                              >
                                                <ChevronsLeft className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => loadTableData(dbName, tableName, tableDataResult.page - 1)}
                                                disabled={tableDataResult.page <= 1 || loadingTableData}
                                                className={`p-1.5 rounded-lg border text-slate-300 disabled:opacity-30 cursor-pointer ${
                                                  isLightMode ? 'hover:bg-slate-200 border-slate-300' : 'hover:bg-white/10 border-white/10'
                                                }`}
                                                title={isEn ? 'Previous Page' : 'صفحه قبل'}
                                              >
                                                <ChevronLeft className="w-3.5 h-3.5" />
                                              </button>
                                              <span className="px-2.5 py-1 rounded bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30">
                                                {tableDataResult.page}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => loadTableData(dbName, tableName, tableDataResult.page + 1)}
                                                disabled={tableDataResult.page >= tableDataResult.totalPages || loadingTableData}
                                                className={`p-1.5 rounded-lg border text-slate-300 disabled:opacity-30 cursor-pointer ${
                                                  isLightMode ? 'hover:bg-slate-200 border-slate-300' : 'hover:bg-white/10 border-white/10'
                                                }`}
                                                title={isEn ? 'Next Page' : 'صفحه بعد'}
                                              >
                                                <ChevronRight className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => loadTableData(dbName, tableName, tableDataResult.totalPages)}
                                                disabled={tableDataResult.page >= tableDataResult.totalPages || loadingTableData}
                                                className={`p-1.5 rounded-lg border text-slate-300 disabled:opacity-30 cursor-pointer ${
                                                  isLightMode ? 'hover:bg-slate-200 border-slate-300' : 'hover:bg-white/10 border-white/10'
                                                }`}
                                                title={isEn ? 'Last Page' : 'صفحه آخر'}
                                              >
                                                <ChevronsRight className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {/* PHASE 6: MODAL INSPECT ROW DETAILS DIALOG */}
                                      {inspectingRow && (
                                        <div className="fixed inset-0 z-[999995] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                                          <div
                                            className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
                                              isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-white/10 text-slate-100'
                                            }`}
                                          >
                                            {/* Dialog Header */}
                                            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
                                              <div className="flex items-center gap-2">
                                                <Table className="w-4 h-4 text-orange-400" />
                                                <h5 className="font-bold text-sm font-mono">
                                                  {isEn
                                                    ? `Row #${(tableDataResult?.page! - 1) * tableDataResult?.pageSize! + inspectingRowIndex! + 1} of ${tableDataResult?.totalRows.toLocaleString()} (${tableName})`
                                                    : `جزئیات سطر شماره ${(tableDataResult?.page! - 1) * tableDataResult?.pageSize! + inspectingRowIndex! + 1} از ${tableDataResult?.totalRows.toLocaleString()} (${tableName})`}
                                                </h5>
                                              </div>
                                              <div className="flex items-center gap-1.5">
                                                {/* Prev Row */}
                                                <button
                                                  type="button"
                                                  onClick={() => setInspectingRowIndex((prev) => Math.max(0, (prev || 0) - 1))}
                                                  disabled={inspectingRowIndex === 0}
                                                  className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                                                  title={isEn ? 'Previous row' : 'سطر قبل'}
                                                >
                                                  <ChevronLeft className="w-3.5 h-3.5" />
                                                </button>
                                                {/* Next Row */}
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setInspectingRowIndex((prev) =>
                                                      Math.min((tableDataResult?.rows.length || 1) - 1, (prev || 0) + 1)
                                                    )
                                                  }
                                                  disabled={inspectingRowIndex === (tableDataResult?.rows.length || 1) - 1}
                                                  className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                                                  title={isEn ? 'Next row' : 'سطر بعد'}
                                                >
                                                  <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                                {/* Close */}
                                                <button
                                                  type="button"
                                                  onClick={() => setInspectingRowIndex(null)}
                                                  className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer ml-1"
                                                >
                                                  <X className="w-4 h-4" />
                                                </button>
                                              </div>
                                            </div>

                                            {/* Dialog Toolbar (Field filter & Copy JSON) */}
                                            <div className="px-4 py-2 border-b border-white/5 bg-black/10 flex items-center justify-between gap-3 flex-wrap text-xs">
                                              <div className="relative flex-1 min-w-[200px]">
                                                <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                  type="text"
                                                  value={rowFieldSearch}
                                                  onChange={(e) => setRowFieldSearch(e.target.value)}
                                                  placeholder={isEn ? 'Filter fields...' : 'فیلتر ستون‌ها...'}
                                                  className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-white/10 bg-slate-950/60 text-xs text-slate-200 outline-none"
                                                />
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => copyToClipboard(JSON.stringify(inspectingRow, null, 2), 'inspect-json')}
                                                className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer font-mono"
                                              >
                                                <Copy className="w-3 h-3" />
                                                <span>{isEn ? 'Copy Row JSON' : 'کپی جیسون سطر'}</span>
                                              </button>
                                            </div>

                                            {/* Dialog Content (Fields List) */}
                                            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2 custom-scrollbar font-mono text-xs">
                                              {availableCols
                                                .filter((c) => !rowFieldSearch || c.name.toLowerCase().includes(rowFieldSearch.toLowerCase()))
                                                .map((c) => {
                                                  const val = inspectingRow[c.name];
                                                  const isNull = val === null || val === undefined;
                                                  return (
                                                    <div
                                                      key={c.name}
                                                      className="p-2.5 rounded-xl border border-white/10 bg-black/20 flex items-start justify-between gap-3"
                                                    >
                                                      <div className="space-y-1 flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                          {c.isPrimaryKey && (
                                                            <Key className="w-3 h-3 text-blue-400 shrink-0" />
                                                          )}
                                                          <span className="font-bold text-slate-200">{c.name}</span>
                                                          <span className="text-[10px] text-slate-500 font-sans">
                                                            {c.columnType || c.dataType}
                                                          </span>
                                                        </div>
                                                        <div className="text-slate-300 break-all select-all font-mono text-[11px] pt-0.5">
                                                          {isNull ? (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-bold bg-white/5 text-slate-500">
                                                              NULL
                                                            </span>
                                                          ) : typeof val === 'object' ? (
                                                            <pre className="whitespace-pre-wrap text-purple-300">
                                                              {JSON.stringify(val, null, 2)}
                                                            </pre>
                                                          ) : (
                                                            String(val)
                                                          )}
                                                        </div>
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(String(val ?? ''), `row-field-${c.name}`)}
                                                        className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white shrink-0 cursor-pointer"
                                                        title={isEn ? 'Copy value' : 'کپی مقدار'}
                                                      >
                                                        <Copy className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  );
                                                })}
                                            </div>

                                            {/* Modal Inspector Footer Actions */}
                                            <div className={`p-3 border-t flex items-center justify-between gap-2 shrink-0 ${
                                              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-black/40 border-white/10'
                                            }`}>
                                              <div className="flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedRowForMutation(inspectingRow);
                                                    setRowMutationModalMode('edit');
                                                    setIsRowMutationModalOpen(true);
                                                  }}
                                                  className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                                                >
                                                  <Pencil className="w-3.5 h-3.5" />
                                                  <span>{isEn ? 'Edit Row' : 'ویرایش سطر'}</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedRowForMutation(inspectingRow);
                                                    setRowMutationModalMode('insert');
                                                    setIsRowMutationModalOpen(true);
                                                  }}
                                                  className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                                                >
                                                  <Copy className="w-3.5 h-3.5" />
                                                  <span>{isEn ? 'Clone Row' : 'تکثیر سطر'}</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedRowForMutation(inspectingRow);
                                                    setRowMutationModalMode('delete');
                                                    setIsRowMutationModalOpen(true);
                                                  }}
                                                  className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                  <span>{isEn ? 'Delete Row' : 'حذف سطر'}</span>
                                                </button>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => setInspectingRowIndex(null)}
                                                className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                                                  isLightMode ? 'border-slate-300 hover:bg-slate-200 text-slate-700' : 'border-white/10 hover:bg-white/10 text-slate-300'
                                                }`}
                                              >
                                                {isEn ? 'Close' : 'بستن'}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* SUB-TAB 2: COLUMNS INSPECTOR */}
                                {tableActiveSubTab === 'columns' && (
                                  <div className="rounded-xl border border-white/10 bg-slate-950 overflow-hidden shadow-inner">
                                    <div className="overflow-x-auto custom-scrollbar">
                                      <table className="w-full text-xs text-left border-collapse font-mono">
                                        <thead className="bg-slate-900 border-b border-white/10 text-slate-300 text-[11px] uppercase tracking-wider">
                                          <tr>
                                            <th className="py-2.5 px-3 w-12 text-center text-slate-500 font-sans font-bold">#</th>
                                            <th className="py-2.5 px-3">{isEn ? 'Column Name' : 'نام ستون'}</th>
                                            <th className="py-2.5 px-3">{isEn ? 'Data Type' : 'نوع داده'}</th>
                                            <th className="py-2.5 px-3 text-center">{isEn ? 'Nullable' : 'مقدار خالی (NULL)'}</th>
                                            <th className="py-2.5 px-3 text-center">{isEn ? 'Key' : 'کلید'}</th>
                                            <th className="py-2.5 px-3">{isEn ? 'Default' : 'مقدار پیش‌فرض'}</th>
                                            <th className="py-2.5 px-3">{isEn ? 'Extra' : 'ویژگی‌های مازاد'}</th>
                                            <th className="py-2.5 px-3">{isEn ? 'Collation' : 'تطبیق کاراکتر'}</th>
                                            <th className="py-2.5 px-3">{isEn ? 'Comment' : 'توضیحات'}</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                          {struct?.columns.map((col) => (
                                            <tr key={col.name} className="hover:bg-white/5 transition">
                                              <td className="py-2.5 px-3 text-center text-slate-500 font-sans text-[11px]">
                                                {col.ordinalPosition}
                                              </td>
                                              <td className="py-2.5 px-3 font-bold text-slate-200 flex items-center gap-1.5">
                                                {col.isPrimaryKey && <Key className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                                                <span>{col.name}</span>
                                              </td>
                                              <td className="py-2.5 px-3 text-cyan-300">{col.columnType}</td>
                                              <td className="py-2.5 px-3 text-center">
                                                {col.isNullable ? (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-sans font-bold">
                                                    YES
                                                  </span>
                                                ) : (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-sans font-bold">
                                                    NO
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-2.5 px-3 text-center">
                                                {col.columnKey === 'PRI' && (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-bold">
                                                    PRI
                                                  </span>
                                                )}
                                                {col.columnKey === 'UNI' && (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-bold">
                                                    UNI
                                                  </span>
                                                )}
                                                {col.columnKey === 'MUL' && (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold">
                                                    MUL
                                                  </span>
                                                )}
                                                {!col.columnKey && <span className="text-slate-600">—</span>}
                                              </td>
                                              <td className="py-2.5 px-3 text-slate-400">
                                                {col.columnDefault !== null ? (
                                                  <span className="text-emerald-300 font-mono">{col.columnDefault}</span>
                                                ) : (
                                                  <span className="text-slate-600 font-sans italic">NULL</span>
                                                )}
                                              </td>
                                              <td className="py-2.5 px-3 text-amber-300">{col.extra || '—'}</td>
                                              <td className="py-2.5 px-3 text-slate-400">{col.collation || '—'}</td>
                                              <td className="py-2.5 px-3 text-slate-400 font-sans">{col.comment || '—'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* SUB-TAB 3: INDEXES INSPECTOR */}
                                {tableActiveSubTab === 'indexes' && (
                                  <div className="rounded-xl border border-white/10 bg-slate-950 overflow-hidden shadow-inner">
                                    {struct && struct.indexes.length === 0 ? (
                                      <div className="p-8 text-center text-slate-500 text-xs">
                                        {isEn ? 'No indexes defined on this table' : 'هیچ ایندکسی بر روی این جدول تعریف نشده است'}
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-xs text-left border-collapse font-mono">
                                          <thead className="bg-slate-900 border-b border-white/10 text-slate-300 text-[11px] uppercase tracking-wider">
                                            <tr>
                                              <th className="py-2.5 px-3">{isEn ? 'Index Name' : 'نام ایندکس'}</th>
                                              <th className="py-2.5 px-3 text-center">{isEn ? 'Type' : 'نوع'}</th>
                                              <th className="py-2.5 px-3 text-center">{isEn ? 'Method' : 'متد'}</th>
                                              <th className="py-2.5 px-3">{isEn ? 'Indexed Columns' : 'ستون‌های ایندکس‌شده'}</th>
                                              <th className="py-2.5 px-3 text-center">{isEn ? 'Cardinality' : 'یکتایی تخمینی'}</th>
                                              <th className="py-2.5 px-3">{isEn ? 'Comment' : 'توضیحات'}</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-white/5">
                                            {struct?.indexes.map((idx) => (
                                              <tr key={idx.name} className="hover:bg-white/5 transition">
                                                <td className="py-2.5 px-3 font-bold text-slate-200 flex items-center gap-1.5">
                                                  {idx.isPrimary ? (
                                                    <Key className="w-3.5 h-3.5 text-blue-400" />
                                                  ) : (
                                                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                                  )}
                                                  <span>{idx.name}</span>
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                  {idx.isPrimary ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-bold">
                                                      PRIMARY
                                                    </span>
                                                  ) : idx.isUnique ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-bold">
                                                      UNIQUE
                                                    </span>
                                                  ) : (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-bold">
                                                      INDEX
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="py-2.5 px-3 text-center text-cyan-300">{idx.indexType}</td>
                                                <td className="py-2.5 px-3 text-emerald-300">
                                                  {idx.columns.map((c) => c.name).join(', ')}
                                                </td>
                                                <td className="py-2.5 px-3 text-center text-slate-300">
                                                  {idx.cardinality !== null ? idx.cardinality.toLocaleString() : '—'}
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-400 font-sans">{idx.comment || '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* SUB-TAB 4: FOREIGN KEYS */}
                                {tableActiveSubTab === 'foreignKeys' && (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-slate-300">
                                        {isEn ? `Foreign Keys (${struct?.foreignKeys.length || 0})` : `کلیدهای خارجی (${struct?.foreignKeys.length || 0})`}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenStructureModal("manage_primary_key", { tableName })}
                                          className="px-2.5 py-1 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                                          title={isEn ? "Manage primary key columns" : "مدیریت کلید اصلی"}
                                        >
                                          <Key className="w-3.5 h-3.5 text-blue-400" />
                                          <span>{isEn ? "Manage PK" : "کلید اصلی"}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenStructureModal("add_foreign_key", { tableName })}
                                          className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                                          title={isEn ? "Add foreign key constraint" : "افزودن کلید خارجی"}
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                          <span>{isEn ? "Add FK" : "افزودن FK"}</span>
                                        </button>
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-slate-950 overflow-hidden shadow-inner">
                                    {struct && struct.foreignKeys.length === 0 ? (
                                      <div className="p-8 text-center text-slate-500 text-xs">
                                        {isEn ? 'No foreign key constraints defined' : 'هیچ کلید خارجی برای این جدول تعریف نشده است'}
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-xs text-left border-collapse font-mono">
                                          <thead className="bg-slate-900 border-b border-white/10 text-slate-300 text-[11px] uppercase tracking-wider">
                                            <tr>
                                              <th className="py-2.5 px-3">{isEn ? 'Constraint Name' : 'نام محدودیت'}</th>
                                              <th className="py-2.5 px-3">{isEn ? 'Source Column' : 'ستون مبدا'}</th>
                                              <th className="py-2.5 px-3">{isEn ? 'Referenced Table' : 'جدول مرجع'}</th>
                                              <th className="py-2.5 px-3">{isEn ? 'Referenced Column' : 'ستون مرجع'}</th>
                                              <th className="py-2.5 px-3 text-center">{isEn ? 'On Update' : 'در بروزرسانی'}</th>
                                              <th className="py-2.5 px-3 text-center">{isEn ? "On Delete" : "در حذف"}</th>
                                              <th className="py-2.5 px-3 text-center">{isEn ? "Actions" : "عملیات"}</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-white/5">
                                            {struct?.foreignKeys.map((fk) => (
                                              <tr key={fk.name} className="hover:bg-white/5 transition">
                                                <td className="py-2.5 px-3 font-bold text-slate-200 flex items-center gap-1.5">
                                                  <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                                                  <span>{fk.name}</span>
                                                </td>
                                                <td className="py-2.5 px-3 text-cyan-300 font-bold">{fk.column}</td>
                                                <td className="py-2.5 px-3 text-purple-300 font-bold">
                                                  {fk.referencedSchema !== dbName ? `${fk.referencedSchema}.${fk.referencedTable}` : fk.referencedTable}
                                                </td>
                                                <td className="py-2.5 px-3 text-emerald-300 font-bold">{fk.referencedColumn}</td>
                                                <td className="py-2.5 px-3 text-center">
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-bold">
                                                    {fk.updateRule}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-bold">
                                                    {fk.deleteRule}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleOpenStructureModal("drop_confirm", { tableName, foreignKey: fk, dropType: "foreign_key" })}
                                                    className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                                    title={isEn ? "Drop foreign key constraint" : "حذف کلید خارجی"}
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                  </div>
                                )}

                                {/* SUB-TAB 5: OPTIONS & METADATA */}
                                {tableActiveSubTab === 'options' && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
                                    <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
                                      <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Storage Engine' : 'موتور ذخیره‌سازی'}</div>
                                      <div className="text-sm font-bold text-emerald-300">{struct?.metadata.engine || 'InnoDB'}</div>
                                    </div>
                                    <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
                                      <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Row Format' : 'فرمت سطرها'}</div>
                                      <div className="text-sm font-bold text-slate-200">{struct?.metadata.rowFormat || 'Dynamic'}</div>
                                    </div>
                                    <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
                                      <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Next Auto-Increment' : 'شناسه بعدی شمارنده'}</div>
                                      <div className="text-sm font-bold text-orange-400">{struct?.metadata.autoIncrementNext ?? 'N/A'}</div>
                                    </div>
                                    <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
                                      <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Avg Row Length' : 'طول میانگین هر سطر'}</div>
                                      <div className="text-sm font-bold text-slate-300">{struct?.metadata.avgRowLength?.toLocaleString() || 0} bytes</div>
                                    </div>
                                    <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
                                      <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Free Storage Space' : 'فضای آزاد در فایل'}</div>
                                      <div className="text-sm font-bold text-cyan-300">{struct?.metadata.dataFreePretty || '0 B'}</div>
                                    </div>
                                    <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
                                      <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Collation' : 'تطبیق کاراکتر جدول'}</div>
                                      <div className="text-sm font-bold text-slate-300 truncate">{struct?.metadata.collation || 'utf8mb4_general_ci'}</div>
                                    </div>
                                    <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1 sm:col-span-2">
                                      <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Table Comment' : 'توضیحات جدول'}</div>
                                      <div className="text-xs text-slate-300 font-sans">{struct?.metadata.comment || '—'}</div>
                                    </div>
                                    <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
                                      <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Created At' : 'تاریخ ساخت'}</div>
                                      <div className="text-xs text-slate-400">{struct?.metadata.createTime ? new Date(struct.metadata.createTime).toLocaleString() : '—'}</div>
                                    </div>
                                  </div>
                                )}

                                {/* SUB-TAB 6: CREATE TABLE DDL */}
                                {tableActiveSubTab === 'ddl' && (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs text-slate-400">
                                      <span className="font-bold flex items-center gap-1.5">
                                        <Code className="w-3.5 h-3.5 text-orange-400" />
                                        <span>{isEn ? 'Generated CREATE TABLE DDL Statement' : 'دستور ایجاد جدول (SHOW CREATE TABLE)'}</span>
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => copyToClipboard(struct?.createTableSql || '', `ddl-${tableName}`)}
                                          className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono text-slate-300 flex items-center gap-1.5 cursor-pointer"
                                        >
                                          {copiedSnippet === `ddl-${tableName}` ? (
                                            <Check className="w-3 h-3 text-emerald-400" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                          <span>{isEn ? 'Copy DDL' : 'کپی DDL'}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenSqlForDatabase(dbName, tableName, struct?.createTableSql)}
                                          className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                        >
                                          <Terminal className="w-3 h-3" />
                                          <span>{isEn ? 'Open in Console' : 'کنسول SQL'}</span>
                                        </button>
                                      </div>
                                    </div>
                                    <div className="p-4 rounded-xl border border-orange-500/20 bg-slate-950 font-mono text-xs text-orange-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                      {struct?.createTableSql || '-- Loading CREATE TABLE statement...'}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }

                          // ========================================================
                          // DEFAULT VIEW: DATABASE SCHEMA & OBJECTS CATEGORY TABS
                          // ========================================================
                          const tablesList = details?.tables || [];
                          const viewsList = details?.views || [];
                          const proceduresList = details?.procedures || [];
                          const functionsList = details?.functions || [];
                          const triggersList = details?.triggers || [];
                          const eventsList = details?.events || [];
                          const sequencesList = details?.sequences || [];

                          return (
                            <>
                              {/* Database Header Card */}
                              <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                    <Database className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-bold text-base text-slate-100 font-mono">{dbName}</h3>
                                      {dbMeta?.isSystem && (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-sans font-bold">
                                          SYSTEM CATALOG
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5">
                                      <span>{details?.defaultCharacterSet || dbMeta?.defaultCharacterSet || 'utf8mb4'}</span>
                                      <span>•</span>
                                      <span>{details?.defaultCollation || dbMeta?.defaultCollation}</span>
                                      <span>•</span>
                                      <span className="text-emerald-400 font-bold">{details?.sizePretty || dbMeta?.sizePretty || '0 B'}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => loadDatabaseDetails(dbName, true)}
                                    disabled={isLoading}
                                    className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
                                    title={isEn ? 'Reload Schema Objects' : 'بروزرسانی اجزا'}
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
                                    <span className="hidden sm:inline">{isEn ? 'Reload' : 'تازه‌سازی'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSqlForDatabase(dbName)}
                                    className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Terminal className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Open in Console' : 'کنسول SQL'}</span>
                                  </button>
                                </div>
                              </div>

                              {/* Schema Objects Category Selector Tabs */}
                              <div className="flex items-center gap-1.5 border-b border-white/10 pb-2 overflow-x-auto custom-scrollbar">
                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('tables')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'tables'
                                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Table className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>{isEn ? 'Tables' : 'جداول'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {tablesList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('views')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'views'
                                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Eye className="w-3.5 h-3.5 text-purple-400" />
                                  <span>{isEn ? 'Views' : 'نماها'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {viewsList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('procedures')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'procedures'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Code className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>{isEn ? 'Procedures' : 'رویه‌ها'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {proceduresList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('functions')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'functions'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{isEn ? 'Functions' : 'توابع'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {functionsList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('triggers')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'triggers'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Activity className="w-3.5 h-3.5 text-rose-400" />
                                  <span>{isEn ? 'Triggers' : 'تریگرها'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {triggersList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setDbActiveObjectTab('events');
                                    loadEventSchedulerStatus();
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'events'
                                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                                  <span>{isEn ? 'Events' : 'رویدادها'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {eventsList.length}
                                  </span>
                                </button>

                                {sequencesList.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setDbActiveObjectTab('sequences')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                      dbActiveObjectTab === 'sequences'
                                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold'
                                        : 'hover:bg-white/5 text-slate-400'
                                    }`}
                                  >
                                    <Hash className="w-3.5 h-3.5 text-teal-400" />
                                    <span>{isEn ? 'Sequences' : 'دنباله‌ها'}</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                      {sequencesList.length}
                                    </span>
                                  </button>
                                )}
                              </div>

                              {/* Search bar inside category */}
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3">
                                  {dbActiveObjectTab === "tables" && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenStructureModal("create_table")}
                                      className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                      title={isEn ? "Create new table in this database" : "ساخت جدول جدید در این پایگاه داده"}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>{isEn ? "Create Table" : "جدول جدید"}</span>
                                    </button>
                                  )}
                                  {dbActiveObjectTab === "views" && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenProgrammabilityModal("create_view")}
                                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                      title={isEn ? "Create new view in this database" : "ایجاد نمای جدید در این پایگاه داده"}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>{isEn ? "Create View" : "نمای جدید"}</span>
                                    </button>
                                  )}
                                  {dbActiveObjectTab === "procedures" && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenProgrammabilityModal("create_procedure")}
                                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                      title={isEn ? "Create new stored procedure" : "ایجاد رویه ذخیره‌شده جدید"}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>{isEn ? "Create Procedure" : "رویه جدید"}</span>
                                    </button>
                                  )}
                                  {dbActiveObjectTab === "functions" && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenProgrammabilityModal("create_function")}
                                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                      title={isEn ? "Create new stored function" : "ایجاد تابع جدید"}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>{isEn ? "Create Function" : "تابع جدید"}</span>
                                    </button>
                                  )}
                                  {dbActiveObjectTab === "triggers" && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenProgrammabilityModal("create_trigger")}
                                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                      title={isEn ? "Create new database trigger" : "ایجاد تریگر جدید"}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>{isEn ? "Create Trigger" : "تریگر جدید"}</span>
                                    </button>
                                  )}
                                  {dbActiveObjectTab === "events" && (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenProgrammabilityModal("create_event")}
                                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                        title={isEn ? "Create new scheduled event" : "ایجاد رویداد زمان‌بندی‌شده جدید"}
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>{isEn ? "Create Event" : "رویداد جدید"}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleToggleEventScheduler}
                                        disabled={isTogglingEventScheduler}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border cursor-pointer ${
                                          eventSchedulerEnabled
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                                        }`}
                                        title={isEn ? "Toggle MySQL event_scheduler global variable" : "تغییر وضعیت زمان‌بند رویدادهای سرور (event_scheduler)"}
                                      >
                                        <Power className="w-3.5 h-3.5" />
                                        <span>
                                          {isEn ? 'Event Scheduler: ' : 'زمان‌بند سرور: '}
                                          {eventSchedulerEnabled ? (isEn ? 'ON' : 'روشن') : (isEn ? 'OFF' : 'خاموش')}
                                        </span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <span className="text-xs text-slate-400 font-bold">
                                  {dbActiveObjectTab === 'tables' && `${isEn ? 'Base Tables' : 'جداول پایه'} (${tablesList.length})`}
                                  {dbActiveObjectTab === 'views' && `${isEn ? 'Database Views' : 'نماهای دیتابیس'} (${viewsList.length})`}
                                  {dbActiveObjectTab === 'procedures' && `${isEn ? 'Stored Procedures' : 'رویه‌های ذخیره‌شده'} (${proceduresList.length})`}
                                  {dbActiveObjectTab === 'functions' && `${isEn ? 'Stored Functions' : 'توابع ذخیره‌شده'} (${functionsList.length})`}
                                  {dbActiveObjectTab === 'triggers' && `${isEn ? 'Database Triggers' : 'تریگرهای دیتابیس'} (${triggersList.length})`}
                                  {dbActiveObjectTab === 'events' && `${isEn ? 'Scheduled Events' : 'رویدادهای زمان‌بندی‌شده'} (${eventsList.length})`}
                                  {dbActiveObjectTab === 'sequences' && `${isEn ? 'Database Sequences' : 'دنباله‌ها'} (${sequencesList.length})`}
                                </span>

                                <div className="relative w-48 sm:w-64">
                                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                  <input
                                    type="text"
                                    value={tableSearch}
                                    onChange={(e) => setTableSearch(e.target.value)}
                                    placeholder={isEn ? `Search in ${dbActiveObjectTab}...` : `جستجو در ${dbActiveObjectTab}...`}
                                    className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-white/10 bg-black/20 text-xs focus:outline-hidden"
                                  />
                                </div>
                              </div>

                              {/* ---------------------------------------------- */}
                              {/* 1. TABLES GRID                                  */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'tables' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Table' : 'نام جدول'}</th>
                                        <th className="p-2.5">{isEn ? 'Engine' : 'موتور'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Approx Rows' : 'تعداد سطرها'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Data Size' : 'حجم داده'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Index Size' : 'حجم ایندکس'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Total Size' : 'حجم کل'}</th>
                                        <th className="p-2.5 text-center">{isEn ? "Query" : "کوئری"}</th>
                                        <th className="p-2.5 text-center">{isEn ? "Actions" : "عملیات"}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {isLoading ? (
                                        <tr>
                                          <td colSpan={7} className="p-8 text-center text-slate-400">
                                            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-orange-400 mb-2" />
                                            <span>{isEn ? 'Fetching tables...' : 'در حال خواندن جداول...'}</span>
                                          </td>
                                        </tr>
                                      ) : tablesList.length > 0 ? (
                                        tablesList
                                          .filter((t) => !tableSearch || t.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((t) => (
                                            <tr
                                              key={t.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'table',
                                                  id: `table:${dbName}:${t.name}`,
                                                  name: t.name,
                                                  dbName,
                                                  tableName: t.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Table className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                                <span className="truncate max-w-xs">{t.name}</span>
                                              </td>
                                              <td className="p-2.5 text-slate-300 font-sans text-[11px]">{t.engine || 'InnoDB'}</td>
                                              <td className="p-2.5 text-right text-cyan-400 font-bold">
                                                {t.approxRows.toLocaleString()}
                                              </td>
                                              <td className="p-2.5 text-right text-slate-400">{t.dataLengthPretty}</td>
                                              <td className="p-2.5 text-right text-slate-400">{t.indexLengthPretty}</td>
                                              <td className="p-2.5 text-right text-emerald-400 font-bold">{t.totalSizePretty}</td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenSqlForDatabase(dbName, t.name)}
                                                  className="p-1 rounded hover:bg-orange-500/20 text-slate-400 hover:text-orange-300"
                                                  title={`SELECT * FROM \`${dbName}\`.\`${t.name}\` LIMIT 50`}
                                                >
                                                  <Play className="w-3 h-3" />
                                                </button>
                                              </td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleOpenStructureModal("alter_table", { tableName: t.name })}
                                                    className="p-1 rounded hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300"
                                                    title={isEn ? "Table Options & Rename" : "تنظیمات و تغییر نام"}
                                                  >
                                                    <Sliders className="w-3 h-3" />
                                                  </button>
                                                   <button
                                                     type="button"
                                                     onClick={() => handleOpenBackupModal({ tableName: t.name })}
                                                     className="p-1 rounded hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300"
                                                     title={isEn ? "Export / Dump this table" : "تولید فایل پشتیبان از این جدول"}
                                                   >
                                                     <HardDrive className="w-3 h-3" />
                                                   </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleOpenStructureModal("drop_confirm", { tableName: t.name, dropType: "truncate_table" })}
                                                    className="p-1 rounded hover:bg-amber-500/20 text-slate-400 hover:text-amber-300"
                                                    title={isEn ? "Truncate table" : "پاکسازی جدول"}
                                                  >
                                                    <AlertTriangle className="w-3 h-3" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleOpenStructureModal("drop_confirm", { tableName: t.name, dropType: "table" })}
                                                    className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                                                    title={isEn ? "Drop table" : "حذف جدول"}
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={7} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No base tables found.' : 'هیچ جدول پایه‌ای در این دیتابیس یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 2. VIEWS GRID                                   */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'views' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'View Name' : 'نام نما'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Updatable' : 'قابل ویرایش'}</th>
                                        <th className="p-2.5">{isEn ? 'Check Option' : 'محدودیت'}</th>
                                        <th className="p-2.5">{isEn ? 'Security Type' : 'زمینه امنیتی'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Inspect' : 'مشاهده'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Query' : 'کوئری'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {viewsList.length > 0 ? (
                                        viewsList
                                          .filter((v) => !tableSearch || v.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((v) => (
                                            <tr
                                              key={v.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'view',
                                                  id: `view:${dbName}:${v.name}`,
                                                  name: v.name,
                                                  dbName,
                                                  viewName: v.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                                <span className="truncate max-w-xs">{v.name}</span>
                                              </td>
                                              <td className="p-2.5 text-center font-sans text-[11px]">
                                                {v.isUpdatable ? (
                                                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">YES</span>
                                                ) : (
                                                  <span className="text-slate-500">NO</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-slate-300 text-[11px]">{v.checkOption || 'NONE'}</td>
                                              <td className="p-2.5 text-purple-300 text-[11px]">{v.securityType || 'DEFINER'}</td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedTreeNode({
                                                      type: 'view',
                                                      id: `view:${dbName}:${v.name}`,
                                                      name: v.name,
                                                      dbName,
                                                      viewName: v.name,
                                                    });
                                                  }}
                                                  className="p-1 rounded hover:bg-purple-500/20 text-purple-300"
                                                  title={isEn ? 'Inspect DDL' : 'مشاهده تعریف'}
                                                >
                                                  <Eye className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenSqlForDatabase(dbName, v.name)}
                                                  className="p-1 rounded hover:bg-orange-500/20 text-slate-400 hover:text-orange-300"
                                                  title={`SELECT * FROM \`${dbName}\`.\`${v.name}\` LIMIT 50`}
                                                >
                                                  <Play className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenProgrammabilityModal('drop_view', { targetName: v.name })}
                                                  className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 ml-1"
                                                  title={isEn ? 'Drop View' : 'حذف نما'}
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No views found in this database.' : 'هیچ نمایی (View) در این دیتابیس یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 3. STORED PROCEDURES GRID                       */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'procedures' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Procedure' : 'نام رویه'}</th>
                                        <th className="p-2.5">{isEn ? 'Definer' : 'مالک'}</th>
                                        <th className="p-2.5">{isEn ? 'Security' : 'امنیت'}</th>
                                        <th className="p-2.5">{isEn ? 'Data Access' : 'سطح دسترسی'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Deterministic' : 'تکرارپذیر'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {proceduresList.length > 0 ? (
                                        proceduresList
                                          .filter((p) => !tableSearch || p.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((p) => (
                                            <tr
                                              key={p.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'procedure',
                                                  id: `procedure:${dbName}:${p.name}`,
                                                  name: p.name,
                                                  dbName,
                                                  procedureName: p.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Code className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                <span className="truncate max-w-xs">{p.name}</span>
                                              </td>
                                              <td className="p-2.5 text-slate-300 text-[11px] truncate max-w-xs" title={p.definer}>
                                                {p.definer || 'root@localhost'}
                                              </td>
                                              <td className="p-2.5 text-cyan-300 text-[11px]">{p.securityType || 'DEFINER'}</td>
                                              <td className="p-2.5 text-amber-300 text-[11px]">{p.sqlDataAccess || 'CONTAINS SQL'}</td>
                                              <td className="p-2.5 text-center font-sans text-[11px]">
                                                {p.isDeterministic ? (
                                                  <span className="text-emerald-400 font-bold">YES</span>
                                                ) : (
                                                  <span className="text-slate-500">NO</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenProgrammabilityModal('execute_procedure', { targetName: p.name, routineParams: (p as any).parameters || [] })}
                                                  className="p-1 rounded hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 mr-1"
                                                  title={isEn ? 'Call / Execute Procedure' : 'فراخوانی و اجرای رویه'}
                                                >
                                                  <Play className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => copyToClipboard(`CALL \`${dbName}\`.\`${p.name}\`();`, `call-${p.name}`)}
                                                  className="p-1 rounded hover:bg-emerald-500/20 text-emerald-300"
                                                  title={isEn ? 'Copy CALL command' : 'کپی دستور فراخوانی'}
                                                >
                                                  <Copy className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenProgrammabilityModal('drop_procedure', { targetName: p.name })}
                                                  className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 ml-1"
                                                  title={isEn ? 'Drop Procedure' : 'حذف رویه'}
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No stored procedures found.' : 'هیچ رویه ذخیره‌شده‌ای (Procedure) یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 4. STORED FUNCTIONS GRID                        */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'functions' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Function' : 'نام تابع'}</th>
                                        <th className="p-2.5">{isEn ? 'Return Type' : 'نوع بازگشتی'}</th>
                                        <th className="p-2.5">{isEn ? 'Definer' : 'مالک'}</th>
                                        <th className="p-2.5">{isEn ? 'Security' : 'امنیت'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Deterministic' : 'تکرارپذیر'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Inspect' : 'مشاهده'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {functionsList.length > 0 ? (
                                        functionsList
                                          .filter((f) => !tableSearch || f.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((f) => (
                                            <tr
                                              key={f.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'function',
                                                  id: `function:${dbName}:${f.name}`,
                                                  name: f.name,
                                                  dbName,
                                                  functionName: f.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                                <span className="truncate max-w-xs">{f.name}</span>
                                              </td>
                                              <td className="p-2.5 text-amber-300 font-bold text-[11px]">{f.returnType || 'text'}</td>
                                              <td className="p-2.5 text-slate-300 text-[11px] truncate max-w-xs">{f.definer || 'root@localhost'}</td>
                                              <td className="p-2.5 text-cyan-300 text-[11px]">{f.securityType || 'DEFINER'}</td>
                                              <td className="p-2.5 text-center font-sans text-[11px]">
                                                {f.isDeterministic ? (
                                                  <span className="text-emerald-400 font-bold">YES</span>
                                                ) : (
                                                  <span className="text-slate-500">NO</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedTreeNode({
                                                      type: 'function',
                                                      id: `function:${dbName}:${f.name}`,
                                                      name: f.name,
                                                      dbName,
                                                      functionName: f.name,
                                                    });
                                                  }}
                                                  className="p-1 rounded hover:bg-amber-500/20 text-amber-300"
                                                  title={isEn ? 'Inspect Function' : 'مشاهده تابع'}
                                                >
                                                  <Zap className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenProgrammabilityModal('drop_function', { targetName: f.name })}
                                                  className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 ml-1"
                                                  title={isEn ? 'Drop Function' : 'حذف تابع'}
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No stored functions found.' : 'هیچ تابع ذخیره‌شده‌ای (Function) یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 5. TRIGGERS GRID                                */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'triggers' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Trigger' : 'نام تریگر'}</th>
                                        <th className="p-2.5">{isEn ? 'Target Table' : 'جدول هدف'}</th>
                                        <th className="p-2.5">{isEn ? 'Timing' : 'زمان'}</th>
                                        <th className="p-2.5">{isEn ? 'Event' : 'رویداد'}</th>
                                        <th className="p-2.5">{isEn ? 'Definer' : 'مالک'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Inspect' : 'مشاهده'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {triggersList.length > 0 ? (
                                        triggersList
                                          .filter((tr) => !tableSearch || tr.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((tr) => (
                                            <tr
                                              key={tr.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'trigger',
                                                  id: `trigger:${dbName}:${tr.name}`,
                                                  name: tr.name,
                                                  dbName,
                                                  triggerName: tr.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Activity className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                                <span className="truncate max-w-xs">{tr.name}</span>
                                              </td>
                                              <td className="p-2.5 text-cyan-300 font-bold text-[11px]">{tr.tableName}</td>
                                              <td className="p-2.5 text-rose-300 text-[11px]">{tr.timing}</td>
                                              <td className="p-2.5 text-amber-300 text-[11px]">{tr.event}</td>
                                              <td className="p-2.5 text-slate-300 text-[11px] truncate max-w-xs">{tr.definer || 'root@localhost'}</td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedTreeNode({
                                                      type: 'trigger',
                                                      id: `trigger:${dbName}:${tr.name}`,
                                                      name: tr.name,
                                                      dbName,
                                                      triggerName: tr.name,
                                                    });
                                                  }}
                                                  className="p-1 rounded hover:bg-rose-500/20 text-rose-300"
                                                  title={isEn ? 'Inspect Trigger' : 'مشاهده تریگر'}
                                                >
                                                  <Activity className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenProgrammabilityModal('drop_trigger', { targetName: tr.name })}
                                                  className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 ml-1"
                                                  title={isEn ? 'Drop Trigger' : 'حذف تریگر'}
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No triggers found in this database.' : 'هیچ تریگری در این دیتابیس یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 6. SCHEDULED EVENTS GRID                        */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'events' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Event Name' : 'نام رویداد'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Status' : 'وضعیت'}</th>
                                        <th className="p-2.5">{isEn ? 'Type' : 'نوع زمان‌بندی'}</th>
                                        <th className="p-2.5">{isEn ? 'Interval' : 'دوره'}</th>
                                        <th className="p-2.5">{isEn ? 'Definer' : 'مالک'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Inspect' : 'مشاهده'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {eventsList.length > 0 ? (
                                        eventsList
                                          .filter((ev) => !tableSearch || ev.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((ev) => (
                                            <tr
                                              key={ev.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'event',
                                                  id: `event:${dbName}:${ev.name}`,
                                                  name: ev.name,
                                                  dbName,
                                                  eventName: ev.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                                <span className="truncate max-w-xs">{ev.name}</span>
                                              </td>
                                              <td className="p-2.5 text-center font-sans text-[11px]">
                                                {ev.status === 'ENABLED' ? (
                                                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">ENABLED</span>
                                                ) : (
                                                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">{ev.status}</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-cyan-300 text-[11px]">{ev.type}</td>
                                              <td className="p-2.5 text-amber-300 text-[11px]">
                                                {ev.intervalValue ? `${ev.intervalValue} ${ev.intervalField || ''}` : 'One-time'}
                                              </td>
                                              <td className="p-2.5 text-slate-300 text-[11px] truncate max-w-xs">{ev.definer || 'root@localhost'}</td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleEventStatus(ev.name, ev.status === 'ENABLED' ? 'DISABLE' : 'ENABLE')}
                                                  className={`p-1 rounded transition mr-1 ${
                                                    ev.status === 'ENABLED'
                                                      ? 'hover:bg-amber-500/20 text-slate-400 hover:text-amber-300'
                                                      : 'hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300'
                                                  }`}
                                                  title={
                                                    ev.status === 'ENABLED'
                                                      ? (isEn ? 'Disable Event' : 'غیرفعال‌سازی رویداد')
                                                      : (isEn ? 'Enable Event' : 'فعال‌سازی رویداد')
                                                  }
                                                >
                                                  <Power className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedTreeNode({
                                                      type: 'event',
                                                      id: `event:${dbName}:${ev.name}`,
                                                      name: ev.name,
                                                      dbName,
                                                      eventName: ev.name,
                                                    });
                                                  }}
                                                  className="p-1 rounded hover:bg-blue-500/20 text-blue-300"
                                                  title={isEn ? 'Inspect Event' : 'مشاهده رویداد'}
                                                >
                                                  <Clock className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenProgrammabilityModal('drop_event', { targetName: ev.name })}
                                                  className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 ml-1"
                                                  title={isEn ? 'Drop Event' : 'حذف رویداد'}
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No scheduled events found.' : 'هیچ رویداد زمان‌بندی‌شده‌ای (Event) یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 7. SEQUENCES GRID (if available)                */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'sequences' && sequencesList.length > 0 && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Sequence Name' : 'نام دنباله'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Start' : 'شروع'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Min' : 'حداقل'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Max' : 'حداکثر'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Increment' : 'افزایش'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Cycle' : 'چرخه'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {sequencesList
                                        .filter((s) => !tableSearch || s.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                        .map((s) => (
                                          <tr
                                            key={s.name}
                                            onClick={() => {
                                              setSelectedTreeNode({
                                                type: 'sequence',
                                                id: `sequence:${dbName}:${s.name}`,
                                                name: s.name,
                                                dbName,
                                                sequenceName: s.name,
                                              });
                                            }}
                                            className={`transition cursor-pointer ${
                                              isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                            }`}
                                          >
                                            <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                              <Hash className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                              <span className="truncate max-w-xs">{s.name}</span>
                                            </td>
                                            <td className="p-2.5 text-right text-teal-300 font-bold">{s.startValue ?? '1'}</td>
                                            <td className="p-2.5 text-right text-slate-300">{s.minimumValue ?? '1'}</td>
                                            <td className="p-2.5 text-right text-slate-300">{s.maximumValue ?? '—'}</td>
                                            <td className="p-2.5 text-right text-emerald-400 font-bold">{s.increment ?? '1'}</td>
                                            <td className="p-2.5 text-center font-sans text-[11px]">
                                              {s.cycleOption ? (
                                                <span className="text-emerald-400 font-bold">YES</span>
                                              ) : (
                                                <span className="text-slate-500">NO</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                  {/* ---------------------------------------------------- */}
                  {/* VIEW D: USERS & ACCOUNTS LIST                        */}
                  {/* ---------------------------------------------------- */}
                  {(selectedTreeNode.type === 'users_folder' || selectedTreeNode.type === 'user') && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-400" />
                          <span className="font-bold text-xs">{isEn ? 'MySQL User Accounts' : 'حساب‌های کاربری MySQL'} ({users.length})</span>
                        </div>
                        <div className="relative w-48 sm:w-64">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder={isEn ? 'Filter users...' : 'فیلتر حساب‌ها...'}
                            className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-white/10 bg-black/20 text-xs focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                            <tr className="border-b border-white/10 text-slate-400 font-semibold">
                              <th className="p-3">{isEn ? 'User Account' : 'نام کاربر'}</th>
                              <th className="p-3">{isEn ? 'Host Scope' : 'محدوده هاست'}</th>
                              <th className="p-3">{isEn ? 'Auth Plugin' : 'پلاگین احراز هویت'}</th>
                              <th className="p-3 text-center">{isEn ? 'Status' : 'وضعیت حساب'}</th>
                              <th className="p-3 text-center">{isEn ? 'Password Expired' : 'انقضای رمز'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {users
                              .filter((u) => !userSearch || u.user.toLowerCase().includes(userSearch.toLowerCase()) || u.host.toLowerCase().includes(userSearch.toLowerCase()))
                              .map((u) => (
                                <tr key={`${u.user}@${u.host}`} className={isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'}>
                                  <td className="p-3 flex items-center gap-2 font-bold text-slate-200">
                                    <User className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>{u.user}</span>
                                  </td>
                                  <td className="p-3 text-slate-400">{u.host}</td>
                                  <td className="p-3 text-slate-300 font-sans text-[11px]">{u.plugin || 'default'}</td>
                                  <td className="p-3 text-center">
                                    {u.accountLocked ? (
                                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-sans font-bold">
                                        {isEn ? 'Locked' : 'قفل‌شده'}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-sans font-bold">
                                        {isEn ? 'Active' : 'فعال'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-center text-slate-400 text-[10px] font-sans">
                                    {u.passwordExpired ? (
                                      <span className="text-amber-400 font-bold">{isEn ? 'Expired' : 'منقضی'}</span>
                                    ) : (
                                      <span className="text-slate-500">{isEn ? 'Valid' : 'معتبر'}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. SQL CONSOLE TAB */}
          {activeTab === 'sql' && (
            <MysqlSqlEditorTab
              server={server}
              databases={databases}
              defaultDatabase={selectedTreeNode.dbName || undefined}
              initialQuery={sqlQuery}
              isLightMode={isLightMode}
              isEn={isEn}
            />
          )}

          {/* Phase 10: USERS & ACCOUNT MANAGEMENT TAB */}
          {activeTab === 'users' && server && (
            <MysqlUsersManagerTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              onRefreshOverview={loadOverview}
              onManagePrivileges={() => {
                setActiveTab('privileges');
              }}
            />
          )}

          {/* Phase 11: PRIVILEGES & GRANTS MANAGEMENT TAB */}
          {activeTab === 'privileges' && server && (
            <MysqlPermissionsManagerTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              databases={databases}
              initialDatabase={selectedTreeNode.dbName || (databases[0]?.name || '')}
              onRefreshOverview={loadOverview}
            />
          )}

          {/* Phase 12: PROCESSLIST & THREADS MANAGEMENT TAB */}
          {activeTab === 'processlist' && server && (
            <MysqlProcesslistTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              onRefreshOverview={loadOverview}
            />
          )}

          {/* Phase 17: BACKUP & RESTORE MANAGEMENT TAB */}
          {activeTab === 'backups' && server && (
            <MysqlBackupRestoreManagerTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              initialDatabase={selectedTreeNode.dbName || (databases[0]?.name || '')}
              onNavigateToSqlStudio={(sql, dbName) => {
                setSqlQuery(sql);
                setActiveTab('sql');
              }}
            />
          )}

          {/* TAB: CLIENT AUTHENTICATION & MY.CNF (Phase 16) */}
          {activeTab === 'config' && server && (
            <MysqlConfigManagerTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
            />
          )}

          {/* 5. VARIABLES TAB */}
          {activeTab === 'variables' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={varSearch}
                    onChange={(e) => setVarSearch(e.target.value)}
                    placeholder={isEn ? 'Search variables (e.g. buffer, timeout)...' : 'جستجوی متغیرها...'}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={loadVariables}
                  disabled={isLoadingVariables}
                  className="px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 hover:bg-white/10 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVariables ? 'animate-spin text-orange-400' : ''}`} />
                  <span>{isEn ? 'Filter' : 'اعمال'}</span>
                </button>
              </div>

              <div
                className={`rounded-xl border overflow-hidden ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                }`}
              >
                <table className="w-full text-xs text-left">
                  <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/20'}>
                    <tr className="border-b border-white/10">
                      <th className="p-2.5">{isEn ? 'Variable Name' : 'نام متغیر'}</th>
                      <th className="p-2.5">{isEn ? 'Current Value' : 'مقدار'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                    {isLoadingVariables ? (
                      <tr>
                        <td colSpan={2} className="p-8 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-orange-400 mb-2" />
                          <span>{isEn ? 'Loading variables...' : 'در حال بارگذاری متغیرها...'}</span>
                        </td>
                      </tr>
                    ) : filteredVariables.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="p-8 text-center text-slate-400 font-sans">
                          {isEn ? 'No matching variables.' : 'هیچ متغیری با این نام یافت نشد.'}
                        </td>
                      </tr>
                    ) : (
                      filteredVariables.map((v) => (
                        <tr key={v.name} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}>
                          <td className="p-2.5 text-cyan-300 font-bold">{v.name}</td>
                          <td className="p-2.5 text-slate-300 max-w-md truncate" title={v.value}>
                            {v.value}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. CONNECTION & SECURITY TAB */}
          {activeTab === 'connection' && (
            <div className="space-y-4 max-w-xl">
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                  <Key className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-bold">
                    {isEn ? 'Connection Parameters' : 'پارامترهای اتصال پایگاه‌داده'}
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'Target Host / IP' : 'آدرس هاست / IP'}:</span>
                    <span className="font-bold">{server.ip}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'MySQL Port' : 'پورت اتصال'}:</span>
                    <span className="font-bold">{server.mysql_port || 3306}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'Username' : 'نام کاربری'}:</span>
                    <span className="font-bold text-cyan-400">{server.mysql_user || 'root'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'Database' : 'نام پایگاه داده'}:</span>
                    <span className="font-bold text-amber-400">{server.mysql_database || 'mysql'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'Password Stored' : 'وضعیت رمز عبور'}:</span>
                    <span className="font-bold text-emerald-400">
                      {server.mysql_password_set ? (isEn ? 'Configured (Encrypted at rest)' : 'تنظیم‌شده (رمزنگاری شده)') : (isEn ? 'None' : 'ثبت‌نشده')}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={runTestConnection}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Test Connection' : 'تست مجدد اتصال'}</span>
                  </button>
                  {onEditServer && (
                    <button
                      type="button"
                      onClick={() => onEditServer(server)}
                      className="px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-medium transition cursor-pointer"
                    >
                      {isEn ? 'Edit Credentials' : 'ویرایش اطلاعات سرور'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phase 13: MySQL Table, Index & Constraint Structural Management Modal */}
      <MysqlTableStructureModal
        isOpen={isStructureModalOpen}
        onClose={() => setIsStructureModalOpen(false)}
        onMinimize={() => setIsStructureModalOpen(false)}
        serverId={server.id}
        serverName={server.name}
        databaseName={selectedTreeNode.dbName || ""}
        tableName={structureTargetTableName || selectedTreeNode.tableName || ""}
        mode={structureModalMode}
        existingColumns={tableStructures[structureTargetTableName || selectedTreeNode.tableName || ""]?.columns || []}
        existingIndexes={tableStructures[structureTargetTableName || selectedTreeNode.tableName || ""]?.indexes || []}
        existingForeignKeys={tableStructures[structureTargetTableName || selectedTreeNode.tableName || ""]?.foreignKeys || []}
        existingTables={dbDetailsCache[selectedTreeNode.dbName || ""]?.tables?.map((t) => t.name) || []}
        tableMetadata={tableStructures[structureTargetTableName || selectedTreeNode.tableName || ""]?.metadata || null}
        targetColumn={structureTargetColumn}
        targetIndex={structureTargetIndex}
        targetForeignKey={structureTargetForeignKey}
        dropTargetType={structureDropTargetType}
        onSuccess={handleStructureModalSuccess}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* Phase 14: MySQL Views, Stored Procedures, Functions, Triggers & Events Modal */}
      <MysqlProgrammabilityModal
        isOpen={isProgrammabilityModalOpen}
        onClose={() => setIsProgrammabilityModalOpen(false)}
        onMinimize={() => setIsProgrammabilityModalOpen(false)}
        serverId={server.id}
        serverName={server.name}
        databaseName={selectedTreeNode.dbName || ""}
        mode={programmabilityModalMode}
        targetName={programmabilityTargetName}
        existingTables={dbDetailsCache[selectedTreeNode.dbName || ""]?.tables?.map((t) => t.name) || []}
        initialRoutineParams={programmabilityRoutineParams}
        onSuccess={handleProgrammabilityModalSuccess}
        isLightMode={isLightMode}
        language={isEn ? 'en' : 'fa'}
      />

      {/* Phase 7: MySQL Table Row Mutation Modal */}
      <MysqlTableRowEditModal
        isOpen={isRowMutationModalOpen}
        onClose={() => {
          setIsRowMutationModalOpen(false);
          setSelectedRowForMutation(null);
        }}
        mode={rowMutationModalMode}
        databaseName={selectedTreeNode.dbName || ''}
        tableName={selectedTreeNode.tableName || selectedTreeNode.name || ''}
        columns={activeTableModalColumns}
        initialRow={selectedRowForMutation}
        onSubmitInsert={handleInsertRowSubmit}
        onSubmitUpdate={handleUpdateRowSubmit}
        onSubmitDelete={handleDeleteRowSubmit}
        isEn={isEn}
        isLightMode={isLightMode}
      />
    </div>,
    document.body
  );
};
