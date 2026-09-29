import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  Server,
  Users,
  User,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  Table as TableIcon,
  Eye,
  Zap,
  Code,
  Wrench,
  Hash,
  Puzzle,
  Copy,
  Check,
  Layers,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Clock,
  HardDrive,
  BarChart3,
  Sliders,
  CheckCircle2,
  XCircle,
  Tag,
  ListFilter,
  FileCode,
  Key,
  Link2,
  Sparkles,
  Filter,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  EyeOff,
  Download,
  Plus,
  Trash2,
  Maximize2,
  X,
  Pencil,
  Terminal,
  RotateCw,
  Activity,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresEngineOverview,
  PostgresDatabaseItem,
  PostgresRoleItem,
  PostgresTableItem,
  PostgresViewItem,
  PostgresRoutineItem,
  PostgresSequenceItem,
  PostgresTypeItem,
  PostgresSchemaExtensionItem,
  PostgresSchemaObjects,
  PostgresDatabaseTree,
  PostgresTableStructure,
  PostgresColumnStructure,
  PostgresPrimaryKeyConstraint,
  PostgresForeignKeyConstraint,
  PostgresUniqueConstraint,
  PostgresCheckConstraint,
  PostgresIndexDetail,
  PostgresTableDataResult,
  PostgresTableDataColumnInfo,
  PostgresTableDataFilter,
  PostgresFilterOperator,
  PostgresRowColumnValue,
} from '../../types';
import {
  fetchRemoteServerPostgresRoles,
  fetchRemoteServerPostgresDatabaseTree,
  fetchRemoteServerPostgresTableStructure,
  fetchRemoteServerPostgresTableData,
  insertRemoteServerPostgresTableRow,
  updateRemoteServerPostgresTableRow,
  deleteRemoteServerPostgresTableRow,
} from '../../services/api';
import { PostgresTableRowEditModal } from './PostgresTableRowEditModal';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresDatabaseBrowserTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  databases: PostgresDatabaseItem[];
  overviewData: PostgresEngineOverview | null;
  onRefreshDatabases: () => Promise<void>;
  onRefreshOverview: () => Promise<void>;
  onOpenSqlEditor?: (query: string, database?: string, schema?: string) => void;
  onOpenMaintenance?: (params: {
    database?: string;
    schema?: string;
    table?: string;
    action?: 'vacuum' | 'analyze' | 'reindex';
  }) => void;
}

export type SelectedNodeType =
  | 'root'
  | 'databases_folder'
  | 'database'
  | 'roles_folder'
  | 'role'
  | 'server_folder'
  | 'schemas_folder'
  | 'schema'
  | 'tables_folder'
  | 'table'
  | 'views_folder'
  | 'view'
  | 'matviews_folder'
  | 'matview'
  | 'functions_folder'
  | 'function'
  | 'procedures_folder'
  | 'procedure'
  | 'sequences_folder'
  | 'sequence'
  | 'types_folder'
  | 'type'
  | 'extensions_folder'
  | 'extension';

export interface SelectedNode {
  type: SelectedNodeType;
  id: string;
  name: string;
  dbName?: string;
  schemaName?: string;
  data?: any;
}

export const PostgresDatabaseBrowserTab: React.FC<PostgresDatabaseBrowserTabProps> = ({
  server,
  isLightMode,
  isEn,
  databases,
  overviewData,
  onRefreshDatabases,
  onRefreshOverview,
  onOpenSqlEditor,
  onOpenMaintenance,
}) => {
  // Tree expansion state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    return new Set(['root', 'databases_folder', 'roles_folder', 'server_folder']);
  });

  // Selected node in tree
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({
    type: 'root',
    id: 'root',
    name: 'PostgreSQL',
  });

  // Active sub-tab inside Schema & Object Explorer
  const [schemaTab, setSchemaTab] = useState<'all' | 'tables' | 'views' | 'routines' | 'sequences' | 'types'>('all');

  // Lazy-loaded database trees cache: dbName -> PostgresDatabaseTree
  const [databaseTrees, setDatabaseTrees] = useState<Record<string, PostgresDatabaseTree>>({});
  const [loadingTreeDbs, setLoadingTreeDbs] = useState<Set<string>>(new Set());
  const [treeErrors, setTreeErrors] = useState<Record<string, { en: string; fa?: string }>>({});

  // Roles list state
  const [rolesList, setRolesList] = useState<PostgresRoleItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [rolesError, setRolesError] = useState<{ en: string; fa?: string } | null>(null);

  // Search filter inside tree and detail views
  const [treeFilter, setTreeFilter] = useState('');
  const [detailFilter, setDetailFilter] = useState('');
  const [copiedText, setCopiedText] = useState(false);

  // Phase 5: Table Structure & Metadata state
  const [tableStructures, setTableStructures] = useState<Record<string, PostgresTableStructure>>({});
  const [loadingTableStructure, setLoadingTableStructure] = useState(false);
  const [tableStructureError, setTableStructureError] = useState<{ en: string; fa?: string } | null>(null);
  const [tableSubTab, setTableSubTab] = useState<'data' | 'columns' | 'constraints' | 'indexes' | 'storage' | 'sql'>('data');
  const [columnSearchQuery, setColumnSearchQuery] = useState('');

  // Phase 6: Table Data Viewer state
  const [tableDataResults, setTableDataResults] = useState<Record<string, PostgresTableDataResult>>({});
  const [loadingTableData, setLoadingTableData] = useState(false);
  const [tableDataError, setTableDataError] = useState<{ en: string; fa?: string } | null>(null);
  const [dataPage, setDataPage] = useState(1);
  const [dataPageSize, setDataPageSize] = useState(50);
  const [dataSortColumn, setDataSortColumn] = useState<string | undefined>(undefined);
  const [dataSortDirection, setDataSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [dataSearchInput, setDataSearchInput] = useState('');
  const [dataActiveSearch, setDataActiveSearch] = useState('');
  const [dataFilters, setDataFilters] = useState<PostgresTableDataFilter[]>([]);
  const [dataCountExact, setDataCountExact] = useState(false);
  const [dataHiddenColumns, setDataHiddenColumns] = useState<Record<string, boolean>>({});
  const [isFilterBuilderOpen, setIsFilterBuilderOpen] = useState(false);
  const [isColumnVisibilityOpen, setIsColumnVisibilityOpen] = useState(false);
  const [selectedRowForModal, setSelectedRowForModal] = useState<Record<string, any> | null>(null);
  const [newFilterColumn, setNewFilterColumn] = useState('');
  const [newFilterOperator, setNewFilterOperator] = useState<PostgresFilterOperator>('eq');
  const [newFilterValue, setNewFilterValue] = useState('');

  // Fetch detailed table structure (columns, PK, FK, unique, check, indexes, stats)
  const handleFetchTableStructure = useCallback(
    async (dbName: string, schemaName: string, tableName: string, force = false) => {
      if (!server?.id || !dbName || !schemaName || !tableName) return;
      const cacheKey = `${dbName}:${schemaName}:${tableName}`;
      if (!force && tableStructures[cacheKey]) return;

      setLoadingTableStructure(true);
      setTableStructureError(null);
      try {
        const res = await fetchRemoteServerPostgresTableStructure(server.id, {
          database: dbName,
          schema: schemaName,
          table: tableName,
        });

        if (res.success && res.structure) {
          setTableStructures((prev) => ({ ...prev, [cacheKey]: res.structure! }));
        } else {
          setTableStructureError({
            en: res.error || `Failed to fetch structure for table "${schemaName}"."${tableName}"`,
            fa: res.errorFa || `خطا در دریافت ساختار و متادیتای جدول "${schemaName}"."${tableName}"`,
          });
        }
      } catch (err: any) {
        setTableStructureError({
          en: err.message || `Network error fetching structure for "${tableName}"`,
          fa: `خطای شبکه در دریافت ساختار جدول "${tableName}"`,
        });
      } finally {
        setLoadingTableStructure(false);
      }
    },
    [server?.id, tableStructures]
  );

  // Phase 6: Fetch table rows safely with pagination, filtering & sorting
  const handleFetchTableData = useCallback(
    async (
      dbName: string,
      schemaName: string,
      tableName: string,
      overrides?: {
        page?: number;
        pageSize?: number;
        sortColumn?: string;
        sortDirection?: 'ASC' | 'DESC';
        search?: string;
        filters?: PostgresTableDataFilter[];
        countExact?: boolean;
      }
    ) => {
      if (!server?.id || !dbName || !schemaName || !tableName) return;
      const targetPage = overrides?.page !== undefined ? overrides.page : dataPage;
      const targetPageSize = overrides?.pageSize !== undefined ? overrides.pageSize : dataPageSize;
      const targetSortCol = overrides?.sortColumn !== undefined ? overrides.sortColumn : dataSortColumn;
      const targetSortDir = overrides?.sortDirection !== undefined ? overrides.sortDirection : dataSortDirection;
      const targetSearch = overrides?.search !== undefined ? overrides.search : dataActiveSearch;
      const targetFilters = overrides?.filters !== undefined ? overrides.filters : dataFilters;
      const targetExact = overrides?.countExact !== undefined ? overrides.countExact : dataCountExact;

      const cacheKey = `${dbName}:${schemaName}:${tableName}`;
      setLoadingTableData(true);
      setTableDataError(null);

      try {
        const res = await fetchRemoteServerPostgresTableData(server.id, {
          database: dbName,
          schema: schemaName,
          table: tableName,
          page: targetPage,
          pageSize: targetPageSize,
          sortColumn: targetSortCol,
          sortDirection: targetSortDir,
          search: targetSearch,
          filters: targetFilters,
          countExact: targetExact,
        });

        if (res.success && res.data) {
          setTableDataResults((prev) => ({ ...prev, [cacheKey]: res.data! }));
        } else {
          setTableDataError({
            en: res.error || `Failed to fetch data for table "${schemaName}"."${tableName}"`,
            fa: res.errorFa || `خطا در دریافت داده‌های جدول "${schemaName}"."${tableName}"`,
          });
        }
      } catch (err: any) {
        setTableDataError({
          en: err.message || `Network error fetching data for "${tableName}"`,
          fa: `خطای شبکه در دریافت داده‌های جدول "${tableName}"`,
        });
      } finally {
        setLoadingTableData(false);
      }
    },
    [
      server?.id,
      dataPage,
      dataPageSize,
      dataSortColumn,
      dataSortDirection,
      dataActiveSearch,
      dataFilters,
      dataCountExact,
    ]
  );

  // Automatically fetch table structure and initial data when a table node is selected
  useEffect(() => {
    if (selectedNode.type === 'table' && selectedNode.dbName && selectedNode.schemaName && selectedNode.name) {
      handleFetchTableStructure(selectedNode.dbName, selectedNode.schemaName, selectedNode.name);
      setDataPage(1);
      setDataSearchInput('');
      setDataActiveSearch('');
      setDataFilters([]);
      setDataSortColumn(undefined);
      setDataSortDirection('ASC');
      handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
        page: 1,
        search: '',
        filters: [],
        sortColumn: undefined,
        sortDirection: 'ASC',
      });
    }
  }, [selectedNode.type, selectedNode.dbName, selectedNode.schemaName, selectedNode.name]);

  // Phase 7: Table Data Editing state & handlers
  const [isInsertRowModalOpen, setIsInsertRowModalOpen] = useState(false);
  const [cloningRowForModal, setCloningRowForModal] = useState<Record<string, any> | null>(null);
  const [editingRowForModal, setEditingRowForModal] = useState<Record<string, any> | null>(null);
  const [deletingRowForModal, setDeletingRowForModal] = useState<Record<string, any> | null>(null);
  const [targetTableForEditModal, setTargetTableForEditModal] = useState<{
    dbName: string;
    schemaName: string;
    tableName: string;
  } | null>(null);
  const [rowMutationNotice, setRowMutationNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Auto-dismiss row mutation feedback after 5 seconds
  useEffect(() => {
    if (!rowMutationNotice) return;
    const timer = setTimeout(() => {
      setRowMutationNotice(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [rowMutationNotice]);

  const handleOpenInsertRowModalForTable = useCallback(
    (dbName: string, schemaName: string, tableName: string) => {
      setTargetTableForEditModal({ dbName, schemaName, tableName });
      handleFetchTableStructure(dbName, schemaName, tableName);
      handleFetchTableData(dbName, schemaName, tableName);
      setCloningRowForModal(null);
      setEditingRowForModal(null);
      setDeletingRowForModal(null);
      setIsInsertRowModalOpen(true);
    },
    [handleFetchTableStructure, handleFetchTableData]
  );

  const activeColumns = useMemo((): PostgresTableDataColumnInfo[] => {
    const currentDb = targetTableForEditModal?.dbName || selectedNode?.dbName || '';
    const currentSchema = targetTableForEditModal?.schemaName || selectedNode?.schemaName || '';
    const currentTable = targetTableForEditModal?.tableName || selectedNode?.name || '';
    const structKey = `${currentDb}:${currentSchema}:${currentTable}`;
    const tableData = structKey ? tableDataResults[structKey] : undefined;

    if (tableData?.columns && tableData.columns.length > 0 && (!targetTableForEditModal || targetTableForEditModal.tableName === selectedNode?.name)) {
      return tableData.columns;
    }
    if (structKey && tableStructures[structKey]?.columns) {
      return tableStructures[structKey].columns.map((col) => ({
        name: col.name,
        dataType: col.dataType,
        formattedType: col.dataType,
        isPrimaryKey: col.isPrimaryKey,
        isNullable: col.isNullable,
        defaultValue: col.defaultValue,
        isIdentity: col.isIdentity,
        isGenerated: col.isGenerated,
        isForeignKey: col.isForeignKey,
      }));
    }
    return tableData?.columns || [];
  }, [tableDataResults, tableStructures, targetTableForEditModal, selectedNode]);

  const handleInsertRowSubmit = useCallback(
    async (values: Record<string, PostgresRowColumnValue>): Promise<{ success: boolean; error?: string }> => {
      const dbName = targetTableForEditModal?.dbName || selectedNode.dbName;
      const schemaName = targetTableForEditModal?.schemaName || selectedNode.schemaName;
      const tableName = targetTableForEditModal?.tableName || selectedNode.name;

      if (!server?.id || !dbName || !schemaName || !tableName) {
        return { success: false, error: isEn ? 'Table context not selected' : 'کانتکست جدول مشخص نیست' };
      }
      try {
        const res = await insertRemoteServerPostgresTableRow(server.id, {
          database: dbName,
          schema: schemaName,
          table: tableName,
          values,
        });

        if (res.success) {
          setRowMutationNotice({
            type: 'success',
            message: isEn
              ? (res.message || 'Row successfully inserted.')
              : (res.messageFa || 'سطر با موفقیت در جدول درج شد.'),
          });
          handleFetchTableData(dbName, schemaName, tableName);
          handleFetchTableStructure(dbName, schemaName, tableName, true);
          return { success: true };
        } else {
          return {
            success: false,
            error: isEn ? (res.error || 'Failed to insert row') : (res.errorFa || res.error || 'خطا در درج سطر'),
          };
        }
      } catch (err: any) {
        return { success: false, error: err.message || (isEn ? 'Network error' : 'خطای شبکه') };
      }
    },
    [server?.id, targetTableForEditModal, selectedNode, isEn, handleFetchTableData, handleFetchTableStructure]
  );

  const handleUpdateRowSubmit = useCallback(
    async (
      updatedValues: Record<string, PostgresRowColumnValue>,
      primaryKeyValues?: Record<string, any>,
      ctid?: string,
      originalRow?: Record<string, any>
    ): Promise<{ success: boolean; error?: string }> => {
      const dbName = targetTableForEditModal?.dbName || selectedNode.dbName;
      const schemaName = targetTableForEditModal?.schemaName || selectedNode.schemaName;
      const tableName = targetTableForEditModal?.tableName || selectedNode.name;

      if (!server?.id || !dbName || !schemaName || !tableName) {
        return { success: false, error: isEn ? 'Table context not selected' : 'کانتکست جدول مشخص نیست' };
      }
      try {
        const res = await updateRemoteServerPostgresTableRow(server.id, {
          database: dbName,
          schema: schemaName,
          table: tableName,
          primaryKeyValues,
          ctid,
          originalRow,
          updatedValues,
        });

        if (res.success) {
          setRowMutationNotice({
            type: 'success',
            message: isEn
              ? (res.message || 'Row successfully updated.')
              : (res.messageFa || 'سطر با موفقیت به‌روزرسانی شد.'),
          });
          handleFetchTableData(dbName, schemaName, tableName);
          return { success: true };
        } else {
          return {
            success: false,
            error: isEn ? (res.error || 'Failed to update row') : (res.errorFa || res.error || 'خطا در به‌روزرسانی سطر'),
          };
        }
      } catch (err: any) {
        return { success: false, error: err.message || (isEn ? 'Network error' : 'خطای شبکه') };
      }
    },
    [server?.id, targetTableForEditModal, selectedNode, isEn, handleFetchTableData]
  );

  const handleDeleteRowSubmit = useCallback(
    async (
      primaryKeyValues?: Record<string, any>,
      ctid?: string,
      originalRow?: Record<string, any>
    ): Promise<{ success: boolean; error?: string }> => {
      const dbName = targetTableForEditModal?.dbName || selectedNode.dbName;
      const schemaName = targetTableForEditModal?.schemaName || selectedNode.schemaName;
      const tableName = targetTableForEditModal?.tableName || selectedNode.name;

      if (!server?.id || !dbName || !schemaName || !tableName) {
        return { success: false, error: isEn ? 'Table context not selected' : 'کانتکست جدول مشخص نیست' };
      }
      try {
        const res = await deleteRemoteServerPostgresTableRow(server.id, {
          database: dbName,
          schema: schemaName,
          table: tableName,
          primaryKeyValues,
          ctid,
          originalRow,
        });

        if (res.success) {
          setRowMutationNotice({
            type: 'success',
            message: isEn
              ? (res.message || 'Row successfully deleted.')
              : (res.messageFa || 'سطر با موفقیت از جدول حذف شد.'),
          });
          handleFetchTableData(dbName, schemaName, tableName);
          handleFetchTableStructure(dbName, schemaName, tableName, true);
          return { success: true };
        } else {
          return {
            success: false,
            error: isEn ? (res.error || 'Failed to delete row') : (res.errorFa || res.error || 'خطا در حذف سطر'),
          };
        }
      } catch (err: any) {
        return { success: false, error: err.message || (isEn ? 'Network error' : 'خطای شبکه') };
      }
    },
    [server?.id, targetTableForEditModal, selectedNode, isEn, handleFetchTableData, handleFetchTableStructure]
  );

  // Fetch roles
  const handleFetchRoles = useCallback(async () => {
    if (!server?.id) return;
    setLoadingRoles(true);
    setRolesError(null);
    try {
      const res = await fetchRemoteServerPostgresRoles(server.id);
      if (res.success && res.roles) {
        setRolesList(res.roles);
      } else {
        setRolesError({
          en: res.error || 'Failed to enumerate PostgreSQL roles',
          fa: res.errorFa || 'خطا در بارگذاری فهرست نقش‌ها و کاربران',
        });
      }
    } catch (err: any) {
      setRolesError({
        en: err.message || 'Network error listing roles',
        fa: 'خطای شبکه در دریافت نقش‌ها',
      });
    } finally {
      setLoadingRoles(false);
    }
  }, [server?.id]);

  // Initial load of roles on mount
  useEffect(() => {
    if (server?.id) {
      handleFetchRoles();
    }
  }, [server?.id, handleFetchRoles]);

  // Lazy-load database object tree
  const handleLoadDatabaseTree = useCallback(
    async (dbName: string, force = false) => {
      if (!server?.id || !dbName) return;
      if (!force && databaseTrees[dbName]) return;

      setLoadingTreeDbs((prev) => new Set(prev).add(dbName));
      setTreeErrors((prev) => {
        const copy = { ...prev };
        delete copy[dbName];
        return copy;
      });

      try {
        const res = await fetchRemoteServerPostgresDatabaseTree(server.id, dbName);
        if (res.success && res.tree) {
          setDatabaseTrees((prev) => ({ ...prev, [dbName]: res.tree! }));
        } else {
          setTreeErrors((prev) => ({
            ...prev,
            [dbName]: {
              en: res.error || `Failed to explore objects for "${dbName}"`,
              fa: res.errorFa || `خطا در دریافت اجزای پایگاه داده "${dbName}"`,
            },
          }));
        }
      } catch (err: any) {
        setTreeErrors((prev) => ({
          ...prev,
          [dbName]: {
            en: err.message || `Network error exploring "${dbName}"`,
            fa: `خطای شبکه در دریافت اطلاعات "${dbName}"`,
          },
        }));
      } finally {
        setLoadingTreeDbs((prev) => {
          const next = new Set(prev);
          next.delete(dbName);
          return next;
        });
      }
    },
    [server?.id, databaseTrees]
  );

  // Toggle node expansion
  const toggleNode = (nodeId: string, onExpandCallback?: () => void) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
        if (onExpandCallback) {
          onExpandCallback();
        }
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Filter databases by tree search query
  const filteredTreeDatabases = useMemo(() => {
    if (!treeFilter.trim()) return databases;
    const q = treeFilter.trim().toLowerCase();
    return databases.filter((db) => db.name.toLowerCase().includes(q));
  }, [databases, treeFilter]);

  // Filter roles by tree search query
  const filteredTreeRoles = useMemo(() => {
    if (!treeFilter.trim()) return rolesList;
    const q = treeFilter.trim().toLowerCase();
    return rolesList.filter((r) => r.rolname.toLowerCase().includes(q));
  }, [rolesList, treeFilter]);

  // Breadcrumbs text builder
  const breadcrumbParts = useMemo(() => {
    const parts: string[] = ['PostgreSQL'];
    if (selectedNode.dbName) {
      parts.push(selectedNode.dbName);
    }
    if (selectedNode.schemaName) {
      parts.push(selectedNode.schemaName);
    }
    if (selectedNode.name && selectedNode.name !== selectedNode.dbName && selectedNode.name !== 'PostgreSQL') {
      parts.push(selectedNode.name);
    }
    return parts;
  }, [selectedNode]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Quick Status & Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>{isEn ? 'PostgreSQL Object Explorer' : 'کاوشگر و درخت ساختار پایگاه داده'}</span>
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
            {rolesList.length} {isEn ? 'Roles' : 'نقش/کاربر'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onRefreshDatabases();
              handleFetchRoles();
              onRefreshOverview();
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isLightMode ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
            title={isEn ? 'Reload Server Objects' : 'بارگذاری مجدد اجزای سرور'}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isEn ? 'Reload Server' : 'بروزرسانی سرور'}</span>
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
          className={`w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r flex flex-col ${
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
                value={treeFilter}
                onChange={(e) => setTreeFilter(e.target.value)}
                placeholder={isEn ? 'Filter tree objects...' : 'فیلتر درخت اجزا...'}
                className="w-full bg-transparent focus:outline-hidden text-xs"
              />
              {treeFilter && (
                <button
                  type="button"
                  onClick={() => setTreeFilter('')}
                  className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Tree Node Hierarchy */}
          <div className="flex-1 overflow-y-auto p-2 text-xs select-none space-y-0.5 font-mono">
            {/* 1. ROOT NODE: PostgreSQL Cluster */}
            <div>
              <div
                onClick={() =>
                  setSelectedNode({
                    type: 'root',
                    id: 'root',
                    name: 'PostgreSQL',
                  })
                }
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition ${
                  selectedNode.type === 'root'
                    ? isLightMode
                      ? 'bg-blue-100 text-blue-800 font-bold'
                      : 'bg-blue-600/20 text-blue-400 font-bold border border-blue-500/30'
                    : isLightMode
                    ? 'hover:bg-slate-200/70 text-slate-800'
                    : 'hover:bg-slate-800/60 text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNode('root');
                  }}
                  className="p-0.5 hover:text-white"
                >
                  {expandedNodes.has('root') ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                <Server className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="truncate font-sans font-semibold text-xs">PostgreSQL</span>
                <span className="text-[10px] text-slate-400 ml-auto font-mono">
                  {overviewData?.versionShort || server.postgres_port || 5432}
                </span>
              </div>

              {/* Children of Root */}
              {expandedNodes.has('root') && (
                <div className="pl-4 pr-1 mt-1 space-y-0.5 border-l border-slate-700/30 ml-2.5">
                  {/* ======================================================== */}
                  {/* BRANCH A: Databases                                      */}
                  {/* ======================================================== */}
                  <div>
                    <div
                      onClick={() => {
                        setSelectedNode({
                          type: 'databases_folder',
                          id: 'databases_folder',
                          name: isEn ? 'Databases' : 'پایگاه‌های داده',
                        });
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                        selectedNode.type === 'databases_folder'
                          ? isLightMode
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : 'bg-blue-600/20 text-blue-400 font-bold'
                          : isLightMode
                          ? 'hover:bg-slate-200/70 text-slate-700'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNode('databases_folder');
                        }}
                        className="p-0.5 hover:text-white"
                      >
                        {expandedNodes.has('databases_folder') ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {expandedNodes.has('databases_folder') ? (
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="truncate font-sans font-medium text-xs">
                        {isEn ? 'Databases' : 'پایگاه‌های داده'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-800 text-slate-400 ml-auto">
                        {filteredTreeDatabases.length}
                      </span>
                    </div>

                    {/* Databases list */}
                    {expandedNodes.has('databases_folder') && (
                      <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                        {filteredTreeDatabases.map((db) => {
                          const dbNodeId = `db:${db.name}`;
                          const isExpanded = expandedNodes.has(dbNodeId);
                          const isSelected = selectedNode.type === 'database' && selectedNode.id === dbNodeId;
                          const isLoadingTree = loadingTreeDbs.has(db.name);
                          const tree = databaseTrees[db.name];
                          const error = treeErrors[db.name];

                          return (
                            <div key={db.oid || db.name}>
                              <div
                                onClick={() => {
                                  setSelectedNode({
                                    type: 'database',
                                    id: dbNodeId,
                                    name: db.name,
                                    dbName: db.name,
                                    data: db,
                                  });
                                  if (!tree && !isLoadingTree) {
                                    handleLoadDatabaseTree(db.name);
                                  }
                                }}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition ${
                                  isSelected
                                    ? isLightMode
                                      ? 'bg-blue-100 text-blue-800 font-bold'
                                      : 'bg-blue-600/20 text-blue-400 font-bold'
                                    : isLightMode
                                    ? 'hover:bg-slate-200/70 text-slate-700'
                                    : 'hover:bg-slate-800/60 text-slate-300'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleNode(dbNodeId, () => {
                                      if (!tree && !isLoadingTree) {
                                        handleLoadDatabaseTree(db.name);
                                      }
                                    });
                                  }}
                                  className="p-0.5 hover:text-white"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3 h-3" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3" />
                                  )}
                                </button>
                                <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span className="truncate text-xs font-mono">{db.name}</span>
                                {isLoadingTree && (
                                  <RefreshCw className="w-3 h-3 animate-spin text-blue-400 ml-auto shrink-0" />
                                )}
                                {!isLoadingTree && db.sizePretty && db.sizePretty !== 'N/A' && (
                                  <span className="text-[10px] text-slate-500 ml-auto shrink-0">
                                    {db.sizePretty}
                                  </span>
                                )}
                              </div>

                              {/* Lazy-loaded DB content */}
                              {isExpanded && (
                                <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                                  {isLoadingTree && (
                                    <div className="py-1 text-[11px] text-blue-400 flex items-center gap-1.5 font-sans">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      <span>{isEn ? 'Exploring schemas & objects...' : 'در حال بارگذاری اجزا...'}</span>
                                    </div>
                                  )}

                                  {error && (
                                    <div className="p-1.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-400 font-sans space-y-1">
                                      <p>{isEn ? error.en : error.fa || error.en}</p>
                                      <button
                                        type="button"
                                        onClick={() => handleLoadDatabaseTree(db.name, true)}
                                        className="text-[10px] underline font-bold"
                                      >
                                        {isEn ? 'Retry' : 'تلاش مجدد'}
                                      </button>
                                    </div>
                                  )}

                                  {tree && (
                                    <>
                                      {/* 1. Schemas Folder */}
                                      <div>
                                        <div
                                          onClick={() => {
                                            setSelectedNode({
                                              type: 'schemas_folder',
                                              id: `schemas:${db.name}`,
                                              name: isEn ? 'Schemas' : 'اسکیماها',
                                              dbName: db.name,
                                              data: tree.schemas,
                                            });
                                          }}
                                          className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                                            selectedNode.id === `schemas:${db.name}`
                                              ? 'bg-blue-600/20 text-blue-400 font-bold'
                                              : 'hover:bg-slate-800/40 text-slate-400'
                                          }`}
                                        >
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleNode(`schemas:${db.name}`);
                                            }}
                                            className="p-0.5 hover:text-white"
                                          >
                                            {expandedNodes.has(`schemas:${db.name}`) ? (
                                              <ChevronDown className="w-3 h-3" />
                                            ) : (
                                              <ChevronRight className="w-3 h-3" />
                                            )}
                                          </button>
                                          <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                          <span className="font-sans text-xs">
                                            {isEn ? 'Schemas' : 'اسکیماها'}
                                          </span>
                                          <span className="text-[10px] ml-auto text-slate-500 font-mono">
                                            {tree.schemas.length}
                                          </span>
                                        </div>

                                        {/* List of Schemas */}
                                        {expandedNodes.has(`schemas:${db.name}`) && (
                                          <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                                            {tree.schemas.map((schema) => {
                                              const schemaNodeId = `schema:${db.name}:${schema.name}`;
                                              const isSchemaExpanded = expandedNodes.has(schemaNodeId);
                                              const isSchemaSelected =
                                                selectedNode.type === 'schema' && selectedNode.id === schemaNodeId;

                                              return (
                                                <div key={schema.name}>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedNode({
                                                        type: 'schema',
                                                        id: schemaNodeId,
                                                        name: schema.name,
                                                        dbName: db.name,
                                                        schemaName: schema.name,
                                                        data: schema,
                                                      });
                                                      setSchemaTab('all');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                                                      isSchemaSelected
                                                        ? 'bg-blue-600/20 text-blue-400 font-bold'
                                                        : 'hover:bg-slate-800/40 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleNode(schemaNodeId);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {isSchemaExpanded ? (
                                                        <ChevronDown className="w-3 h-3" />
                                                      ) : (
                                                        <ChevronRight className="w-3 h-3" />
                                                      )}
                                                    </button>
                                                    <Layers className="w-3 h-3 text-purple-400 shrink-0" />
                                                    <span className="truncate text-xs font-mono">{schema.name}</span>
                                                  </div>

                                                  {/* Schema Objects */}
                                                  {isSchemaExpanded && (
                                                    <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                                                      {/* Tables Node */}
                                                      <div>
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'tables_folder',
                                                              id: `tables:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Tables' : 'جداول',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.tables,
                                                            });
                                                            setSchemaTab('tables');
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `tables:${db.name}:${schema.name}`
                                                              ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          {schema.tables.length > 0 && (
                                                            <button
                                                              type="button"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleNode(`tables:${db.name}:${schema.name}`);
                                                              }}
                                                              className="p-0.5 hover:text-white"
                                                              title={expandedNodes.has(`tables:${db.name}:${schema.name}`) ? (isEn ? 'Collapse tables' : 'بستن لیست جداول') : (isEn ? 'Expand tables' : 'نمایش جداول')}
                                                            >
                                                              {expandedNodes.has(`tables:${db.name}:${schema.name}`) ? (
                                                                <ChevronDown className="w-3 h-3" />
                                                              ) : (
                                                                <ChevronRight className="w-3 h-3" />
                                                              )}
                                                            </button>
                                                          )}
                                                          <TableIcon className="w-3 h-3 text-emerald-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'Tables' : 'جداول'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-emerald-400 font-mono">
                                                            {schema.tables.length}
                                                          </span>
                                                        </div>

                                                        {/* Individual Tables List in Object Explorer Tree */}
                                                        {expandedNodes.has(`tables:${db.name}:${schema.name}`) && (
                                                          <div className="pl-4 mt-0.5 space-y-0.5 border-l border-emerald-500/20 ml-2">
                                                            {schema.tables.map((table) => {
                                                              const tableNodeId = `table:${db.name}:${schema.name}:${table.name}`;
                                                              const isTableSelected = selectedNode.type === 'table' && selectedNode.id === tableNodeId;
                                                              return (
                                                                <div
                                                                  key={table.name}
                                                                  onClick={() => {
                                                                    setSelectedNode({
                                                                      type: 'table',
                                                                      id: tableNodeId,
                                                                      name: table.name,
                                                                      dbName: db.name,
                                                                      schemaName: schema.name,
                                                                      data: table,
                                                                    });
                                                                    setTableSubTab('data');
                                                                  }}
                                                                  className={`group flex items-center justify-between gap-1 px-2 py-0.5 rounded cursor-pointer transition ${
                                                                    isTableSelected
                                                                      ? 'bg-emerald-500/25 text-emerald-300 font-bold'
                                                                      : 'hover:bg-slate-800/40 text-slate-300'
                                                                  }`}
                                                                >
                                                                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                                                                    <TableIcon className="w-3 h-3 text-emerald-400 shrink-0" />
                                                                    <span className="truncate text-xs font-mono">{table.name}</span>
                                                                  </div>
                                                                  {/* Quick Actions in Tree */}
                                                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                                                                    <button
                                                                      type="button"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedNode({
                                                                          type: 'table',
                                                                          id: tableNodeId,
                                                                          name: table.name,
                                                                          dbName: db.name,
                                                                          schemaName: schema.name,
                                                                          data: table,
                                                                        });
                                                                        setTableSubTab('data');
                                                                        handleOpenInsertRowModalForTable(db.name, schema.name, table.name);
                                                                      }}
                                                                      className="p-0.5 rounded hover:bg-emerald-500/30 text-emerald-400 transition"
                                                                      title={isEn ? `Insert Row into ${table.name}` : `افزودن سطر به ${table.name}`}
                                                                    >
                                                                      <Plus className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                      type="button"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedNode({
                                                                          type: 'table',
                                                                          id: tableNodeId,
                                                                          name: table.name,
                                                                          dbName: db.name,
                                                                          schemaName: schema.name,
                                                                          data: table,
                                                                        });
                                                                        setTableSubTab('data');
                                                                      }}
                                                                      className="p-0.5 rounded hover:bg-cyan-500/30 text-cyan-400 transition"
                                                                      title={isEn ? `Browse Data of ${table.name}` : `مشاهده داده‌های ${table.name}`}
                                                                    >
                                                                      <Database className="w-3 h-3" />
                                                                    </button>
                                                                  </div>
                                                                </div>
                                                              );
                                                            })}
                                                          </div>
                                                        )}
                                                      </div>

                                                      {/* Views Node */}
                                                      <div
                                                        onClick={() => {
                                                          setSelectedNode({
                                                            type: 'views_folder',
                                                            id: `views:${db.name}:${schema.name}`,
                                                            name: isEn ? 'Views' : 'نماها (Views)',
                                                            dbName: db.name,
                                                            schemaName: schema.name,
                                                            data: schema.views,
                                                          });
                                                        }}
                                                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                          selectedNode.id === `views:${db.name}:${schema.name}`
                                                            ? 'bg-sky-500/20 text-sky-400 font-bold'
                                                            : 'hover:bg-slate-800/40 text-slate-400'
                                                        }`}
                                                      >
                                                        <Eye className="w-3 h-3 text-sky-400 shrink-0" />
                                                        <span className="font-sans text-[11px]">
                                                          {isEn ? 'Views' : 'نماها (Views)'}
                                                        </span>
                                                        <span className="text-[10px] ml-auto text-sky-400 font-mono">
                                                          {schema.views.length}
                                                        </span>
                                                      </div>

                                                      {/* Materialized Views */}
                                                      {schema.materializedViews.length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'matviews_folder',
                                                              id: `matviews:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Materialized Views' : 'نماهای مادی (MatViews)',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.materializedViews,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `matviews:${db.name}:${schema.name}`
                                                              ? 'bg-amber-500/20 text-amber-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'MatViews' : 'نماهای مادی'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-amber-400 font-mono">
                                                            {schema.materializedViews.length}
                                                          </span>
                                                        </div>
                                                      )}

                                                      {/* Functions */}
                                                      {schema.functions.length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'functions_folder',
                                                              id: `functions:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Functions' : 'توابع (Functions)',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.functions,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `functions:${db.name}:${schema.name}`
                                                              ? 'bg-violet-500/20 text-violet-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Code className="w-3 h-3 text-violet-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'Functions' : 'توابع'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-violet-400 font-mono">
                                                            {schema.functions.length}
                                                          </span>
                                                        </div>
                                                      )}

                                                      {/* Procedures */}
                                                      {schema.procedures.length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'procedures_folder',
                                                              id: `procedures:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Procedures' : 'رویه‌ها (Procedures)',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.procedures,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `procedures:${db.name}:${schema.name}`
                                                              ? 'bg-indigo-500/20 text-indigo-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Wrench className="w-3 h-3 text-indigo-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'Procedures' : 'رویه‌ها'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-indigo-400 font-mono">
                                                            {schema.procedures.length}
                                                          </span>
                                                        </div>
                                                      )}

                                                      {/* Sequences */}
                                                      {schema.sequences.length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'sequences_folder',
                                                              id: `sequences:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Sequences' : 'دنباله‌ها (Sequences)',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.sequences,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `sequences:${db.name}:${schema.name}`
                                                              ? 'bg-rose-500/20 text-rose-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Hash className="w-3 h-3 text-rose-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'Sequences' : 'دنباله‌ها'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-rose-400 font-mono">
                                                            {schema.sequences.length}
                                                          </span>
                                                        </div>
                                                      )}

                                                      {/* Custom Types & Enums */}
                                                      {(schema.types || []).length > 0 && (
                                                        <div
                                                          onClick={() => {
                                                            setSelectedNode({
                                                              type: 'types_folder',
                                                              id: `types:${db.name}:${schema.name}`,
                                                              name: isEn ? 'Types & Enums' : 'انواع داده و شمارشی‌ها',
                                                              dbName: db.name,
                                                              schemaName: schema.name,
                                                              data: schema.types,
                                                            });
                                                          }}
                                                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition ${
                                                            selectedNode.id === `types:${db.name}:${schema.name}`
                                                              ? 'bg-pink-500/20 text-pink-400 font-bold'
                                                              : 'hover:bg-slate-800/40 text-slate-400'
                                                          }`}
                                                        >
                                                          <Sliders className="w-3 h-3 text-pink-400 shrink-0" />
                                                          <span className="font-sans text-[11px]">
                                                            {isEn ? 'Types' : 'انواع داده'}
                                                          </span>
                                                          <span className="text-[10px] ml-auto text-pink-400 font-mono">
                                                            {schema.types?.length || 0}
                                                          </span>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      {/* 2. Extensions Folder */}
                                      <div
                                        onClick={() => {
                                          setSelectedNode({
                                            type: 'extensions_folder',
                                            id: `extensions:${db.name}`,
                                            name: isEn ? 'Extensions' : 'افزونه‌ها (Extensions)',
                                            dbName: db.name,
                                            data: tree.extensions,
                                          });
                                        }}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                                          selectedNode.id === `extensions:${db.name}`
                                            ? 'bg-amber-500/20 text-amber-400 font-bold'
                                            : 'hover:bg-slate-800/40 text-slate-400'
                                        }`}
                                      >
                                        <Puzzle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <span className="font-sans text-xs">
                                          {isEn ? 'Extensions' : 'افزونه‌ها (Extensions)'}
                                        </span>
                                        <span className="text-[10px] ml-auto text-slate-500 font-mono">
                                          {tree.extensions.length}
                                        </span>
                                      </div>
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
                  {/* BRANCH B: Roles & Users                                  */}
                  {/* ======================================================== */}
                  <div>
                    <div
                      onClick={() => {
                        setSelectedNode({
                          type: 'roles_folder',
                          id: 'roles_folder',
                          name: isEn ? 'Roles & Users' : 'نقش‌ها و کاربران',
                          data: rolesList,
                        });
                        if (rolesList.length === 0 && !loadingRoles) {
                          handleFetchRoles();
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                        selectedNode.type === 'roles_folder'
                          ? isLightMode
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : 'bg-blue-600/20 text-blue-400 font-bold'
                          : isLightMode
                          ? 'hover:bg-slate-200/70 text-slate-700'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNode('roles_folder', () => {
                            if (rolesList.length === 0 && !loadingRoles) {
                              handleFetchRoles();
                            }
                          });
                        }}
                        className="p-0.5 hover:text-white"
                      >
                        {expandedNodes.has('roles_folder') ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate font-sans font-medium text-xs">
                        {isEn ? 'Roles & Users' : 'نقش‌ها و کاربران'}
                      </span>
                      {loadingRoles ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-emerald-400 ml-auto" />
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-800 text-slate-400 ml-auto">
                          {filteredTreeRoles.length}
                        </span>
                      )}
                    </div>

                    {/* Roles list */}
                    {expandedNodes.has('roles_folder') && (
                      <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/30 ml-2">
                        {filteredTreeRoles.map((role) => {
                          const roleNodeId = `role:${role.rolname}`;
                          const isRoleSelected =
                            selectedNode.type === 'role' && selectedNode.id === roleNodeId;

                          return (
                            <div
                              key={role.rolname}
                              onClick={() => {
                                setSelectedNode({
                                  type: 'role',
                                  id: roleNodeId,
                                  name: role.rolname,
                                  data: role,
                                });
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                                isRoleSelected
                                  ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                                  : 'hover:bg-slate-800/40 text-slate-300'
                              }`}
                            >
                              {role.isSuperuser ? (
                                <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              ) : (
                                <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              <span className="truncate text-xs font-mono">{role.rolname}</span>
                              {role.isSuperuser && (
                                <span className="text-[9px] px-1 rounded font-sans bg-amber-500/15 text-amber-400 font-bold ml-auto">
                                  SU
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ======================================================== */}
                  {/* BRANCH C: Server Overview                                */}
                  {/* ======================================================== */}
                  <div>
                    <div
                      onClick={() => {
                        setSelectedNode({
                          type: 'server_folder',
                          id: 'server_folder',
                          name: isEn ? 'Server' : 'سرور و کلاستر',
                          data: overviewData,
                        });
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                        selectedNode.type === 'server_folder'
                          ? isLightMode
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : 'bg-blue-600/20 text-blue-400 font-bold'
                          : isLightMode
                          ? 'hover:bg-slate-200/70 text-slate-700'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <Server className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-4" />
                      <span className="truncate font-sans font-medium text-xs">
                        {isEn ? 'Server & Cluster' : 'سرور و پیکربندی کلاستر'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT PANE: Object Detail Inspector & Catalog View       */}
        {/* ======================================================== */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Top Breadcrumb & Metadata Header */}
          <div
            className={`px-4 sm:px-6 py-3 border-b flex items-center justify-between gap-3 shrink-0 ${
              isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap min-w-0 font-mono text-xs">
              {breadcrumbParts.map((part, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-slate-500">/</span>}
                  <span
                    className={
                      idx === breadcrumbParts.length - 1
                        ? 'font-bold text-blue-400 truncate max-w-[220px]'
                        : 'text-slate-400 truncate max-w-[150px]'
                    }
                  >
                    {part}
                  </span>
                </React.Fragment>
              ))}

              <button
                type="button"
                onClick={() => copyToClipboard(breadcrumbParts.join('.'))}
                className="p-1 hover:text-white text-slate-400 transition cursor-pointer"
                title={isEn ? 'Copy object path' : 'کپی مسیر شی'}
              >
                {copiedText ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  selectedNode.type === 'table' || selectedNode.type === 'tables_folder'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : selectedNode.type === 'view' || selectedNode.type === 'views_folder' || selectedNode.type === 'matview' || selectedNode.type === 'matviews_folder'
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    : selectedNode.type === 'database' || selectedNode.type === 'databases_folder'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : selectedNode.type === 'role' || selectedNode.type === 'roles_folder'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : selectedNode.type === 'function' || selectedNode.type === 'functions_folder' || selectedNode.type === 'procedure' || selectedNode.type === 'procedures_folder'
                    ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                    : selectedNode.type === 'type' || selectedNode.type === 'types_folder'
                    ? 'bg-pink-500/15 text-pink-400 border border-pink-500/30'
                    : selectedNode.type === 'sequence' || selectedNode.type === 'sequences_folder'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : selectedNode.type === 'schema' || selectedNode.type === 'schemas_folder'
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                    : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                }`}
              >
                {selectedNode.type.replace('_folder', '')}
              </span>
            </div>
          </div>

          {/* Detail Body Content */}
          <div className="p-4 sm:p-6 space-y-5 flex-1">
            {/* ======================================================== */}
            {/* VIEW A: ROOT / SERVER OVERVIEW                           */}
            {/* ======================================================== */}
            {(selectedNode.type === 'root' || selectedNode.type === 'server_folder') && overviewData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Server className="w-4 h-4 text-indigo-400" />
                    <span>{isEn ? 'PostgreSQL Cluster Overview' : 'مشخصات و مشخصه‌های کلاستر سرور'}</span>
                  </h4>
                  <FieldInfoTooltip
                    title={isEn ? 'PostgreSQL Engine Architecture' : 'معماری و وضعیت موتور PostgreSQL'}
                    whatIsIt={
                      isEn
                        ? 'Core instance specifications, execution directory, uptime and resource allocations.'
                        : 'مشخصات هسته، زمان روشن بودن، دایرکتوری داده‌ها و تخصیص منابع حافظه.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Crucial for understanding overall host database engine capabilities and cluster limits.'
                        : 'حیاتی جهت آگاهی از ظرفیت‌های پردازشی، محدودیت‌های کلاستر و سلامت سرویس دهنده.'
                    }
                    example="PostgreSQL 16.2 on x86_64-pc-linux-gnu"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Version' : 'نسخه موتور'}</span>
                    <p className="font-bold text-sm text-blue-400">{overviewData.versionShort}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Server Uptime' : 'مدت زمان کارکرد'}</span>
                    <p className="font-bold text-sm text-emerald-400">{overviewData.uptimePretty}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Connections' : 'اتصالات همزمان'}</span>
                    <p className="font-bold text-sm text-cyan-400">
                      {overviewData.connections.total} / {overviewData.maxConnections}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Cache Hit' : 'نرخ اصابت حافظه'}</span>
                    <p className="font-bold text-sm text-purple-400">
                      {overviewData.telemetry?.cacheHitRatio !== undefined ? `${overviewData.telemetry.cacheHitRatio}%` : '100%'}
                    </p>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <p className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'Cluster Environment Telemetry' : 'مشخصات محیطی کلاستر'}
                  </p>
                  <p>
                    <span className="text-slate-500">Data Directory: </span>
                    {overviewData.dataDirectory}
                  </p>
                  <p>
                    <span className="text-slate-500">Shared Buffers: </span>
                    {overviewData.sharedBuffers}
                  </p>
                  <p>
                    <span className="text-slate-500">WAL Level: </span>
                    {overviewData.walLevel}
                  </p>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW B: DATABASES FOLDER (CATALOG TABLE)                 */}
            {/* ======================================================== */}
            {selectedNode.type === 'databases_folder' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <span>{isEn ? 'PostgreSQL Database Catalog' : 'کاتالوگ پایگاه‌های داده کلاستر'}</span>
                  </h4>
                  <FieldInfoTooltip
                    title={isEn ? 'Database Catalog' : 'کاتالوگ دیتابیس‌ها'}
                    whatIsIt={
                      isEn
                        ? 'All user and template databases hosted in this cluster.'
                        : 'فهرست تمامی دیتابیس‌های کاربری و قالب موجود روی سرور.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Selecting a database lazy-loads its structural objects, schemas, tables, and routines.'
                        : 'با کلیک روی هر دیتابیس، ساختار درختی و اجزای داخلی آن بارگذاری می‌شود.'
                    }
                    example="production_db, staging_db, postgres"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <table className="w-full text-xs text-left">
                    <thead
                      className={`border-b text-[11px] font-semibold select-none ${
                        isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-3">{isEn ? 'Database Name' : 'نام دیتابیس'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Size' : 'حجم فیزیکی'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Encoding' : 'کدگذاری'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Connections' : 'اتصالات'}</th>
                        <th className="py-2.5 px-3 text-right">{isEn ? 'Action' : 'عملیات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {databases.map((db) => (
                        <tr
                          key={db.oid || db.name}
                          onClick={() => {
                            setSelectedNode({
                              type: 'database',
                              id: `db:${db.name}`,
                              name: db.name,
                              dbName: db.name,
                              data: db,
                            });
                            toggleNode(`db:${db.name}`);
                            if (!databaseTrees[db.name]) {
                              handleLoadDatabaseTree(db.name);
                            }
                          }}
                          className={`cursor-pointer transition ${
                            isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                            <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span>{db.name}</span>
                            {db.isTemplate && (
                              <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-400 font-sans">
                                template
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400">{db.owner}</td>
                          <td className="py-2 px-3 text-emerald-400 font-bold">{db.sizePretty}</td>
                          <td className="py-2 px-3 text-slate-400 text-[11px]">
                            {db.encoding} • {db.collation || 'default'}
                          </td>
                          <td className="py-2 px-3 text-cyan-400">{db.activeConnections}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition text-[11px] font-sans cursor-pointer"
                            >
                              {isEn ? 'Explore' : 'کاوش'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW C: SINGLE DATABASE OBJECT INSPECTOR                 */}
            {/* ======================================================== */}
            {selectedNode.type === 'database' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-cyan-400" />
                    <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.dbName}</h4>
                    {selectedNode.data?.isTemplate && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 font-bold">
                        Template DB
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => selectedNode.dbName && handleLoadDatabaseTree(selectedNode.dbName, true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Reload Database Objects' : 'بروزرسانی ساختار دیتابیس'}</span>
                  </button>
                </div>

                {/* Database Metrics Grid */}
                {selectedNode.data && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div
                      className={`p-3 rounded-xl border space-y-1 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Disk Size' : 'حجم فیزیکی'}</span>
                      <p className="font-bold text-sm text-emerald-400">{selectedNode.data.sizePretty}</p>
                    </div>

                    <div
                      className={`p-3 rounded-xl border space-y-1 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Owner' : 'مالک'}</span>
                      <p className="font-bold text-sm text-cyan-400">{selectedNode.data.owner}</p>
                    </div>

                    <div
                      className={`p-3 rounded-xl border space-y-1 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Encoding' : 'کدگذاری'}</span>
                      <p className="font-bold text-sm text-slate-200">{selectedNode.data.encoding}</p>
                    </div>

                    <div
                      className={`p-3 rounded-xl border space-y-1 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Connections' : 'اتصالات فعال'}</span>
                      <p className="font-bold text-sm text-blue-400">{selectedNode.data.activeConnections}</p>
                    </div>
                  </div>
                )}

                {/* Database Tree Summary if Loaded */}
                {selectedNode.dbName && databaseTrees[selectedNode.dbName] ? (
                  <div className="space-y-4">
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-sans">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>{isEn ? 'Discovered Object Counts' : 'شمارش اجزای کشف‌شده'}</span>
                    </h5>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center font-mono">
                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Schemas' : 'اسکیما'}</span>
                        <p className="font-bold text-base text-purple-400">
                          {databaseTrees[selectedNode.dbName].schemas.length}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Tables' : 'جداول'}</span>
                        <p className="font-bold text-base text-emerald-400">
                          {databaseTrees[selectedNode.dbName].totalTables}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Views' : 'نماها'}</span>
                        <p className="font-bold text-base text-sky-400">
                          {databaseTrees[selectedNode.dbName].totalViews}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'MatViews' : 'نماهای مادی'}</span>
                        <p className="font-bold text-base text-amber-400">
                          {databaseTrees[selectedNode.dbName].totalMaterializedViews}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Routines' : 'توابع/رویه‌ها'}</span>
                        <p className="font-bold text-base text-violet-400">
                          {databaseTrees[selectedNode.dbName].totalFunctions +
                            databaseTrees[selectedNode.dbName].totalProcedures}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Types' : 'انواع داده'}</span>
                        <p className="font-bold text-base text-pink-400">
                          {databaseTrees[selectedNode.dbName].totalTypes ?? 0}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-sans">{isEn ? 'Extensions' : 'افزونه‌ها'}</span>
                        <p className="font-bold text-base text-rose-400">
                          {databaseTrees[selectedNode.dbName].totalExtensions}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center space-y-3">
                    <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
                    <p className="text-xs text-slate-400">
                      {isEn
                        ? 'Lazy-loading schemas and objects for this database...'
                        : 'در حال بارگذاری سلسله‌مراتب اجزای این دیتابیس...'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW D: PHASE 4 — SCHEMA & OBJECT EXPLORER               */}
            {/* ======================================================== */}
            {(selectedNode.type === 'schema' ||
              selectedNode.type === 'schemas_folder' ||
              selectedNode.type === 'tables_folder' ||
              selectedNode.type === 'views_folder' ||
              selectedNode.type === 'matviews_folder' ||
              selectedNode.type === 'functions_folder' ||
              selectedNode.type === 'procedures_folder' ||
              selectedNode.type === 'sequences_folder' ||
              selectedNode.type === 'types_folder') && (
              <div className="space-y-4">
                {/* Schema Header with Info and Search */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-purple-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">
                        {selectedNode.type === 'schema'
                          ? selectedNode.schemaName || selectedNode.name
                          : selectedNode.type === 'schemas_folder'
                          ? isEn ? 'All Schemas' : 'تمام اسکیماها'
                          : selectedNode.name}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Database: ' : 'پایگاه داده: '}
                        <span className="font-mono text-cyan-400">{selectedNode.dbName}</span>
                        {selectedNode.data?.owner && (
                          <span className="ml-2 text-slate-500">
                            • {isEn ? 'Owner: ' : 'مالک: '}
                            <span className="text-slate-300 font-mono">{selectedNode.data.owner}</span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Instant Filter */}
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs w-full sm:w-64 ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={detailFilter}
                      onChange={(e) => setDetailFilter(e.target.value)}
                      placeholder={isEn ? 'Filter schema objects...' : 'فیلتر اجزای اسکیما...'}
                      className="w-full bg-transparent focus:outline-hidden text-xs"
                    />
                    {detailFilter && (
                      <button
                        type="button"
                        onClick={() => setDetailFilter('')}
                        className="text-slate-400 hover:text-white text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Schema Metadata & Object Counters */}
                {selectedNode.type === 'schema' && selectedNode.data && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Physical Size' : 'فضای فیزیکی اسکیما'}</span>
                        <p className="font-bold text-sm text-purple-400">
                          {(selectedNode.data as PostgresSchemaObjects).sizePretty || '0 bytes'}
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Tables & Views' : 'جداول و نماها'}</span>
                        <p className="font-bold text-sm text-emerald-400">
                          {(selectedNode.data as PostgresSchemaObjects).tables?.length || 0} /{' '}
                          {((selectedNode.data as PostgresSchemaObjects).views?.length || 0) +
                            ((selectedNode.data as PostgresSchemaObjects).materializedViews?.length || 0)}
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Routines (Func/Proc)' : 'توابع و رویه‌ها'}</span>
                        <p className="font-bold text-sm text-violet-400">
                          {((selectedNode.data as PostgresSchemaObjects).functions?.length || 0) +
                            ((selectedNode.data as PostgresSchemaObjects).procedures?.length || 0)}
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Sequences & Types' : 'دنباله‌ها و انواع'}</span>
                        <p className="font-bold text-sm text-pink-400">
                          {(selectedNode.data as PostgresSchemaObjects).sequences?.length || 0} /{' '}
                          {(selectedNode.data as PostgresSchemaObjects).types?.length || 0}
                        </p>
                      </div>
                    </div>

                    {(selectedNode.data as PostgresSchemaObjects).description && (
                      <p className="text-xs text-slate-400 italic bg-purple-500/5 p-2.5 rounded-lg border border-purple-500/10 font-sans">
                        <span className="font-semibold text-purple-300">{isEn ? 'Comment: ' : 'توضیحات: '}</span>
                        {(selectedNode.data as PostgresSchemaObjects).description}
                      </p>
                    )}
                  </div>
                )}

                {/* Sub-Tabs for Schema Objects */}
                {selectedNode.type === 'schema' && selectedNode.data && (
                  <div className="flex items-center gap-1.5 border-b border-slate-700/30 overflow-x-auto no-scrollbar pb-2">
                    <button
                      type="button"
                      onClick={() => setSchemaTab('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'all'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>{isEn ? 'All Objects' : 'کل اجزا'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('tables')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'tables'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Tables' : 'جداول'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {(selectedNode.data as PostgresSchemaObjects).tables?.length || 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('views')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'views'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Views' : 'نماها'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {((selectedNode.data as PostgresSchemaObjects).views?.length || 0) +
                          ((selectedNode.data as PostgresSchemaObjects).materializedViews?.length || 0)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('routines')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'routines'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Routines' : 'توابع و رویه‌ها'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {((selectedNode.data as PostgresSchemaObjects).functions?.length || 0) +
                          ((selectedNode.data as PostgresSchemaObjects).procedures?.length || 0)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('sequences')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'sequences'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Hash className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Sequences' : 'دنباله‌ها'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {(selectedNode.data as PostgresSchemaObjects).sequences?.length || 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSchemaTab('types')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        schemaTab === 'types'
                          ? 'bg-pink-600 text-white shadow-sm'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Types & Enums' : 'انواع داده'}</span>
                      <span className="text-[10px] px-1 rounded bg-black/20 font-mono">
                        {(selectedNode.data as PostgresSchemaObjects).types?.length || 0}
                      </span>
                    </button>
                  </div>
                )}

                {/* TAB CONTENT: TABLES */}
                {(schemaTab === 'tables' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <TableIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{isEn ? 'Tables' : 'جداول'}</span>
                      </h5>
                    </div>

                    <div
                      className={`rounded-xl border overflow-hidden ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <table className="w-full text-xs text-left">
                        <thead
                          className={`border-b text-[11px] font-semibold select-none ${
                            isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          <tr>
                            <th className="py-2.5 px-3">{isEn ? 'Table Name' : 'نام جدول'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Estimated Rows' : 'تخمین سطرها'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Disk Size' : 'فضای دیسک'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Attributes' : 'ویژگی‌ها'}</th>
                            <th className="py-2.5 px-3 text-center w-28">{isEn ? 'Actions' : 'عملیات'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {(((selectedNode.data as PostgresSchemaObjects)?.tables || [])
                            .filter((t) => !detailFilter || t.name.toLowerCase().includes(detailFilter.toLowerCase()))
                          ).map((table: PostgresTableItem) => (
                            <tr
                              key={table.name}
                              onClick={() => {
                                setSelectedNode({
                                  type: 'table',
                                  id: `table:${selectedNode.dbName}:${table.schema}:${table.name}`,
                                  name: table.name,
                                  dbName: selectedNode.dbName,
                                  schemaName: table.schema,
                                  data: table,
                                });
                                setTableSubTab('data');
                              }}
                              className={`cursor-pointer transition ${
                                isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                <TableIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>{table.name}</span>
                              </td>
                              <td className="py-2 px-3 text-slate-400">{table.owner}</td>
                              <td className="py-2 px-3 text-cyan-400 tabular-nums">
                                {table.estimatedRows.toLocaleString()}
                              </td>
                              <td className="py-2 px-3 text-emerald-400 font-bold">{table.sizePretty}</td>
                              <td className="py-2 px-3 space-x-1">
                                {table.hasIndexes && (
                                  <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-400 font-sans">
                                    INDEX
                                  </span>
                                )}
                                {table.hasTriggers && (
                                  <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-400 font-sans">
                                    TRIGGER
                                  </span>
                                )}
                                <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 font-sans">
                                  {table.persistence}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedNode({
                                        type: 'table',
                                        id: `table:${selectedNode.dbName}:${table.schema}:${table.name}`,
                                        name: table.name,
                                        dbName: selectedNode.dbName,
                                        schemaName: table.schema,
                                        data: table,
                                      });
                                      setTableSubTab('data');
                                    }}
                                    className="p-1 rounded hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition"
                                    title={isEn ? `Browse ${table.name} Data` : `مشاهده داده‌های ${table.name}`}
                                  >
                                    <Database className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedNode({
                                        type: 'table',
                                        id: `table:${selectedNode.dbName}:${table.schema}:${table.name}`,
                                        name: table.name,
                                        dbName: selectedNode.dbName,
                                        schemaName: table.schema,
                                        data: table,
                                      });
                                      setTableSubTab('data');
                                      handleOpenInsertRowModalForTable(selectedNode.dbName || '', table.schema, table.name);
                                    }}
                                    className="px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 transition"
                                    title={isEn ? `Insert Row into ${table.name}` : `افزودن سطر به ${table.name}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>{isEn ? 'Insert' : 'درج'}</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: VIEWS & MATVIEWS */}
                {(schemaTab === 'views' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                        <span>{isEn ? 'Views & Materialized Views' : 'نماها و نماهای مادی'}</span>
                      </h5>
                    </div>

                    <div
                      className={`rounded-xl border overflow-hidden ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <table className="w-full text-xs text-left">
                        <thead
                          className={`border-b text-[11px] font-semibold select-none ${
                            isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          <tr>
                            <th className="py-2.5 px-3">{isEn ? 'View Name' : 'نام نما'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Kind' : 'نوع نما'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Disk Size' : 'فضای دیسک'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {[
                            ...((selectedNode.data as PostgresSchemaObjects)?.views || []),
                            ...((selectedNode.data as PostgresSchemaObjects)?.materializedViews || []),
                          ]
                            .filter((v) => !detailFilter || v.name.toLowerCase().includes(detailFilter.toLowerCase()))
                            .map((view) => (
                              <tr
                                key={view.name}
                                onClick={() => {
                                  setSelectedNode({
                                    type: view.isMaterialized ? 'matview' : 'view',
                                    id: `view:${selectedNode.dbName}:${view.schema}:${view.name}`,
                                    name: view.name,
                                    dbName: selectedNode.dbName,
                                    schemaName: view.schema,
                                    data: view,
                                  });
                                }}
                                className={`cursor-pointer transition ${
                                  isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                  {view.isMaterialized ? (
                                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                  )}
                                  <span>{view.name}</span>
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                                      view.isMaterialized
                                        ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-sky-500/15 text-sky-400'
                                    }`}
                                  >
                                    {view.isMaterialized ? 'MATERIALIZED VIEW' : 'VIEW'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-400">{view.owner}</td>
                                <td className="py-2 px-3 text-slate-300">{view.sizePretty || 'N/A'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: ROUTINES (FUNCTIONS & PROCEDURES) */}
                {(schemaTab === 'routines' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5 text-violet-400" />
                        <span>{isEn ? 'Functions & Stored Procedures' : 'توابع و رویه‌های ذخیره‌شده'}</span>
                      </h5>
                    </div>

                    <div
                      className={`rounded-xl border overflow-hidden ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <table className="w-full text-xs text-left">
                        <thead
                          className={`border-b text-[11px] font-semibold select-none ${
                            isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          <tr>
                            <th className="py-2.5 px-3">{isEn ? 'Routine Name' : 'نام تابع / رویه'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Kind' : 'نوع'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Return Type' : 'نوع بازگشتی'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Arguments' : 'پارامترهای ورودی'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Language' : 'زبان'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {[
                            ...((selectedNode.data as PostgresSchemaObjects)?.functions || []),
                            ...((selectedNode.data as PostgresSchemaObjects)?.procedures || []),
                          ]
                            .filter((r) => !detailFilter || r.name.toLowerCase().includes(detailFilter.toLowerCase()))
                            .map((routine, idx) => (
                              <tr
                                key={`${routine.name}-${idx}`}
                                onClick={() => {
                                  setSelectedNode({
                                    type: routine.type === 'procedure' ? 'procedure' : 'function',
                                    id: `routine:${selectedNode.dbName}:${routine.schema}:${routine.name}:${idx}`,
                                    name: routine.name,
                                    dbName: selectedNode.dbName,
                                    schemaName: routine.schema,
                                    data: routine,
                                  });
                                }}
                                className={`cursor-pointer transition ${
                                  isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                  {routine.type === 'procedure' ? (
                                    <Wrench className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  ) : (
                                    <Code className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                  )}
                                  <span>{routine.name}</span>
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                                      routine.type === 'procedure'
                                        ? 'bg-indigo-500/15 text-indigo-400'
                                        : 'bg-violet-500/15 text-violet-400'
                                    }`}
                                  >
                                    {routine.type}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-cyan-400 truncate max-w-xs">{routine.returnType}</td>
                                <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-sm">
                                  {routine.argumentTypes || <span className="text-slate-600 font-sans italic">none</span>}
                                </td>
                                <td className="py-2 px-3 text-slate-300 font-sans uppercase text-[10px]">
                                  {routine.language}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: SEQUENCES */}
                {(schemaTab === 'sequences' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-rose-400" />
                        <span>{isEn ? 'Sequences' : 'دنباله‌ها'}</span>
                      </h5>
                    </div>

                    <div
                      className={`rounded-xl border overflow-hidden ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <table className="w-full text-xs text-left">
                        <thead
                          className={`border-b text-[11px] font-semibold select-none ${
                            isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          <tr>
                            <th className="py-2.5 px-3">{isEn ? 'Sequence Name' : 'نام دنباله'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Schema' : 'اسکیما'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {(((selectedNode.data as PostgresSchemaObjects)?.sequences || [])
                            .filter((s) => !detailFilter || s.name.toLowerCase().includes(detailFilter.toLowerCase()))
                          ).map((seq) => (
                            <tr
                              key={seq.name}
                              onClick={() => {
                                setSelectedNode({
                                  type: 'sequence',
                                  id: `seq:${selectedNode.dbName}:${seq.schema}:${seq.name}`,
                                  name: seq.name,
                                  dbName: selectedNode.dbName,
                                  schemaName: seq.schema,
                                  data: seq,
                                });
                              }}
                              className={`cursor-pointer transition ${
                                isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                <Hash className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                <span>{seq.name}</span>
                              </td>
                              <td className="py-2 px-3 text-slate-400">{seq.schema}</td>
                              <td className="py-2 px-3 text-slate-300">{seq.owner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: TYPES & ENUMS */}
                {(schemaTab === 'types' || (selectedNode.type === 'schema' && schemaTab === 'all')) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-pink-400" />
                        <span>{isEn ? 'Custom Types, Enums & Domains' : 'انواع داده سفارشی، شمارشی‌ها و دامنه‌ها'}</span>
                      </h5>
                    </div>

                    <div
                      className={`rounded-xl border overflow-hidden ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <table className="w-full text-xs text-left">
                        <thead
                          className={`border-b text-[11px] font-semibold select-none ${
                            isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          <tr>
                            <th className="py-2.5 px-3">{isEn ? 'Type Name' : 'نام نوع داده'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Kind' : 'طبقه‌بندی'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Enum Labels / Base Type' : 'مقادیر یا نوع پایه'}</th>
                            <th className="py-2.5 px-3">{isEn ? 'Owner' : 'مالک'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {(((selectedNode.data as PostgresSchemaObjects)?.types || [])
                            .filter((t) => !detailFilter || t.name.toLowerCase().includes(detailFilter.toLowerCase()))
                          ).map((item) => (
                            <tr
                              key={item.name}
                              onClick={() => {
                                setSelectedNode({
                                  type: 'type',
                                  id: `type:${selectedNode.dbName}:${item.schema}:${item.name}`,
                                  name: item.name,
                                  dbName: selectedNode.dbName,
                                  schemaName: item.schema,
                                  data: item,
                                });
                              }}
                              className={`cursor-pointer transition ${
                                isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                                <Sliders className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                                <span>{item.name}</span>
                              </td>
                              <td className="py-2 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-bold uppercase bg-pink-500/15 text-pink-400">
                                  {item.kind}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-300 text-[11px] truncate max-w-md">
                                {item.enumLabels && item.enumLabels.length > 0 ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {item.enumLabels.slice(0, 4).map((lbl, li) => (
                                      <span key={li} className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px]">
                                        {lbl}
                                      </span>
                                    ))}
                                    {item.enumLabels.length > 4 && (
                                      <span className="text-[10px] text-slate-500">+{item.enumLabels.length - 4} more</span>
                                    )}
                                  </div>
                                ) : (
                                  item.baseType || item.description || <span className="text-slate-600 font-sans italic">custom</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-400">{item.owner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW E: PHASE 5 - DETAILED TABLE STRUCTURE & METADATA    */}
            {/* ======================================================== */}
            {selectedNode.type === 'table' && selectedNode.data && (() => {
              const cacheKey = `${selectedNode.dbName || ''}:${selectedNode.schemaName || ''}:${selectedNode.name}`;
              const struct = tableStructures[cacheKey];
              const fallbackTable = selectedNode.data as PostgresTableItem;

              return (
                <div className="space-y-4">
                  {/* Table Header Bar */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                        <TableIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-base text-slate-100 font-mono tracking-tight">
                            {selectedNode.name}
                          </h4>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedNode.name)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                            title={isEn ? 'Copy Table Name' : 'کپی نام جدول'}
                          >
                            {copiedText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                          <span className="text-slate-500 font-sans">{isEn ? 'DB:' : 'دیتابیس:'}</span>
                          <span className="text-purple-400">{selectedNode.dbName}</span>
                          <span className="text-slate-600">/</span>
                          <span className="text-slate-500 font-sans">{isEn ? 'Schema:' : 'اسکیما:'}</span>
                          <span className="text-cyan-400">{selectedNode.schemaName}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {struct?.metadata.persistence || fallbackTable.persistence || 'permanent'}
                      </span>
                      {(struct?.primaryKey || fallbackTable.hasPrimaryKey) && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                          <Key className="w-3 h-3" />
                          <span>PK</span>
                        </span>
                      )}
                      {(struct?.metadata.isPartitioned || fallbackTable.isPartitioned) && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                          {isEn ? 'PARTITIONED' : 'پارتیشن‌شده'}
                        </span>
                      )}
                      {struct && struct.foreignKeys.length > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          <span>FK: {struct.foreignKeys.length}</span>
                        </span>
                      )}
                      {struct && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          IDX: {struct.indexes.length}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTargetTableForEditModal({
                            dbName: selectedNode.dbName || '',
                            schemaName: selectedNode.schemaName || '',
                            tableName: selectedNode.name || '',
                          });
                          setCloningRowForModal(null);
                          setEditingRowForModal(null);
                          setDeletingRowForModal(null);
                          setIsInsertRowModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 font-semibold bg-emerald-500 hover:bg-emerald-600 text-black font-bold border-emerald-400 shadow-sm transition"
                        title={isEn ? `Insert New Row into ${selectedNode.name}` : `افزودن سطر جدید به ${selectedNode.name}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Insert Row' : 'افزودن سطر'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableStructure(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, true);
                          }
                        }}
                        disabled={loadingTableStructure}
                        className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 font-mono transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                            : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                        } disabled:opacity-50`}
                        title={isEn ? 'Refresh Structure & Metadata' : 'تازه‌سازی ساختار و متادیتا'}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingTableStructure ? 'animate-spin text-cyan-400' : ''}`} />
                        <span className="hidden sm:inline font-sans text-[11px]">{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Primary Metrics Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs font-mono">
                    <div
                      className={`p-2.5 rounded-xl border space-y-0.5 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans block truncate">
                        {isEn ? 'Estimated Rows' : 'تخمین سطرها'}
                      </span>
                      <p className="font-bold text-sm text-cyan-400 tabular-nums">
                        {(struct ? struct.metadata.estimatedRows : fallbackTable.estimatedRows)?.toLocaleString?.() || 0}
                      </p>
                    </div>

                    <div
                      className={`p-2.5 rounded-xl border space-y-0.5 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans block truncate">
                        {isEn ? 'Columns' : 'ستون‌ها'}
                      </span>
                      <p className="font-bold text-sm text-emerald-400">
                        {struct ? struct.columns.length : (fallbackTable.columnCount ?? 'N/A')}
                      </p>
                    </div>

                    <div
                      className={`p-2.5 rounded-xl border space-y-0.5 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans block truncate">
                        {isEn ? 'Total Size' : 'فضای کل'}
                      </span>
                      <p className="font-bold text-sm text-purple-400">
                        {struct ? struct.metadata.totalSizePretty : fallbackTable.sizePretty}
                      </p>
                    </div>

                    <div
                      className={`p-2.5 rounded-xl border space-y-0.5 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans block truncate">
                        {isEn ? 'Table Heap' : 'داده جدول'}
                      </span>
                      <p className="font-bold text-sm text-slate-200">
                        {struct ? struct.metadata.tableSizePretty : (fallbackTable.tableSizePretty || 'N/A')}
                      </p>
                    </div>

                    <div
                      className={`p-2.5 rounded-xl border space-y-0.5 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans block truncate">
                        {isEn ? 'Index Total' : 'فضای ایندکس'}
                      </span>
                      <p className="font-bold text-sm text-blue-400">
                        {struct ? struct.metadata.indexSizePretty : (fallbackTable.indexSizePretty || 'N/A')}
                      </p>
                    </div>

                    <div
                      className={`p-2.5 rounded-xl border space-y-0.5 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans block truncate">
                        {isEn ? 'TOAST Out-of-line' : 'فضای TOAST'}
                      </span>
                      <p className="font-bold text-sm text-amber-400">
                        {struct ? struct.metadata.toastSizePretty : (fallbackTable.toastSizePretty || '0 bytes')}
                      </p>
                    </div>

                    <div
                      className={`p-2.5 rounded-xl border space-y-0.5 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans block truncate">
                        {isEn ? 'Table Owner' : 'مالک جدول'}
                      </span>
                      <p className="font-bold text-sm text-slate-200 truncate">
                        {struct ? struct.metadata.owner : fallbackTable.owner}
                      </p>
                    </div>

                    <div
                      className={`p-2.5 rounded-xl border space-y-0.5 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans block truncate">
                        {isEn ? 'Tablespace' : 'فضای جدول'}
                      </span>
                      <p className="font-bold text-sm text-slate-300 truncate">
                        {struct?.metadata.tablespace || 'pg_default'}
                      </p>
                    </div>
                  </div>

                  {/* Loading or Error State */}
                  {loadingTableStructure && !struct && (
                    <div className="p-8 rounded-xl border border-slate-800/80 bg-slate-900/40 text-center space-y-3">
                      <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                      <div className="space-y-1">
                        <p className="font-bold text-slate-200 text-sm">
                          {isEn ? 'Discovering Table Structure & Constraints...' : 'در حال استخراج ساختار و متادیتای جدول...'}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                          {isEn
                            ? 'Inspecting columns, primary keys, foreign keys, unique & check constraints, and index metadata'
                            : 'بررسی کاتالوگ‌های ستون‌ها، کلید اصلی، کلیدهای خارجی، محدودیت‌ها و ایندکس‌ها'}
                        </p>
                      </div>
                    </div>
                  )}

                  {tableStructureError && !struct && (
                    <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3 text-rose-300 text-xs">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{isEn ? tableStructureError.en : (tableStructureError.fa || tableStructureError.en)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableStructure(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, true);
                          }
                        }}
                        className="px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/40 font-bold hover:bg-rose-500/30 transition"
                      >
                        {isEn ? 'Retry' : 'تلاش مجدد'}
                      </button>
                    </div>
                  )}

                  {/* Navigation Sub-Tabs */}
                  {struct && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-2 overflow-x-auto text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setTableSubTab('data')}
                          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                            tableSubTab === 'data'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                              : isLightMode
                              ? 'hover:bg-slate-100 text-slate-600'
                              : 'hover:bg-slate-800/60 text-slate-400'
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Table Data' : 'داده‌های جدول'}</span>
                          {tableDataResults[`${selectedNode.dbName || ''}:${selectedNode.schemaName || ''}:${selectedNode.name}`] && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 font-bold">
                              {tableDataResults[`${selectedNode.dbName || ''}:${selectedNode.schemaName || ''}:${selectedNode.name}`].rows.length}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableSubTab('columns')}
                          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                            tableSubTab === 'columns'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                              : isLightMode
                              ? 'hover:bg-slate-100 text-slate-600'
                              : 'hover:bg-slate-800/60 text-slate-400'
                          }`}
                        >
                          <TableIcon className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Columns' : 'ستون‌ها'}</span>
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold">
                            {struct.columns.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableSubTab('constraints')}
                          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                            tableSubTab === 'constraints'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-sm'
                              : isLightMode
                              ? 'hover:bg-slate-100 text-slate-600'
                              : 'hover:bg-slate-800/60 text-slate-400'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Constraints' : 'محدودیت‌ها'}</span>
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300 font-bold">
                            {(struct.primaryKey ? 1 : 0) +
                              struct.foreignKeys.length +
                              struct.uniqueConstraints.length +
                              struct.checkConstraints.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableSubTab('indexes')}
                          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                            tableSubTab === 'indexes'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm'
                              : isLightMode
                              ? 'hover:bg-slate-100 text-slate-600'
                              : 'hover:bg-slate-800/60 text-slate-400'
                          }`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Indexes' : 'ایندکس‌ها'}</span>
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 font-bold">
                            {struct.indexes.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableSubTab('storage')}
                          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                            tableSubTab === 'storage'
                              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-sm'
                              : isLightMode
                              ? 'hover:bg-slate-100 text-slate-600'
                              : 'hover:bg-slate-800/60 text-slate-400'
                          }`}
                        >
                          <HardDrive className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Storage & Statistics' : 'حافظه و آمار فعالیت'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableSubTab('sql')}
                          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                            tableSubTab === 'sql'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                              : isLightMode
                              ? 'hover:bg-slate-100 text-slate-600'
                              : 'hover:bg-slate-800/60 text-slate-400'
                          }`}
                        >
                          <FileCode className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Quick SQL' : 'کوئری‌های سریع'}</span>
                        </button>
                      </div>

                      {/* SUB-TAB 0: PHASE 6 - TABLE DATA VIEWER */}
                      {tableSubTab === 'data' && (() => {
                        const dataCacheKey = `${selectedNode.dbName || ''}:${selectedNode.schemaName || ''}:${selectedNode.name}`;
                        const tableData = tableDataResults[dataCacheKey];
                        const availableCols = struct.columns;
                        const visibleCols = availableCols.filter((c) => !dataHiddenColumns[c.name]);

                        const exportJson = () => {
                          if (!tableData || !tableData.rows.length) return;
                          const jsonStr = JSON.stringify(tableData.rows, null, 2);
                          const blob = new Blob([jsonStr], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${selectedNode.name}_page_${tableData.page}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        };

                        const exportCsv = () => {
                          if (!tableData || !tableData.rows.length) return;
                          const headers = visibleCols.map((c) => c.name);
                          const rows = tableData.rows.map((row) =>
                            headers
                              .map((header) => {
                                const val = row[header];
                                if (val === null || val === undefined) return '';
                                const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                                return `"${str.replace(/"/g, '""')}"`;
                              })
                              .join(',')
                          );
                          const csvContent = [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','), ...rows].join('\n');
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${selectedNode.name}_page_${tableData.page}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        };

                        const toggleColumnSort = (colName: string) => {
                          let newSortCol: string | undefined = colName;
                          let newSortDir: 'ASC' | 'DESC' = 'ASC';

                          if (dataSortColumn === colName) {
                            if (dataSortDirection === 'ASC') {
                              newSortDir = 'DESC';
                            } else {
                              newSortCol = undefined;
                            }
                          }

                          setDataSortColumn(newSortCol);
                          setDataSortDirection(newSortDir);
                          setDataPage(1);

                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              page: 1,
                              sortColumn: newSortCol,
                              sortDirection: newSortDir,
                            });
                          }
                        };

                        const handleAddFilter = () => {
                          const col = newFilterColumn || (availableCols[0]?.name || '');
                          if (!col) return;
                          const newF: PostgresTableDataFilter = {
                            column: col,
                            operator: newFilterOperator,
                            value: newFilterValue,
                          };
                          const updated = [...dataFilters, newF];
                          setDataFilters(updated);
                          setNewFilterValue('');
                          setDataPage(1);
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              page: 1,
                              filters: updated,
                            });
                          }
                        };

                        const handleRemoveFilter = (index: number) => {
                          const updated = dataFilters.filter((_, i) => i !== index);
                          setDataFilters(updated);
                          setDataPage(1);
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              page: 1,
                              filters: updated,
                            });
                          }
                        };

                        const handleClearAllFilters = () => {
                          setDataFilters([]);
                          setDataPage(1);
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              page: 1,
                              filters: [],
                            });
                          }
                        };

                        const handleApplySearch = (e?: React.FormEvent) => {
                          if (e) e.preventDefault();
                          setDataActiveSearch(dataSearchInput);
                          setDataPage(1);
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              page: 1,
                              search: dataSearchInput,
                            });
                          }
                        };

                        const handleClearSearch = () => {
                          setDataSearchInput('');
                          setDataActiveSearch('');
                          setDataPage(1);
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              page: 1,
                              search: '',
                            });
                          }
                        };

                        const handlePageChange = (newPage: number) => {
                          const maxP = tableData ? tableData.totalPages : 1;
                          const p = Math.max(1, Math.min(newPage, maxP));
                          setDataPage(p);
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              page: p,
                            });
                          }
                        };

                        const handlePageSizeChange = (newSize: number) => {
                          setDataPageSize(newSize);
                          setDataPage(1);
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              page: 1,
                              pageSize: newSize,
                            });
                          }
                        };

                        const handleToggleExactCount = () => {
                          const nextExact = !dataCountExact;
                          setDataCountExact(nextExact);
                          if (selectedNode.dbName && selectedNode.schemaName) {
                            handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name, {
                              countExact: nextExact,
                            });
                          }
                        };

                        return (
                          <div className="space-y-3">
                            {/* Phase 7: Row Mutation Feedback Notice Banner */}
                            {rowMutationNotice && (
                              <div
                                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold animate-in fade-in duration-150 ${
                                  rowMutationNotice.type === 'success'
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {rowMutationNotice.type === 'success' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                                  )}
                                  <span>{rowMutationNotice.message}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setRowMutationNotice(null)}
                                  className="p-1 rounded hover:bg-black/20 text-slate-400 hover:text-white transition"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {/* Toolbar Top Bar */}
                            <div className="flex items-center justify-between gap-2.5 flex-wrap">
                              {/* Left: Search input, Filters, Columns & Insert Row Button */}
                              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
                                {/* Phase 7: Insert Row Button */}
                                <button
                                  type="button"
                                  onClick={() => setIsInsertRowModalOpen(true)}
                                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition shadow-sm bg-emerald-500 hover:bg-emerald-600 text-black font-bold border-emerald-400"
                                  title={isEn ? 'Insert a new row into this table' : 'افزودن سطر جدید به این جدول'}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Insert Row' : 'افزودن سطر'}</span>
                                </button>
                                {/* Search Form */}
                                <form onSubmit={handleApplySearch} className="relative flex-1 min-w-[180px] max-w-sm flex items-center">
                                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  <input
                                    type="text"
                                    value={dataSearchInput}
                                    onChange={(e) => setDataSearchInput(e.target.value)}
                                    placeholder={isEn ? 'Search table rows...' : 'جستجو در سطرهای جدول...'}
                                    className={`w-full pl-8 pr-16 py-1.5 text-xs rounded-lg border outline-none font-mono transition ${
                                      isLightMode
                                        ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500'
                                        : 'bg-slate-900 border-slate-800 text-slate-200 focus:border-cyan-500/50'
                                    }`}
                                  />
                                  <div className="absolute right-1.5 flex items-center gap-1">
                                    {dataSearchInput && (
                                      <button
                                        type="button"
                                        onClick={handleClearSearch}
                                        className="p-1 rounded text-slate-400 hover:text-white"
                                        title={isEn ? 'Clear search' : 'پاک کردن جستجو'}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                    <button
                                      type="submit"
                                      className="px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition border border-cyan-500/30"
                                    >
                                      {isEn ? 'Search' : 'جستجو'}
                                    </button>
                                  </div>
                                </form>

                                {/* Filter Toggle Button */}
                                <button
                                  type="button"
                                  onClick={() => setIsFilterBuilderOpen((prev) => !prev)}
                                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                                    isFilterBuilderOpen || dataFilters.length > 0
                                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-sm'
                                      : isLightMode
                                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                                  }`}
                                >
                                  <Filter className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Filters' : 'فیلترها'}</span>
                                  {dataFilters.length > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-500 text-white font-bold">
                                      {dataFilters.length}
                                    </span>
                                  )}
                                </button>

                                {/* Column Visibility Button */}
                                <button
                                  type="button"
                                  onClick={() => setIsColumnVisibilityOpen((prev) => !prev)}
                                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                                    isColumnVisibilityOpen
                                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/40 shadow-sm'
                                      : isLightMode
                                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                                  }`}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Columns' : 'ستون‌ها'}</span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    ({visibleCols.length}/{availableCols.length})
                                  </span>
                                </button>
                              </div>

                              {/* Right: Page Size, Count & Export */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Page size selector */}
                                <div className="flex items-center gap-1 text-xs font-mono text-slate-400">
                                  <span className="font-sans text-[11px] hidden sm:inline">{isEn ? 'Rows:' : 'سطر:'}</span>
                                  <select
                                    value={dataPageSize}
                                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                    className={`px-2 py-1 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                                      isLightMode
                                        ? 'bg-white border-slate-300 text-slate-900'
                                        : 'bg-slate-900 border-slate-800 text-slate-200'
                                    }`}
                                  >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={250}>250</option>
                                  </select>
                                </div>

                                {/* Count exact badge / toggle */}
                                <button
                                  type="button"
                                  onClick={handleToggleExactCount}
                                  className={`px-2 py-1 rounded-lg border text-xs font-mono flex items-center gap-1 transition ${
                                    dataCountExact
                                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                      : isLightMode
                                      ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                  }`}
                                  title={
                                    dataCountExact
                                      ? isEn
                                        ? 'Exact row count enabled'
                                        : 'شمارش دقیق سطرها فعال است'
                                      : isEn
                                      ? 'Click to calculate exact row count'
                                      : 'کلیک جهت محاسبه تعداد دقیق سطرها'
                                  }
                                >
                                  <Hash className="w-3 h-3 text-cyan-400" />
                                  <span className="font-sans text-[11px]">
                                    {tableData
                                      ? `${tableData.totalRows.toLocaleString()} ${
                                          tableData.isExactCount ? '' : (isEn ? '(est.)' : '(تخمینی)')
                                        }`
                                      : '...'}
                                  </span>
                                </button>

                                {/* Export buttons */}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={exportCsv}
                                    disabled={!tableData || !tableData.rows.length}
                                    className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition ${
                                      isLightMode
                                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                                    } disabled:opacity-40`}
                                    title={isEn ? 'Export visible rows as CSV' : 'خروجی CSV سطرهای جاری'}
                                  >
                                    <Download className="w-3 h-3 text-emerald-400" />
                                    <span>CSV</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={exportJson}
                                    disabled={!tableData || !tableData.rows.length}
                                    className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition ${
                                      isLightMode
                                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                                    } disabled:opacity-40`}
                                    title={isEn ? 'Export visible rows as JSON' : 'خروجی JSON سطرهای جاری'}
                                  >
                                    <Download className="w-3 h-3 text-purple-400" />
                                    <span>JSON</span>
                                  </button>
                                </div>

                                {/* Refresh */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedNode.dbName && selectedNode.schemaName) {
                                      handleFetchTableData(selectedNode.dbName, selectedNode.schemaName, selectedNode.name);
                                    }
                                  }}
                                  disabled={loadingTableData}
                                  className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition ${
                                    isLightMode
                                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                                  } disabled:opacity-50`}
                                  title={isEn ? 'Refresh table data' : 'تازه‌سازی داده‌های جدول'}
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTableData ? 'animate-spin text-cyan-400' : ''}`} />
                                </button>
                              </div>
                            </div>

                            {/* Collapsible Filter Builder Panel */}
                            {isFilterBuilderOpen && (
                              <div
                                className={`p-3.5 rounded-xl border space-y-3 ${
                                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <h6 className="font-bold text-xs flex items-center gap-1.5 text-blue-400 uppercase tracking-wider">
                                    <Filter className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Table Column Filters' : 'فیلترهای پیشرفته ستون‌ها'}</span>
                                  </h6>
                                  {dataFilters.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={handleClearAllFilters}
                                      className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>{isEn ? 'Clear All' : 'حذف همه فیلترها'}</span>
                                    </button>
                                  )}
                                </div>

                                {/* Active Filters List */}
                                {dataFilters.length > 0 && (
                                  <div className="space-y-1.5">
                                    {dataFilters.map((f, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-black/20 border border-slate-800 text-xs font-mono"
                                      >
                                        <span className="font-bold text-slate-200">"{f.column}"</span>
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
                                          className="p-1 rounded text-slate-500 hover:text-rose-400 transition ml-auto"
                                          title={isEn ? 'Remove filter' : 'حذف فیلتر'}
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Add New Filter Form */}
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
                                    onChange={(e) => setNewFilterOperator(e.target.value as PostgresFilterOperator)}
                                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                                      isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                                    }`}
                                  >
                                    <option value="eq">= ({isEn ? 'equals' : 'برابر با'})</option>
                                    <option value="neq">!= ({isEn ? 'not equals' : 'نابرابر با'})</option>
                                    <option value="contains">{isEn ? 'contains' : 'شامل'}</option>
                                    <option value="notContains">{isEn ? 'not contains' : 'شامل نشود'}</option>
                                    <option value="startsWith">{isEn ? 'starts with' : 'شروع شود با'}</option>
                                    <option value="endsWith">{isEn ? 'ends with' : 'پایان یابد با'}</option>
                                    <option value="gt">&gt; ({isEn ? 'greater than' : 'بزرگتر از'})</option>
                                    <option value="gte">&gt;= ({isEn ? 'greater or equal' : 'بزرگتر یا مساوی'})</option>
                                    <option value="lt">&lt; ({isEn ? 'less than' : 'کوچکتر از'})</option>
                                    <option value="lte">&lt;= ({isEn ? 'less or equal' : 'کوچکتر یا مساوی'})</option>
                                    <option value="isNull">{isEn ? 'is NULL' : 'مقدار NULL باشد'}</option>
                                    <option value="isNotNull">{isEn ? 'is NOT NULL' : 'مقدار NULL نباشد'}</option>
                                  </select>

                                  {newFilterOperator !== 'isNull' && newFilterOperator !== 'isNotNull' && (
                                    <input
                                      type="text"
                                      value={newFilterValue}
                                      onChange={(e) => setNewFilterValue(e.target.value)}
                                      placeholder={isEn ? 'Filter value...' : 'مقدار شرط...'}
                                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none flex-1 min-w-[140px] ${
                                        isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                                      }`}
                                    />
                                  )}

                                  <button
                                    type="button"
                                    onClick={handleAddFilter}
                                    className="px-3 py-1.5 rounded-lg bg-blue-500 text-white font-semibold text-xs flex items-center gap-1 hover:bg-blue-600 transition shadow-sm"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Add Filter' : 'افزودن فیلتر'}</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Collapsible Column Visibility Popover */}
                            {isColumnVisibilityOpen && (
                              <div
                                className={`p-3.5 rounded-xl border space-y-2.5 ${
                                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <h6 className="font-bold text-xs flex items-center gap-1.5 text-purple-400 uppercase tracking-wider">
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Column Visibility' : 'نمایش / مخفی‌سازی ستون‌ها'}</span>
                                  </h6>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setDataHiddenColumns({})}
                                      className="text-[11px] font-semibold text-cyan-400 hover:underline"
                                    >
                                      {isEn ? 'Show All' : 'نمایش همه'}
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto pt-1">
                                  {availableCols.map((c) => {
                                    const isHidden = Boolean(dataHiddenColumns[c.name]);
                                    return (
                                      <label
                                        key={c.name}
                                        className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs font-mono cursor-pointer transition ${
                                          isHidden
                                            ? 'opacity-50 border-transparent bg-black/10'
                                            : isLightMode
                                            ? 'bg-white border-slate-200 shadow-sm'
                                            : 'bg-slate-950 border-slate-800 text-slate-200'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={!isHidden}
                                          onChange={(e) => {
                                            setDataHiddenColumns((prev) => ({
                                              ...prev,
                                              [c.name]: !e.target.checked,
                                            }));
                                          }}
                                          className="rounded border-slate-700 text-purple-500 focus:ring-0"
                                        />
                                        <span className="truncate">{c.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Data Table Grid */}
                            <div
                              className={`rounded-xl border overflow-hidden ${
                                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
                              }`}
                            >
                              <div className="overflow-x-auto max-h-[600px] relative">
                                {loadingTableData && (
                                  <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-20">
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800 shadow-lg text-xs font-mono text-cyan-400">
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                      <span>{isEn ? 'Executing query...' : 'در حال اجرای کوئری...'}</span>
                                    </div>
                                  </div>
                                )}

                                <table className="w-full text-left text-xs font-mono">
                                  <thead
                                    className={`sticky top-0 text-[11px] uppercase tracking-wider font-semibold border-b z-10 ${
                                      isLightMode
                                        ? 'bg-slate-100 border-slate-200 text-slate-600'
                                        : 'bg-slate-900 border-slate-800 text-slate-400'
                                    }`}
                                  >
                                    <tr>
                                      <th className="py-2.5 px-3 w-12 text-slate-500">#</th>
                                      <th className="py-2.5 px-2 w-20 text-center">
                                        <span>{isEn ? 'Actions' : 'عملیات'}</span>
                                      </th>
                                      {visibleCols.map((col) => {
                                        const isSorted = dataSortColumn === col.name;
                                        return (
                                          <th
                                            key={col.name}
                                            onClick={() => toggleColumnSort(col.name)}
                                            className="py-2.5 px-3 cursor-pointer hover:bg-slate-800/40 transition select-none group"
                                          >
                                            <div className="flex items-center gap-1.5">
                                              {col.isPrimaryKey && (
                                                <span title="Primary Key">
                                                  <Key className="w-3 h-3 text-blue-400 shrink-0" />
                                                </span>
                                              )}
                                              <span className={isSorted ? 'text-cyan-400 font-bold' : ''}>
                                                {col.name}
                                              </span>
                                              <span className="text-[9px] px-1 py-0.2 rounded font-mono font-normal bg-black/30 text-slate-400">
                                                {col.formattedType}
                                              </span>
                                              <span className="ml-auto text-slate-500 group-hover:text-slate-300">
                                                {isSorted ? (
                                                  dataSortDirection === 'ASC' ? (
                                                    <ArrowUp className="w-3 h-3 text-cyan-400" />
                                                  ) : (
                                                    <ArrowDown className="w-3 h-3 text-cyan-400" />
                                                  )
                                                ) : (
                                                  <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                                                )}
                                              </span>
                                            </div>
                                          </th>
                                        );
                                      })}
                                    </tr>
                                  </thead>

                                  <tbody className="divide-y divide-slate-800/40 text-xs">
                                    {tableData && tableData.rows.length > 0 ? (
                                      tableData.rows.map((row, rIdx) => {
                                        const absoluteRowNum = (tableData.page - 1) * tableData.pageSize + rIdx + 1;
                                        return (
                                          <tr
                                            key={rIdx}
                                            className={`transition ${
                                              isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-900/60'
                                            }`}
                                          >
                                            <td className="py-2 px-3 text-slate-500 text-[11px]">
                                              {absoluteRowNum}
                                            </td>
                                            <td className="py-2 px-2 text-center whitespace-nowrap">
                                              <div className="flex items-center justify-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => setSelectedRowForModal(row)}
                                                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition"
                                                  title={isEn ? 'View row details' : 'مشاهده جزئیات سطر'}
                                                >
                                                  <Maximize2 className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setEditingRowForModal(row)}
                                                  className="p-1 rounded hover:bg-amber-950/40 text-slate-400 hover:text-amber-400 transition"
                                                  title={isEn ? 'Edit row' : 'ویرایش سطر'}
                                                >
                                                  <Pencil className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setCloningRowForModal(row);
                                                    setTargetTableForEditModal({
                                                      dbName: selectedNode.dbName || '',
                                                      schemaName: selectedNode.schemaName || '',
                                                      tableName: selectedNode.name || '',
                                                    });
                                                    setEditingRowForModal(null);
                                                    setDeletingRowForModal(null);
                                                    setIsInsertRowModalOpen(true);
                                                  }}
                                                  className="p-1 rounded hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 transition"
                                                  title={isEn ? 'Duplicate / Clone row' : 'تکثیر و کپی این سطر'}
                                                >
                                                  <Copy className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setDeletingRowForModal(row)}
                                                  className="p-1 rounded hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition"
                                                  title={isEn ? 'Delete row' : 'حذف سطر'}
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              </div>
                                            </td>
                                            {visibleCols.map((col) => {
                                              const rawVal = row[col.name];
                                              const isNull = rawVal === null || rawVal === undefined;

                                              let displayNode: React.ReactNode;
                                              if (isNull) {
                                                displayNode = (
                                                  <span className="text-slate-500 italic text-[11px]">NULL</span>
                                                );
                                              } else if (typeof rawVal === 'boolean') {
                                                displayNode = rawVal ? (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                    TRUE
                                                  </span>
                                                ) : (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                                    FALSE
                                                  </span>
                                                );
                                              } else if (typeof rawVal === 'object') {
                                                const jsonStr = JSON.stringify(rawVal);
                                                displayNode = (
                                                  <span
                                                    className="text-purple-300 font-mono text-[11px] truncate block max-w-xs cursor-pointer hover:underline"
                                                    onClick={() => setSelectedRowForModal(row)}
                                                    title={jsonStr}
                                                  >
                                                    {jsonStr}
                                                  </span>
                                                );
                                              } else {
                                                const strVal = String(rawVal);
                                                displayNode = (
                                                  <span
                                                    className={`truncate block max-w-sm ${
                                                      col.isPrimaryKey ? 'text-blue-300 font-semibold' : 'text-slate-200'
                                                    }`}
                                                    title={strVal}
                                                  >
                                                    {strVal}
                                                  </span>
                                                );
                                              }

                                              return (
                                                <td key={col.name} className="py-2 px-3 whitespace-nowrap">
                                                  {displayNode}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })
                                    ) : (
                                      <tr>
                                        <td
                                          colSpan={visibleCols.length + 2}
                                          className="py-12 text-center text-slate-500 font-sans"
                                        >
                                          {loadingTableData ? (
                                            <div className="flex flex-col items-center gap-2">
                                              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                                              <span>{isEn ? 'Loading rows...' : 'در حال بارگذاری سطرها...'}</span>
                                            </div>
                                          ) : (
                                            <div className="space-y-1">
                                              <p className="font-semibold text-slate-300">
                                                {isEn ? 'No rows found in this table.' : 'هیچ سطری در این جدول یافت نشد.'}
                                              </p>
                                              <p className="text-xs text-slate-500">
                                                {isEn
                                                  ? 'Try adjusting or clearing your filters and search query.'
                                                  : 'فیلترها یا عبارت جستجوی خود را تغییر دهید.'}
                                              </p>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              {/* Table Bottom Pagination Bar */}
                              {tableData && (
                                <div
                                  className={`p-3 border-t flex items-center justify-between gap-3 flex-wrap text-xs font-mono ${
                                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                                  }`}
                                >
                                  {/* Left: Execution info & row range */}
                                  <div className="flex items-center gap-3 text-slate-400">
                                    <span className="flex items-center gap-1 font-sans">
                                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                      <span>{tableData.executionTimeMs} ms</span>
                                    </span>
                                    <span className="text-slate-600">|</span>
                                    <span className="font-sans">
                                      {isEn ? 'Showing ' : 'نمایش '}
                                      <b className="text-slate-200">
                                        {tableData.rows.length > 0
                                          ? `${(tableData.page - 1) * tableData.pageSize + 1}–${Math.min(
                                              tableData.page * tableData.pageSize,
                                              tableData.totalRows
                                            )}`
                                          : 0}
                                      </b>{' '}
                                      {isEn ? 'of ' : 'از '}
                                      <b className="text-cyan-400">{tableData.totalRows.toLocaleString()}</b>{' '}
                                      {tableData.isExactCount ? '' : (isEn ? '(estimated)' : '(تخمینی)')}
                                    </span>
                                  </div>

                                  {/* Right: Pagination Controls */}
                                  <div className="flex items-center gap-1.5 ml-auto">
                                    <button
                                      type="button"
                                      onClick={() => handlePageChange(1)}
                                      disabled={tableData.page <= 1 || loadingTableData}
                                      className={`p-1.5 rounded-lg border transition ${
                                        isLightMode
                                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                                      } disabled:opacity-30`}
                                      title={isEn ? 'First page' : 'صفحه نخست'}
                                    >
                                      <ChevronsLeft className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handlePageChange(tableData.page - 1)}
                                      disabled={tableData.page <= 1 || loadingTableData}
                                      className={`p-1.5 rounded-lg border transition ${
                                        isLightMode
                                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                                      } disabled:opacity-30`}
                                      title={isEn ? 'Previous page' : 'صفحه قبل'}
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>

                                    <span className="px-2 text-slate-400 font-sans">
                                      {isEn ? 'Page' : 'صفحه'} <b className="text-slate-200">{tableData.page}</b>{' '}
                                      {isEn ? 'of' : 'از'} <b className="text-slate-200">{tableData.totalPages}</b>
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() => handlePageChange(tableData.page + 1)}
                                      disabled={tableData.page >= tableData.totalPages || loadingTableData}
                                      className={`p-1.5 rounded-lg border transition ${
                                        isLightMode
                                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                                      } disabled:opacity-30`}
                                      title={isEn ? 'Next page' : 'صفحه بعد'}
                                    >
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handlePageChange(tableData.totalPages)}
                                      disabled={tableData.page >= tableData.totalPages || loadingTableData}
                                      className={`p-1.5 rounded-lg border transition ${
                                        isLightMode
                                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                                      } disabled:opacity-30`}
                                      title={isEn ? 'Last page' : 'صفحه آخر'}
                                    >
                                      <ChevronsRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Row Detail Full Modal */}
                            {selectedRowForModal && (
                              <div className="fixed inset-0 z-[999995] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
                                <div
                                  className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
                                    isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-800'
                                  }`}
                                >
                                  {/* Header */}
                                  <div className="p-4 border-b border-slate-800/80 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <Maximize2 className="w-4 h-4 text-cyan-400" />
                                      <h5 className="font-bold text-sm text-slate-100 font-mono">
                                        {isEn ? 'Row Details Inspector' : 'جزئیات کامل سطر داده'}
                                      </h5>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => copyToClipboard(JSON.stringify(selectedRowForModal, null, 2))}
                                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition border border-slate-800"
                                        title={isEn ? 'Copy Row JSON' : 'کپی کل سطر به صورت JSON'}
                                      >
                                        {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedRowForModal(null)}
                                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Body */}
                                  <div className="p-4 overflow-y-auto space-y-3 font-mono text-xs flex-1">
                                    <div className="divide-y divide-slate-800/60">
                                      {Object.entries(selectedRowForModal).map(([key, val]) => (
                                        <div key={key} className="py-2.5 flex items-start justify-between gap-3">
                                          <div className="w-1/3 min-w-[120px]">
                                            <span className="font-bold text-slate-300 block truncate">{key}</span>
                                            <span className="text-[10px] text-slate-500 font-sans">
                                              {availableCols.find((c) => c.name === key)?.formattedType || typeof val}
                                            </span>
                                          </div>
                                          <div className="w-2/3 flex items-center justify-between gap-2 p-2 rounded-lg bg-black/30 border border-slate-900">
                                            <span className="text-cyan-300 break-all select-all font-mono">
                                              {val === null || val === undefined ? (
                                                <i className="text-slate-500 font-sans">NULL</i>
                                              ) : typeof val === 'object' ? (
                                                JSON.stringify(val, null, 2)
                                              ) : (
                                                String(val)
                                              )}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => copyToClipboard(typeof val === 'object' ? JSON.stringify(val) : String(val))}
                                              className="p-1 text-slate-500 hover:text-white shrink-0"
                                              title={isEn ? 'Copy value' : 'کپی مقدار'}
                                            >
                                              <Copy className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* End of table data container */}
                          </div>
                        );
                      })()}

                      {/* SUB-TAB 1: COLUMNS */}
                      {tableSubTab === 'columns' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="relative flex-1 min-w-[200px] max-w-sm">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={columnSearchQuery}
                                onChange={(e) => setColumnSearchQuery(e.target.value)}
                                placeholder={isEn ? 'Filter columns by name or type...' : 'جستجوی ستون بر اساس نام یا نوع...'}
                                className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none font-mono transition ${
                                  isLightMode
                                    ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                                    : 'bg-slate-900 border-slate-800 text-slate-200 focus:border-emerald-500/50'
                                }`}
                              />
                            </div>
                            <span className="text-xs text-slate-400 font-mono">
                              {struct.columns.filter((c) =>
                                !columnSearchQuery ||
                                c.name.toLowerCase().includes(columnSearchQuery.toLowerCase()) ||
                                c.dataType.toLowerCase().includes(columnSearchQuery.toLowerCase())
                              ).length}{' '}
                              {isEn ? 'columns shown' : 'ستون نمایش داده شده'}
                            </span>
                          </div>

                          <div
                            className={`rounded-xl border overflow-hidden ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
                            }`}
                          >
                            <div className="overflow-x-auto max-h-[500px]">
                              <table className="w-full text-left text-xs">
                                <thead
                                  className={`sticky top-0 text-[11px] uppercase tracking-wider font-semibold border-b ${
                                    isLightMode ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
                                  }`}
                                >
                                  <tr>
                                    <th className="py-2.5 px-3 w-10">#</th>
                                    <th className="py-2.5 px-3">{isEn ? 'Column Name' : 'نام ستون'}</th>
                                    <th className="py-2.5 px-3">{isEn ? 'Data Type' : 'نوع داده'}</th>
                                    <th className="py-2.5 px-3">{isEn ? 'Nullable' : 'قابلیت Null'}</th>
                                    <th className="py-2.5 px-3">{isEn ? 'Default Value' : 'مقدار پیش‌فرض'}</th>
                                    <th className="py-2.5 px-3">{isEn ? 'Constraints' : 'محدودیت‌ها'}</th>
                                    <th className="py-2.5 px-3">{isEn ? 'Attributes' : 'ویژگی‌ها'}</th>
                                    <th className="py-2.5 px-3">{isEn ? 'Description' : 'توضیحات'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40 font-mono text-xs">
                                  {struct.columns
                                    .filter((c) =>
                                      !columnSearchQuery ||
                                      c.name.toLowerCase().includes(columnSearchQuery.toLowerCase()) ||
                                      c.dataType.toLowerCase().includes(columnSearchQuery.toLowerCase())
                                    )
                                    .map((col) => (
                                      <tr
                                        key={col.attnum}
                                        className={`transition ${
                                          isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-900/60'
                                        } ${col.isPrimaryKey ? (isLightMode ? 'bg-blue-50/40' : 'bg-blue-950/20') : ''}`}
                                      >
                                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                                          {col.attnum}
                                        </td>
                                        <td className="py-2.5 px-3 font-bold text-slate-200">
                                          <div className="flex items-center gap-1.5">
                                            {col.isPrimaryKey && (
                                              <span title="Primary Key">
                                                <Key className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                              </span>
                                            )}
                                            {col.isForeignKey && (
                                              <span title="Foreign Key">
                                                <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                              </span>
                                            )}
                                            {col.isUnique && !col.isPrimaryKey && (
                                              <span title="Unique">
                                                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                              </span>
                                            )}
                                            <span className={col.isPrimaryKey ? 'text-blue-300 font-bold' : ''}>
                                              {col.name}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="py-2.5 px-3">
                                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                                            {col.formattedType}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3">
                                          {col.isNullable ? (
                                            <span className="text-slate-400 font-sans text-[11px]">NULL</span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                              NOT NULL
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px] max-w-xs truncate">
                                          {col.defaultValue ? (
                                            <code className="text-amber-300 bg-black/30 px-1 py-0.5 rounded">
                                              {col.defaultValue}
                                            </code>
                                          ) : (
                                            <span className="text-slate-600">—</span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3">
                                          <div className="flex items-center gap-1 flex-wrap font-sans text-[10px]">
                                            {col.isPrimaryKey && (
                                              <span className="px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                PK
                                              </span>
                                            )}
                                            {col.isForeignKey && (
                                              <span className="px-1.5 py-0.5 rounded font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                                FK
                                              </span>
                                            )}
                                            {col.isUnique && (
                                              <span className="px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                UNIQUE
                                              </span>
                                            )}
                                            {col.hasCheckConstraint && (
                                              <span className="px-1.5 py-0.5 rounded font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                                CHECK
                                              </span>
                                            )}
                                            {!col.isPrimaryKey && !col.isForeignKey && !col.isUnique && !col.hasCheckConstraint && (
                                              <span className="text-slate-600">—</span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2.5 px-3 text-[11px] text-slate-400">
                                          <div className="space-y-0.5">
                                            {col.isIdentity && (
                                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-sky-500/15 text-sky-400 border border-sky-500/30 mr-1">
                                                IDENTITY {col.identityGeneration ? `(${col.identityGeneration})` : ''}
                                              </span>
                                            )}
                                            {col.isGenerated && (
                                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/30 mr-1">
                                                GENERATED
                                              </span>
                                            )}
                                            {col.collation && (
                                              <span className="text-slate-500 text-[10px] font-mono">
                                                collate: {col.collation}
                                              </span>
                                            )}
                                            {!col.isIdentity && !col.isGenerated && !col.collation && (
                                              <span className="text-slate-600">—</span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-400 text-xs font-sans max-w-xs truncate">
                                          {col.comment || <span className="text-slate-600 italic">—</span>}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SUB-TAB 2: CONSTRAINTS */}
                      {tableSubTab === 'constraints' && (
                        <div className="space-y-4">
                          {/* 1. Primary Key */}
                          <div
                            className={`p-4 rounded-xl border space-y-2.5 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <h5 className="font-bold text-xs uppercase tracking-wider text-blue-400 flex items-center gap-1.5 font-sans">
                                <Key className="w-4 h-4" />
                                <span>{isEn ? 'Primary Key Constraint' : 'محدودیت کلید اصلی (Primary Key)'}</span>
                              </h5>
                              {struct.primaryKey && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(struct.primaryKey?.definition || '')}
                                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                                  title={isEn ? 'Copy PK Definition' : 'کپی تعریف کلید اصلی'}
                                >
                                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>

                            {struct.primaryKey ? (
                              <div className="space-y-2 font-mono text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400 font-sans">{isEn ? 'Name:' : 'نام:'}</span>
                                  <span className="font-bold text-slate-200">{struct.primaryKey.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400 font-sans">{isEn ? 'Columns:' : 'ستون‌ها:'}</span>
                                  <div className="flex items-center gap-1">
                                    {struct.primaryKey.columns.map((colName) => (
                                      <span
                                        key={colName}
                                        className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30"
                                      >
                                        {colName}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                {struct.primaryKey.definition && (
                                  <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 text-cyan-300 font-mono">
                                    <code>{struct.primaryKey.definition}</code>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 font-sans italic">
                                {isEn
                                  ? 'No Primary Key constraint is defined for this table.'
                                  : 'هیچ کلید اصلی برای این جدول تعریف نشده است.'}
                              </p>
                            )}
                          </div>

                          {/* 2. Foreign Keys */}
                          <div
                            className={`p-4 rounded-xl border space-y-3 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <h5 className="font-bold text-xs uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 font-sans">
                              <Link2 className="w-4 h-4" />
                              <span>
                                {isEn ? 'Foreign Key Constraints' : 'محدودیت‌های کلید خارجی (Foreign Keys)'} (
                                {struct.foreignKeys.length})
                              </span>
                            </h5>

                            {struct.foreignKeys.length > 0 ? (
                              <div className="space-y-2.5">
                                {struct.foreignKeys.map((fk) => (
                                  <div
                                    key={fk.name}
                                    className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 space-y-2 text-xs font-mono"
                                  >
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <span className="font-bold text-slate-200">{fk.name}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                                          ON UPDATE: <b className="text-indigo-400">{fk.onUpdate}</b>
                                        </span>
                                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                                          ON DELETE: <b className="text-indigo-400">{fk.onDelete}</b>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => copyToClipboard(fk.definition || '')}
                                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                                          title={isEn ? 'Copy FK Definition' : 'کپی تعریف'}
                                        >
                                          {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap text-slate-300">
                                      <span className="text-slate-400 font-sans">{isEn ? 'References:' : 'ارجاع:'}</span>
                                      <span className="text-blue-400 font-bold">({fk.columns.join(', ')})</span>
                                      <span className="text-slate-500 font-sans">➔</span>
                                      <span className="text-purple-400 font-bold">
                                        "{fk.foreignSchema}"."{fk.foreignTable}"
                                      </span>
                                      <span className="text-emerald-400 font-bold">({fk.foreignColumns.join(', ')})</span>
                                    </div>

                                    {fk.definition && (
                                      <div className="p-2 rounded bg-black/30 border border-slate-800/60 text-slate-400 text-[11px]">
                                        <code>{fk.definition}</code>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 font-sans italic">
                                {isEn
                                  ? 'No foreign key constraints defined on this table.'
                                  : 'هیچ کلید خارجی برای این جدول تعریف نشده است.'}
                              </p>
                            )}
                          </div>

                          {/* 3. Unique Constraints */}
                          <div
                            className={`p-4 rounded-xl border space-y-3 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <h5 className="font-bold text-xs uppercase tracking-wider text-amber-400 flex items-center gap-1.5 font-sans">
                              <Sparkles className="w-4 h-4" />
                              <span>
                                {isEn ? 'Unique Constraints' : 'محدودیت‌های یکتایی (Unique Constraints)'} (
                                {struct.uniqueConstraints.length})
                              </span>
                            </h5>

                            {struct.uniqueConstraints.length > 0 ? (
                              <div className="space-y-2">
                                {struct.uniqueConstraints.map((u) => (
                                  <div
                                    key={u.name}
                                    className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 flex items-center justify-between gap-3 text-xs font-mono"
                                  >
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-200">{u.name}</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-slate-400 font-sans">{isEn ? 'Columns:' : 'ستون‌ها:'}</span>
                                        <span className="text-amber-300 font-bold">({u.columns.join(', ')})</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(u.definition || '')}
                                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                                      title={isEn ? 'Copy' : 'کپی'}
                                    >
                                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 font-sans italic">
                                {isEn
                                  ? 'No unique constraints defined.'
                                  : 'هیچ محدودیت یکتایی برای این جدول ثبت نشده است.'}
                              </p>
                            )}
                          </div>

                          {/* 4. Check Constraints */}
                          <div
                            className={`p-4 rounded-xl border space-y-3 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <h5 className="font-bold text-xs uppercase tracking-wider text-purple-400 flex items-center gap-1.5 font-sans">
                              <ShieldCheck className="w-4 h-4" />
                              <span>
                                {isEn ? 'Check Constraints' : 'محدودیت‌های بررسی (Check Constraints)'} (
                                {struct.checkConstraints.length})
                              </span>
                            </h5>

                            {struct.checkConstraints.length > 0 ? (
                              <div className="space-y-2">
                                {struct.checkConstraints.map((chk) => (
                                  <div
                                    key={chk.name}
                                    className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 space-y-1.5 text-xs font-mono"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-slate-200">{chk.name}</span>
                                      {chk.isValidated && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                          VALIDATED
                                        </span>
                                      )}
                                    </div>
                                    <div className="p-2 rounded bg-black/40 border border-slate-800 text-purple-300">
                                      <code>CHECK ({chk.clause})</code>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 font-sans italic">
                                {isEn ? 'No check constraints defined.' : 'هیچ محدودیت بررسی (Check) برای این جدول ثبت نشده است.'}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* SUB-TAB 3: INDEXES */}
                      {tableSubTab === 'indexes' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-mono">
                              {struct.indexes.length} {isEn ? 'indexes found' : 'ایندکس یافت شد'}
                            </span>
                            <div className="flex items-center gap-2 text-xs font-mono">
                              <span className="text-slate-400 font-sans">{isEn ? 'Total Index Size:' : 'فضای کل ایندکس‌ها:'}</span>
                              <span className="font-bold text-blue-400">{struct.metadata.indexSizePretty}</span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {struct.indexes.map((idx) => (
                              <div
                                key={idx.name}
                                className={`p-4 rounded-xl border space-y-3 text-xs font-mono transition ${
                                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                                    <span className="font-bold text-sm text-slate-100">{idx.name}</span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                      {idx.accessMethod}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {idx.isPrimary && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                        PRIMARY KEY
                                      </span>
                                    )}
                                    {idx.isUnique && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                        UNIQUE
                                      </span>
                                    )}
                                    {idx.isValid && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        VALID
                                      </span>
                                    )}
                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                                      {idx.sizePretty}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-500 font-sans block">
                                      {isEn ? 'Indexed Columns' : 'ستون‌های ایندکس‌شده'}
                                    </span>
                                    <p className="font-bold text-slate-200">
                                      {idx.columns.length > 0 ? idx.columns.join(', ') : '(expression)'}
                                    </p>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-500 font-sans block">
                                      {isEn ? 'Scans Count' : 'تعداد اسکن‌ها (Scans)'}
                                    </span>
                                    <p className="font-bold text-cyan-400 tabular-nums">
                                      {idx.scansCount.toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-500 font-sans block">
                                      {isEn ? 'Tuples Read / Fetched' : 'سطرهای خوانده‌شده / واکشی‌شده'}
                                    </span>
                                    <p className="font-bold text-emerald-400 tabular-nums">
                                      {idx.tuplesRead.toLocaleString()} / {idx.tuplesFetched.toLocaleString()}
                                    </p>
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                                  <code className="text-cyan-300 text-[11px] truncate">{idx.definition}</code>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(idx.definition)}
                                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
                                    title={isEn ? 'Copy DDL' : 'کپی دستور ساخت ایندکس'}
                                  >
                                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* SUB-TAB 4: STORAGE & STATISTICS */}
                      {tableSubTab === 'storage' && (
                        <div className="space-y-4">
                          {/* Physical Storage Breakdown */}
                          <div
                            className={`p-4 rounded-xl border space-y-3 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <h5 className="font-bold text-xs uppercase tracking-wider text-purple-400 flex items-center gap-1.5 font-sans">
                              <HardDrive className="w-4 h-4" />
                              <span>{isEn ? 'Physical Disk Storage Metrics' : 'فضای دیسک فیزیکی و تفکیک ابعاد'}</span>
                            </h5>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                              <div className="space-y-1 p-2.5 rounded-lg bg-black/20 border border-slate-800">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Table Heap Data' : 'داده‌های اصلی (Heap)'}
                                </span>
                                <p className="font-bold text-sm text-slate-200">{struct.metadata.tableSizePretty}</p>
                              </div>
                              <div className="space-y-1 p-2.5 rounded-lg bg-black/20 border border-slate-800">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Indexes Total' : 'فضای ایندکس‌ها'}
                                </span>
                                <p className="font-bold text-sm text-blue-400">{struct.metadata.indexSizePretty}</p>
                              </div>
                              <div className="space-y-1 p-2.5 rounded-lg bg-black/20 border border-slate-800">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'TOAST Storage' : 'فضای TOAST'}
                                </span>
                                <p className="font-bold text-sm text-amber-400">{struct.metadata.toastSizePretty}</p>
                              </div>
                              <div className="space-y-1 p-2.5 rounded-lg bg-black/20 border border-slate-800">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Total Relation Size' : 'فضای کل جدول'}
                                </span>
                                <p className="font-bold text-sm text-purple-400">{struct.metadata.totalSizePretty}</p>
                              </div>
                            </div>
                          </div>

                          {/* Scan and Tuple Activity */}
                          <div
                            className={`p-4 rounded-xl border space-y-3 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 font-sans">
                              <BarChart3 className="w-4 h-4" />
                              <span>{isEn ? 'Scan Patterns & Table Activity' : 'آمار اسکن و عملیات سطرها'}</span>
                            </h5>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Sequential Scans' : 'اسکن‌های ترتیبی (Seq Scans)'}
                                </span>
                                <p className="font-bold text-amber-400 tabular-nums">
                                  {struct.metadata.seqScans.toLocaleString()}
                                </p>
                                <span className="text-[10px] text-slate-500">
                                  {struct.metadata.seqTuplesRead.toLocaleString()} {isEn ? 'rows read' : 'سطر خوانده‌شده'}
                                </span>
                              </div>

                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Index Scans' : 'اسکن‌های ایندکس (Idx Scans)'}
                                </span>
                                <p className="font-bold text-emerald-400 tabular-nums">
                                  {struct.metadata.idxScans.toLocaleString()}
                                </p>
                                <span className="text-[10px] text-slate-500">
                                  {struct.metadata.idxTuplesFetched.toLocaleString()} {isEn ? 'rows fetched' : 'سطر واکشی‌شده'}
                                </span>
                              </div>

                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Live Tuples' : 'سطرهای زنده (Live)'}
                                </span>
                                <p className="font-bold text-cyan-400 tabular-nums">
                                  {struct.metadata.nLiveTuples.toLocaleString()}
                                </p>
                              </div>

                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Dead Tuples (Bloat)' : 'سطرهای مرده (نیاز به Vacuum)'}
                                </span>
                                <p
                                  className={`font-bold tabular-nums ${
                                    struct.metadata.nDeadTuples > 1000 ? 'text-rose-400' : 'text-slate-300'
                                  }`}
                                >
                                  {struct.metadata.nDeadTuples.toLocaleString()}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono pt-2 border-t border-slate-800/60">
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Tuples Inserted' : 'سطرهای درج‌شده'}
                                </span>
                                <p className="font-bold text-slate-200 tabular-nums">
                                  {struct.metadata.nTuplesIns.toLocaleString()}
                                </p>
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Tuples Updated' : 'سطرهای به‌روزرسانی‌شده'}
                                </span>
                                <p className="font-bold text-slate-200 tabular-nums">
                                  {struct.metadata.nTuplesUpd.toLocaleString()}
                                </p>
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Tuples Deleted' : 'سطرهای حذف‌شده'}
                                </span>
                                <p className="font-bold text-slate-200 tabular-nums">
                                  {struct.metadata.nTuplesDel.toLocaleString()}
                                </p>
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'HOT Updates' : 'به‌روزرسانی سریع (HOT)'}
                                </span>
                                <p className="font-bold text-emerald-400 tabular-nums">
                                  {struct.metadata.nTuplesHotUpd.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Table Maintenance & Optimization Shortcut (Phase 18) */}
                          <div
                            className={`p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3 ${
                              isLightMode ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-900/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                <Zap className="w-5 h-5" />
                              </div>
                              <div>
                                <h5 className="font-bold text-xs text-amber-300">
                                  {isEn ? 'Table Maintenance & Bloat Space Reclaim' : 'نگهداری و پاکسازی فضای مرده جدول'}
                                </h5>
                                <p className="text-[11px] text-slate-400">
                                  {isEn
                                    ? 'Reclaim dead tuple space, update query optimizer distribution statistics, or rebuild indexes.'
                                    : 'پاکسازی سطرهای مرده، به‌روزرسانی آمار توزیع داده‌ها یا بازسازی ایندکس‌های این جدول.'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 font-sans">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenMaintenance?.({
                                    database: selectedNode.dbName,
                                    schema: selectedNode.schemaName,
                                    table: selectedNode.name,
                                    action: 'vacuum',
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Zap className="w-3.5 h-3.5" />
                                <span>VACUUM</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenMaintenance?.({
                                    database: selectedNode.dbName,
                                    schema: selectedNode.schemaName,
                                    table: selectedNode.name,
                                    action: 'analyze',
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>ANALYZE</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenMaintenance?.({
                                    database: selectedNode.dbName,
                                    schema: selectedNode.schemaName,
                                    table: selectedNode.name,
                                    action: 'reindex',
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>REINDEX</span>
                              </button>
                            </div>
                          </div>

                          {/* Maintenance History */}
                          <div
                            className={`p-4 rounded-xl border space-y-3 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <h5 className="font-bold text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-sans">
                              <Clock className="w-4 h-4" />
                              <span>{isEn ? 'Vacuum & Analyze Maintenance History' : 'تاریخچه تعمیر و نگهداری (Vacuum / Analyze)'}</span>
                            </h5>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Last Vacuum (Manual)' : 'آخرین Vacuum دستی'}
                                </span>
                                <p className="font-bold text-slate-300">
                                  {struct.metadata.lastVacuum || <span className="text-slate-600 font-sans italic">never</span>}
                                </p>
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Last Autovacuum' : 'آخرین Autovacuum'}
                                </span>
                                <p className="font-bold text-emerald-400">
                                  {struct.metadata.lastAutoVacuum || <span className="text-slate-600 font-sans italic">never</span>}
                                </p>
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Last Analyze (Manual)' : 'آخرین Analyze دستی'}
                                </span>
                                <p className="font-bold text-slate-300">
                                  {struct.metadata.lastAnalyze || <span className="text-slate-600 font-sans italic">never</span>}
                                </p>
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-sans block">
                                  {isEn ? 'Last Autoanalyze' : 'آخرین Autoanalyze'}
                                </span>
                                <p className="font-bold text-emerald-400">
                                  {struct.metadata.lastAutoAnalyze || <span className="text-slate-600 font-sans italic">never</span>}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SUB-TAB 5: QUICK SQL */}
                      {tableSubTab === 'sql' && (
                        <div className="space-y-3 font-mono text-xs">
                          {/* Workspace Action Shortcut */}
                          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 font-sans">
                            <div className="flex items-center gap-2">
                              <Code className="w-4 h-4 text-cyan-400 shrink-0" />
                              <span className="text-xs font-semibold text-slate-200">
                                {isEn
                                  ? 'Open queries in SQL Query Workspace for execution & syntax highlighting'
                                  : 'باز کردن این کوئری‌ها در ادیتور پیشرفته SQL برای اجرا و ویرایش'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenSqlEditor?.(
                                  `SELECT * FROM "${selectedNode.schemaName}"."${selectedNode.name}" LIMIT 50;`,
                                  selectedNode.dbName,
                                  selectedNode.schemaName
                                )
                              }
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs shrink-0 cursor-pointer"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Open in SQL Editor' : 'اجرا در ادیتور SQL'}</span>
                            </button>
                          </div>

                          {/* Query 1: SELECT 50 */}
                          <div
                            className={`p-3.5 rounded-xl border space-y-1.5 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <span className="text-[11px] text-slate-400 font-sans font-semibold">
                              {isEn ? 'Select Sample Rows (50)' : 'انتخاب نمونه سطرها (۵۰ سطر)'}
                            </span>
                            <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                              <code className="text-cyan-300">
                                SELECT * FROM "{selectedNode.schemaName}"."{selectedNode.name}" LIMIT 50;
                              </code>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(`SELECT * FROM "${selectedNode.schemaName}"."${selectedNode.name}" LIMIT 50;`)
                                }
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                                title={isEn ? 'Copy' : 'کپی'}
                              >
                                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {/* Query 2: SELECT COUNT */}
                          <div
                            className={`p-3.5 rounded-xl border space-y-1.5 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <span className="text-[11px] text-slate-400 font-sans font-semibold">
                              {isEn ? 'Exact Row Count' : 'شمارش دقیق تعداد کل سطرها'}
                            </span>
                            <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                              <code className="text-cyan-300">
                                SELECT count(*) AS total_rows FROM "{selectedNode.schemaName}"."{selectedNode.name}";
                              </code>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(
                                    `SELECT count(*) AS total_rows FROM "${selectedNode.schemaName}"."${selectedNode.name}";`
                                  )
                                }
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                                title={isEn ? 'Copy' : 'کپی'}
                              >
                                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {/* Query 3: Column list */}
                          <div
                            className={`p-3.5 rounded-xl border space-y-1.5 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <span className="text-[11px] text-slate-400 font-sans font-semibold">
                              {isEn ? 'Select All Explicit Columns' : 'انتخاب با ذکر صریح تمام ستون‌ها'}
                            </span>
                            <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                              <code className="text-cyan-300 truncate">
                                SELECT {struct.columns.map((c) => `"${c.name}"`).join(', ')} FROM "{selectedNode.schemaName}".
                                "{selectedNode.name}" LIMIT 50;
                              </code>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(
                                    `SELECT ${struct.columns.map((c) => `"${c.name}"`).join(', ')} FROM "${
                                      selectedNode.schemaName
                                    }"."${selectedNode.name}" LIMIT 50;`
                                  )
                                }
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
                                title={isEn ? 'Copy' : 'کپی'}
                              >
                                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ======================================================== */}
            {/* VIEW F: SINGLE TYPE / ENUM OBJECT INSPECTOR              */}
            {/* ======================================================== */}
            {selectedNode.type === 'type' && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-pink-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-md text-xs font-mono font-bold uppercase bg-pink-500/15 text-pink-400 border border-pink-500/30">
                    {selectedNode.data.kind}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Type Category' : 'دسته‌بندی'}</span>
                    <p className="font-bold text-sm text-pink-400 uppercase">{selectedNode.data.kind}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Owner' : 'مالک'}</span>
                    <p className="font-bold text-sm text-cyan-400">{selectedNode.data.owner}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Base Type' : 'نوع پایه'}</span>
                    <p className="font-bold text-sm text-slate-200">{selectedNode.data.baseType || 'N/A'}</p>
                  </div>
                </div>

                {/* Enum Labels section if kind === 'enum' */}
                {selectedNode.data.enumLabels && selectedNode.data.enumLabels.length > 0 && (
                  <div
                    className={`p-4 rounded-xl border space-y-3 ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-sans">
                      <Tag className="w-3.5 h-3.5 text-pink-400" />
                      <span>{isEn ? 'Enum Labels / Permitted Values' : 'مقادیر مجاز شمارشی (Enum Labels)'}</span>
                    </h5>

                    <div className="flex items-center gap-2 flex-wrap font-mono">
                      {selectedNode.data.enumLabels.map((lbl: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-300 text-xs font-bold"
                        >
                          '{lbl}'
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick SQL usage snippet */}
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'SQL Usage Example' : 'نمونه استفاده در SQL'}
                  </span>
                  <div className="p-2 rounded bg-black/40 text-cyan-300 select-all">
                    SELECT '
                    {selectedNode.data.enumLabels?.[0] || 'value'}'::{selectedNode.schemaName}.{selectedNode.name};
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW G: SINGLE ROUTINE (FUNCTION / PROCEDURE) INSPECTOR  */}
            {/* ======================================================== */}
            {(selectedNode.type === 'function' || selectedNode.type === 'procedure') && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {selectedNode.type === 'procedure' ? (
                      <Wrench className="w-5 h-5 text-indigo-400" />
                    ) : (
                      <Code className="w-5 h-5 text-violet-400" />
                    )}
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-md text-xs font-mono font-bold uppercase bg-violet-500/15 text-violet-400 border border-violet-500/30">
                    {selectedNode.data.type || selectedNode.type}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Return Type' : 'نوع خروجی'}</span>
                    <p className="font-bold text-sm text-cyan-400 truncate">{selectedNode.data.returnType}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Language' : 'زبان'}</span>
                    <p className="font-bold text-sm text-violet-400 uppercase">{selectedNode.data.language}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Volatility' : 'فراریت'}</span>
                    <p className="font-bold text-sm text-amber-400">{selectedNode.data.volatility || 'VOLATILE'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Security' : 'امنیت اجرا'}</span>
                    <p className="font-bold text-sm text-emerald-400">
                      {selectedNode.data.isSecurityDefiner ? 'DEFINER' : 'INVOKER'}
                    </p>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'Argument Signature' : 'امضای ورودی'}
                  </span>
                  <p className="text-cyan-300">
                    {selectedNode.data.argumentTypes || <span className="text-slate-500 italic">No arguments</span>}
                  </p>
                </div>

                {/* Routine Source Code if available */}
                {selectedNode.data.sourceCode && (
                  <div
                    className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-sans font-semibold">
                        {isEn ? 'Routine Body / Source Code' : 'بدنه و سورس‌کد تابع در سرور'}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedNode.data.sourceCode)}
                        className="px-2 py-0.5 rounded text-[11px] font-sans flex items-center gap-1 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                      >
                        {copiedText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedText ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Source' : 'کپی کد')}</span>
                      </button>
                    </div>

                    <pre className="p-3 rounded-lg bg-black/60 border border-slate-800/80 text-cyan-200 overflow-x-auto text-[11px] leading-relaxed max-h-60 select-all font-mono">
                      {selectedNode.data.sourceCode}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW H: SINGLE VIEW / MATVIEW INSPECTOR                  */}
            {/* ======================================================== */}
            {(selectedNode.type === 'view' || selectedNode.type === 'matview') && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {selectedNode.data.isMaterialized ? (
                      <Zap className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Eye className="w-5 h-5 text-sky-400" />
                    )}
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-1 rounded-md text-xs font-mono font-bold uppercase ${
                      selectedNode.data.isMaterialized
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    }`}
                  >
                    {selectedNode.data.isMaterialized ? 'Materialized View' : 'Standard View'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Disk Size' : 'فضای دیسک'}</span>
                    <p className="font-bold text-sm text-emerald-400">{selectedNode.data.sizePretty || '0 bytes'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Columns' : 'ستون‌ها'}</span>
                    <p className="font-bold text-sm text-cyan-400">
                      {selectedNode.data.columnCount !== undefined ? selectedNode.data.columnCount : 'N/A'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Owner' : 'مالک'}</span>
                    <p className="font-bold text-sm text-slate-200 truncate">{selectedNode.data.owner}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Type' : 'نوع'}</span>
                    <p className="font-bold text-sm text-purple-400">
                      {selectedNode.data.isMaterialized ? 'Materialized' : 'Standard'}
                    </p>
                  </div>
                </div>

                {/* View SQL Definition */}
                {selectedNode.data.definition && (
                  <div
                    className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-sans font-semibold">
                        {isEn ? 'View SQL Query Definition' : 'تعریف کوئری SQL نما'}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedNode.data.definition)}
                        className="px-2 py-0.5 rounded text-[11px] font-sans flex items-center gap-1 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                      >
                        {copiedText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedText ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Query' : 'کپی کوئری')}</span>
                      </button>
                    </div>

                    <pre className="p-3 rounded-lg bg-black/60 border border-slate-800/80 text-cyan-200 overflow-x-auto text-[11px] leading-relaxed max-h-60 select-all font-mono">
                      {selectedNode.data.definition}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW H2: SINGLE SEQUENCE INSPECTOR                       */}
            {/* ======================================================== */}
            {selectedNode.type === 'sequence' && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Hash className="w-5 h-5 text-rose-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Schema: ' : 'اسکیما: '}
                        <span className="font-mono text-cyan-400">{selectedNode.schemaName}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-1 rounded-md text-xs font-mono font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                      {selectedNode.data.dataType || 'BIGINT'}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-mono font-bold uppercase border ${
                        selectedNode.data.isCycled
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {selectedNode.data.isCycled ? 'CYCLED' : 'NO CYCLE'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Start Value' : 'مقدار شروع'}</span>
                    <p className="font-bold text-sm text-cyan-400">{selectedNode.data.startValue ?? '1'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Last Value' : 'آخرین مقدار'}</span>
                    <p className="font-bold text-sm text-emerald-400">{selectedNode.data.lastValue ?? 'N/A'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Increment' : 'گام افزایش'}</span>
                    <p className="font-bold text-sm text-purple-400">{selectedNode.data.increment ?? '1'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Cache Size' : 'اندازه کش'}</span>
                    <p className="font-bold text-sm text-amber-400">{selectedNode.data.cacheSize ?? '1'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Minimum Value' : 'حداقل مقدار'}</span>
                    <p className="font-bold text-sm text-slate-200 truncate">{selectedNode.data.minValue ?? '1'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Maximum Value' : 'حداکثر مقدار'}</span>
                    <p className="font-bold text-sm text-slate-200 truncate">
                      {selectedNode.data.maxValue ?? '9223372036854775807'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Owner' : 'مالک'}</span>
                    <p className="font-bold text-sm text-cyan-400 truncate">{selectedNode.data.owner}</p>
                  </div>
                </div>

                {/* SQL Snippets */}
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'SQL Sequence Operations' : 'دستورات کاربردی دنباله در SQL'}
                  </span>
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                      <code className="text-cyan-300">
                        SELECT nextval('{selectedNode.schemaName}.{selectedNode.name}');
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`SELECT nextval('${selectedNode.schemaName}.${selectedNode.name}');`)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      >
                        {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                      <code className="text-cyan-300">
                        ALTER SEQUENCE {selectedNode.schemaName}.{selectedNode.name} RESTART WITH {selectedNode.data.startValue || 1};
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`ALTER SEQUENCE ${selectedNode.schemaName}.${selectedNode.name} RESTART WITH ${selectedNode.data.startValue || 1};`)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      >
                        {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW H3: EXTENSIONS CATALOG & SINGLE EXTENSION           */}
            {/* ======================================================== */}
            {selectedNode.type === 'extensions_folder' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Puzzle className="w-5 h-5 text-amber-400" />
                    <h4 className="font-bold text-sm">
                      {isEn ? 'Installed PostgreSQL Extensions (pg_extension)' : 'کاتالوگ افزونه‌های نصب‌شده PostgreSQL'}
                    </h4>
                  </div>
                  <FieldInfoTooltip
                    title={isEn ? 'PostgreSQL Extensions' : 'افزونه‌های دیتابیس'}
                    whatIsIt={
                      isEn
                        ? 'Modules and plugins installed in this database providing specialized functions or types.'
                        : 'ماژول‌ها و اکستنشن‌های فعال در این پایگاه داده جهت افزودن قابلیت‌های پیشرفته.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Useful for tracking PostGIS, pg_stat_statements, uuid-ossp, pgcrypto, etc.'
                        : 'جهت رصد اکستنشن‌های کلیدی مانند uuid-ossp، pgcrypto و ماژول‌های آماری.'
                    }
                    example="pg_stat_statements, uuid-ossp, plpgsql"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <table className="w-full text-xs text-left">
                    <thead
                      className={`border-b text-[11px] font-semibold select-none ${
                        isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-3">{isEn ? 'Extension Name' : 'نام افزونه'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Version' : 'نسخه'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Schema' : 'اسکیما'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Relocatable' : 'قابل جابجایی'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Description' : 'توضیحات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {(((selectedNode.data as PostgresSchemaExtensionItem[]) || [])
                        .filter(
                          (ext) =>
                            !detailFilter ||
                            ext.name.toLowerCase().includes(detailFilter.toLowerCase()) ||
                            ext.description?.toLowerCase().includes(detailFilter.toLowerCase())
                        )
                      ).map((ext) => (
                        <tr
                          key={ext.name}
                          onClick={() => {
                            setSelectedNode({
                              type: 'extension',
                              id: `ext:${selectedNode.dbName}:${ext.name}`,
                              name: ext.name,
                              dbName: selectedNode.dbName,
                              data: ext,
                            });
                          }}
                          className={`cursor-pointer transition ${
                            isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 px-3 flex items-center gap-2 font-bold text-slate-200">
                            <Puzzle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{ext.name}</span>
                          </td>
                          <td className="py-2 px-3 text-cyan-400">{ext.version}</td>
                          <td className="py-2 px-3 text-slate-400">{ext.schema}</td>
                          <td className="py-2 px-3 text-slate-300 font-sans text-[11px]">{ext.relocatable ? 'YES' : 'NO'}</td>
                          <td className="py-2 px-3 text-slate-400 font-sans text-[11px] truncate max-w-sm">
                            {ext.description || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedNode.type === 'extension' && selectedNode.data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Puzzle className="w-5 h-5 text-amber-400" />
                    <div>
                      <h4 className="font-bold text-base text-slate-100 font-mono">{selectedNode.name}</h4>
                      <p className="text-xs text-slate-400">
                        {isEn ? 'Database: ' : 'دیتابیس: '}
                        <span className="font-mono text-cyan-400">{selectedNode.dbName}</span>
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-md text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    v{selectedNode.data.version}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Installed Schema' : 'اسکیمای نصب'}</span>
                    <p className="font-bold text-sm text-cyan-400">{selectedNode.data.schema}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Relocatable' : 'قابلیت انتقال'}</span>
                    <p className="font-bold text-sm text-emerald-400">{selectedNode.data.relocatable ? 'YES' : 'NO'}</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border space-y-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-sans">{isEn ? 'Extension Status' : 'وضعیت'}</span>
                    <p className="font-bold text-sm text-purple-400">INSTALLED</p>
                  </div>
                </div>

                {selectedNode.data.description && (
                  <div
                    className={`p-4 rounded-xl border space-y-1.5 text-xs font-sans ${
                      isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="text-[11px] text-slate-400 font-semibold">
                      {isEn ? 'Extension Description' : 'توضیحات و کاربرد افزونه'}
                    </span>
                    <p>{selectedNode.data.description}</p>
                  </div>
                )}

                {/* SQL Example */}
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs font-mono ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] text-slate-400 font-sans font-semibold">
                    {isEn ? 'SQL Installation / Upgrade Syntax' : 'دستور ایجاد یا ارتقا در SQL'}
                  </span>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between gap-2">
                    <code className="text-cyan-300">CREATE EXTENSION IF NOT EXISTS "{selectedNode.name}";</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`CREATE EXTENSION IF NOT EXISTS "${selectedNode.name}";`)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                    >
                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW I: ROLES & USERS                                    */}
            {/* ======================================================== */}
            {(selectedNode.type === 'roles_folder' || selectedNode.type === 'role') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-bold text-sm">
                      {isEn ? 'PostgreSQL Roles & Authentication Catalog' : 'کاتالوگ نقش‌ها و کاربران PostgreSQL'}
                    </h4>
                  </div>
                  <FieldInfoTooltip
                    title={isEn ? 'PostgreSQL Roles (pg_roles)' : 'نقش‌ها و سطح اختیارات کاربران'}
                    whatIsIt={
                      isEn
                        ? 'All login users and group roles configured on the PostgreSQL cluster.'
                        : 'فهرست تمامی کاربران با قابلیت لاگین و رول‌های سیستمی کلاستر.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Essential for verifying superuser privileges, connection limits, and access security.'
                        : 'حیاتی جهت پایش امنیت، محدودیت تعداد اتصالات و شناسایی کاربران دارای دسترسی Superuser.'
                    }
                    example="postgres (superuser), app_user (login, connection limit 50)"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <table className="w-full text-xs text-left">
                    <thead
                      className={`border-b text-[11px] font-semibold select-none ${
                        isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-3">{isEn ? 'Role Name' : 'نام نقش'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Superuser' : 'سوپریوزر'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Login' : 'امکان ورود'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Create DB' : 'ایجاد دیتابیس'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Replication' : 'رپلیکیشن'}</th>
                        <th className="py-2.5 px-3">{isEn ? 'Conn Limit' : 'سقف اتصال'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {rolesList.map((role) => (
                        <tr
                          key={role.rolname}
                          className={
                            selectedNode.id === `role:${role.rolname}`
                              ? 'bg-blue-600/10 font-bold'
                              : isLightMode
                              ? 'hover:bg-slate-50'
                              : 'hover:bg-slate-800/40'
                          }
                        >
                          <td className="py-2 px-3 flex items-center gap-2 text-slate-200">
                            {role.isSuperuser ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                            <span>{role.rolname}</span>
                          </td>
                          <td className="py-2 px-3">
                            {role.isSuperuser ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 font-bold font-sans">
                                YES
                              </span>
                            ) : (
                              <span className="text-slate-500 font-sans">NO</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {role.canLogin ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 font-bold font-sans">
                                YES
                              </span>
                            ) : (
                              <span className="text-slate-500 font-sans">NO</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400 font-sans">{role.createDb ? 'YES' : 'NO'}</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">{role.replication ? 'YES' : 'NO'}</td>
                          <td className="py-2 px-3 text-cyan-400">
                            {role.connectionLimit === -1 ? 'Unlimited' : role.connectionLimit}
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

      {/* Universal Phase 7: Table Row Edit / Insert / Delete / Clone Modal */}
      <PostgresTableRowEditModal
        isOpen={isInsertRowModalOpen || !!cloningRowForModal || !!editingRowForModal || !!deletingRowForModal}
        onClose={() => {
          setIsInsertRowModalOpen(false);
          setCloningRowForModal(null);
          setEditingRowForModal(null);
          setDeletingRowForModal(null);
          setTargetTableForEditModal(null);
        }}
        mode={isInsertRowModalOpen || !!cloningRowForModal ? 'insert' : editingRowForModal ? 'edit' : 'delete'}
        databaseName={targetTableForEditModal?.dbName || selectedNode.dbName || ''}
        schemaName={targetTableForEditModal?.schemaName || selectedNode.schemaName || ''}
        tableName={targetTableForEditModal?.tableName || selectedNode.name || ''}
        columns={activeColumns}
        initialRow={cloningRowForModal || editingRowForModal || deletingRowForModal}
        onSubmitInsert={handleInsertRowSubmit}
        onSubmitUpdate={handleUpdateRowSubmit}
        onSubmitDelete={handleDeleteRowSubmit}
        isEn={isEn}
        isLightMode={isLightMode}
      />
    </div>
  );
};
