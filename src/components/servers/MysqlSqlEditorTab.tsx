import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  Plus,
  X,
  Clock,
  Database,
  Layers,
  Sparkles,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  History,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Sliders,
  Terminal,
  Activity,
  Trash2,
  Code,
  Tag,
  Shield,
  HelpCircle,
  Flame,
  ShieldCheck,
  ShieldAlert,
  Lock,
  RefreshCw,
  Table as TableIcon,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlDatabaseItem,
  MysqlQueryResult,
  MysqlQueryTab,
  MysqlQueryHistoryItem,
} from '../../types';
import { executeRemoteServerMysqlQuery } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlSqlEditorTabProps {
  server: RemoteServer;
  databases: MysqlDatabaseItem[];
  defaultDatabase?: string;
  initialQuery?: string;
  isLightMode: boolean;
  isEn: boolean;
}

const MYSQL_SQL_TEMPLATES = [
  {
    name: 'Show Databases',
    nameFa: 'نمایش لیست پایگاه‌های داده',
    sql: 'SHOW DATABASES;',
  },
  {
    name: 'Select 50 Rows',
    nameFa: 'نمایش ۵۰ سطر نمونه',
    sql: 'SELECT * FROM information_schema.tables WHERE table_schema NOT IN (\'information_schema\', \'mysql\', \'performance_schema\', \'sys\') LIMIT 50;',
  },
  {
    name: 'Database Storage Sizes',
    nameFa: 'حجم پایگاه‌های داده',
    sql: `SELECT 
  table_schema AS db_name, 
  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS total_size_mb,
  ROUND(SUM(data_length) / 1024 / 1024, 2) AS data_size_mb,
  ROUND(SUM(index_length) / 1024 / 1024, 2) AS index_size_mb,
  COUNT(table_name) AS total_tables
FROM information_schema.tables 
GROUP BY table_schema 
ORDER BY total_size_mb DESC;`,
  },
  {
    name: 'Top 20 Largest Tables',
    nameFa: '۲۰ جدول بزرگ دیتابیس',
    sql: `SELECT 
  table_schema, 
  table_name, 
  ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_mb,
  ROUND(data_length / 1024 / 1024, 2) AS data_mb,
  ROUND(index_length / 1024 / 1024, 2) AS index_mb,
  table_rows,
  engine
FROM information_schema.tables 
WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY (data_length + index_length) DESC 
LIMIT 20;`,
  },
  {
    name: 'Active Running Threads',
    nameFa: 'رشته‌ها و کانکشن‌های فعال',
    sql: `SELECT 
  id, 
  user, 
  host, 
  db, 
  command, 
  time, 
  state, 
  info AS current_query 
FROM information_schema.processlist 
WHERE command != 'Sleep' 
ORDER BY time DESC;`,
  },
  {
    name: 'Server Version & Status',
    nameFa: 'نسخه، هاست‌نیم و وضعیت سرور',
    sql: `SELECT 
  VERSION() AS mysql_version, 
  CURRENT_TIMESTAMP AS current_server_time, 
  @@hostname AS hostname, 
  @@port AS port,
  @@datadir AS data_directory;`,
  },
  {
    name: 'Buffer Pool & Cache Stats',
    nameFa: 'وضعیت کش بافر پول InnoDB',
    sql: `SHOW STATUS LIKE 'Innodb_buffer_pool_%';`,
  },
  {
    name: 'Current User Grants',
    nameFa: 'دسترسی‌های کاربر متصل',
    sql: `SHOW GRANTS FOR CURRENT_USER();`,
  },
];

export const MysqlSqlEditorTab: React.FC<MysqlSqlEditorTabProps> = ({
  server,
  databases,
  defaultDatabase,
  initialQuery,
  isLightMode,
  isEn,
}) => {
  // Query tabs management
  const [tabs, setTabs] = useState<MysqlQueryTab[]>(() => {
    const initialDb = defaultDatabase || (databases.length > 0 ? databases[0].name : undefined);
    return [
      {
        id: 'tab-1',
        title: isEn ? 'Query 1' : 'کوئری ۱',
        query: initialQuery || 'SHOW DATABASES;',
        database: initialDb,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
  });

  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [editingTabTitleId, setEditingTabTitleId] = useState<string | null>(null);
  const [tempTabTitle, setTempTabTitle] = useState('');

  // Active tab reference
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || tabs[0];
  }, [tabs, activeTabId]);

  // Editor references
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [queryHistory, setQueryHistory] = useState<MysqlQueryHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(`mysql_query_history_${server.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Query Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryResult, setQueryResult] = useState<MysqlQueryResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Destructive Query Confirmation
  const [showDestructiveWarning, setShowDestructiveWarning] = useState(false);
  const [pendingQueryToExecute, setPendingQueryToExecute] = useState<string | null>(null);

  // Results display state
  const [resultsSearchQuery, setResultsSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState(50);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);
  const [inspectedRow, setInspectedRow] = useState<Record<string, any> | null>(null);
  const [inspectedRowFieldSearch, setInspectedRowFieldSearch] = useState('');

  // Save query history to localStorage
  const saveToHistory = useCallback(
    (item: Omit<MysqlQueryHistoryItem, 'id' | 'timestamp'>) => {
      const newItem: MysqlQueryHistoryItem = {
        ...item,
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: Date.now(),
      };
      setQueryHistory((prev) => {
        const updated = [newItem, ...prev.slice(0, 99)];
        try {
          localStorage.setItem(`mysql_query_history_${server.id}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    [server.id]
  );

  // Clear query history
  const handleClearHistory = () => {
    setQueryHistory([]);
    try {
      localStorage.removeItem(`mysql_query_history_${server.id}`);
    } catch {}
  };

  // Add new query tab
  const handleAddTab = () => {
    const nextNumber = tabs.length + 1;
    const initialDb = activeTab?.database || defaultDatabase || (databases.length > 0 ? databases[0].name : undefined);
    const newTab: MysqlQueryTab = {
      id: `tab-${Date.now()}`,
      title: isEn ? `Query ${nextNumber}` : `کوئری ${nextNumber}`,
      query: 'SELECT * FROM information_schema.tables LIMIT 25;',
      database: initialDb,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // Close tab
  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // Keep at least one tab
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[nextTabs.length - 1].id);
    }
  };

  // Update active tab query
  const handleQueryChange = (val: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, query: val, updatedAt: Date.now() } : t))
    );
  };

  // Update active tab database
  const handleDatabaseChange = (dbName: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, database: dbName, updatedAt: Date.now() } : t))
    );
  };

  // Rename tab
  const handleStartRenameTab = (tab: MysqlQueryTab, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabTitleId(tab.id);
    setTempTabTitle(tab.title);
  };

  const handleFinishRenameTab = () => {
    if (editingTabTitleId && tempTabTitle.trim()) {
      setTabs((prev) =>
        prev.map((t) => (t.id === editingTabTitleId ? { ...t, title: tempTabTitle.trim() } : t))
      );
    }
    setEditingTabTitleId(null);
  };

  // Check destructive queries in MySQL
  const isDestructiveSql = (query: string): boolean => {
    const upper = query.toUpperCase();
    if (upper.includes('DROP DATABASE') || upper.includes('DROP TABLE') || upper.includes('TRUNCATE TABLE')) {
      return true;
    }
    // Check DELETE or UPDATE without WHERE
    if (/DELETE\s+FROM\s+[`\w.]+\s*;/i.test(query) || (upper.includes('DELETE FROM') && !upper.includes('WHERE'))) {
      return true;
    }
    if (/UPDATE\s+[`\w.]+\s+SET\s+[^;]+;/i.test(query) && !upper.includes('WHERE')) {
      return true;
    }
    return false;
  };

  // Execute SQL Query
  const executeQuery = async (queryText: string, bypassDestructiveCheck = false) => {
    const trimmed = queryText.trim();
    if (!trimmed) return;

    if (!bypassDestructiveCheck && isDestructiveSql(trimmed)) {
      setPendingQueryToExecute(trimmed);
      setShowDestructiveWarning(true);
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setQueryResult(null);
    setResultsPage(1);

    const startTime = Date.now();
    try {
      const res = await executeRemoteServerMysqlQuery(
        server.id,
        trimmed,
        activeTab?.database
      );

      const durationMs = res.durationMs ?? (Date.now() - startTime);

      if (res.success) {
        setQueryResult({
          ...res,
          durationMs,
        });
        saveToHistory({
          query: trimmed,
          database: activeTab?.database,
          success: true,
          durationMs,
          rowCount: res.rowCount,
          affectedRows: res.affectedRows,
        });
      } else {
        const errMsg = isEn ? res.error || 'Query failed' : res.errorFa || res.error || 'خطا در اجرای کوئری';
        setExecutionError(errMsg);
        saveToHistory({
          query: trimmed,
          database: activeTab?.database,
          success: false,
          durationMs,
          error: errMsg,
        });
      }
    } catch (err: any) {
      const errMsg = err.message || (isEn ? 'Network connection failure' : 'خطای ارتباط با سرور');
      setExecutionError(errMsg);
      saveToHistory({
        query: trimmed,
        database: activeTab?.database,
        success: false,
        durationMs: Date.now() - startTime,
        error: errMsg,
      });
    } finally {
      setIsExecuting(false);
      setPendingQueryToExecute(null);
      setShowDestructiveWarning(false);
    }
  };

  // Hotkey support: Ctrl+Enter / Cmd+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery(activeTab?.query || '');
    }
  };

  // Format SQL (simple beautifier)
  const handleFormatSql = () => {
    if (!activeTab?.query) return;
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
      'GROUP BY', 'ORDER BY', 'LIMIT', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET',
      'DELETE FROM', 'HAVING', 'UNION ALL', 'UNION', 'SHOW DATABASES', 'SHOW TABLES'
    ];
    let formatted = activeTab.query;
    keywords.forEach((kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(regex, kw);
    });
    handleQueryChange(formatted);
  };

  // Copy cell value helper
  const handleCopyCell = (val: any, cellId: string) => {
    if (val === null || val === undefined) return;
    const text = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
    navigator.clipboard.writeText(text);
    setCopiedCellId(cellId);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  // Filtered and Sorted Results
  const processedRows = useMemo(() => {
    if (!queryResult || !Array.isArray(queryResult.rows)) return [];
    let rows = [...queryResult.rows];

    // 1. Text Search across all columns
    if (resultsSearchQuery.trim()) {
      const q = resultsSearchQuery.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => {
          if (v === null || v === undefined) return false;
          return String(v).toLowerCase().includes(q);
        })
      );
    }

    // 2. Column Sorting
    if (sortColumn) {
      rows.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        let cmp = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          cmp = valA - valB;
        } else {
          cmp = String(valA).localeCompare(String(valB));
        }

        return sortDir === 'ASC' ? cmp : -cmp;
      });
    }

    return rows;
  }, [queryResult, resultsSearchQuery, sortColumn, sortDir]);

  // Paginated Rows
  const totalPages = Math.ceil(processedRows.length / resultsPageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (resultsPage - 1) * resultsPageSize;
    return processedRows.slice(start, start + resultsPageSize);
  }, [processedRows, resultsPage, resultsPageSize]);

  // Export results to CSV
  const handleExportCsv = () => {
    if (!queryResult || !Array.isArray(queryResult.rows) || queryResult.rows.length === 0) return;
    const cols = queryResult.columns || Object.keys(queryResult.rows[0] || {});

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = cols.map(escapeCsv).join(',');
    const rowLines = processedRows.map((row) => cols.map((c) => escapeCsv(row[c])).join(','));
    const csvContent = [headerLine, ...rowLines].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mysql_query_${activeTab?.database || 'result'}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export results to JSON
  const handleExportJson = () => {
    if (!queryResult || !Array.isArray(queryResult.rows) || queryResult.rows.length === 0) return;
    const jsonStr = JSON.stringify(processedRows, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mysql_query_${activeTab?.database || 'result'}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4" dir={isEn ? 'ltr' : 'rtl'}>
      {/* 1. QUERY TABS BAR */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[70%] custom-scrollbar py-0.5">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isEditing = editingTabTitleId === tab.id;

            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer select-none shrink-0 ${
                  isActive
                    ? isLightMode
                      ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 font-bold shadow-xs'
                      : 'bg-orange-500/20 border-orange-500/50 text-orange-300 font-bold shadow-xs'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                    : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Code className="w-3.5 h-3.5 opacity-70 shrink-0" />
                {isEditing ? (
                  <input
                    type="text"
                    value={tempTabTitle}
                    onChange={(e) => setTempTabTitle(e.target.value)}
                    onBlur={handleFinishRenameTab}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishRenameTab();
                      if (e.key === 'Escape') setEditingTabTitleId(null);
                    }}
                    autoFocus
                    className="w-24 px-1 py-0.5 bg-black/40 border border-orange-500 rounded text-xs text-white outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => handleStartRenameTab(tab, e)}
                    title={isEn ? 'Double click to rename' : 'دوبار کلیک جهت تغییر نام'}
                  >
                    {tab.title}
                  </span>
                )}

                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="p-0.5 rounded-full hover:bg-black/20 text-slate-400 hover:text-white transition cursor-pointer"
                    title={isEn ? 'Close tab' : 'بستن تب'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddTab}
            className={`p-1.5 rounded-xl border flex items-center justify-center transition cursor-pointer shrink-0 ${
              isLightMode
                ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                : 'border-white/10 bg-black/20 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            title={isEn ? 'Add new query tab' : 'افزودن تب کوئری جدید'}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Database Selector & Actions */}
        <div className="flex items-center gap-2">
          {/* Target Database Picker */}
          <div className="flex items-center gap-1.5 text-xs">
            <Database className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <select
              value={activeTab?.database || ''}
              onChange={(e) => handleDatabaseChange(e.target.value)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-900 border-white/10 text-slate-200'
              }`}
            >
              <option value="">{isEn ? '-- Default / Global Context --' : '-- کانتکست پیش‌فرض / سراسری --'}</option>
              {databases.map((db) => (
                <option key={db.name} value={db.name}>
                  {db.name}
                </option>
              ))}
            </select>
          </div>

          {/* History Button */}
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
              showHistory
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                : isLightMode
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-black/20 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
          >
            <History className="w-3.5 h-3.5 text-orange-400" />
            <span>{isEn ? 'History' : 'تاریخچه'}</span>
            {queryHistory.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-orange-500/20 text-orange-400 font-mono">
                {queryHistory.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. SQL EDITOR PANEL */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col gap-3 shadow-sm ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
        }`}
      >
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold flex items-center gap-1.5 text-orange-400">
              <Terminal className="w-4 h-4" />
              <span>{isEn ? 'MySQL SQL Query Console' : 'کنسول اجرای کوئری MySQL'}</span>
            </span>

            <FieldInfoTooltip
              title={isEn ? 'MySQL Interactive Query Console' : 'کنسول تعاملی کوئری MySQL'}
              whatIsIt={
                isEn
                  ? 'High-speed SQL executor supporting multi-statement and administrative queries against MySQL.'
                  : 'محیط اجرای سریع و تعاملی کدهای SQL روی دیتابیس MySQL با زمان‌سنجی دقیق و ایمنی تراکنشی.'
              }
              whyIsItNeeded={
                isEn
                  ? 'Enables direct queries, diagnostic inspection, execution plans, and bulk operations without leaving the panel.'
                  : 'امکان اجرای مستقیم کوئری‌ها، بازرسی‌های تشخیصی و سناریوهای پیچیده بدون خروج از پنل.'
              }
              practicalExample={
                isEn
                  ? 'SELECT * FROM users LIMIT 10;\nSHOW PROCESSLIST;'
                  : 'SELECT * FROM users LIMIT 10;\nSHOW PROCESSLIST;'
              }
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Templates Picker & Formatting */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="relative group">
              <button
                type="button"
                className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 cursor-pointer transition ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-black/30 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{isEn ? 'Templates' : 'الگوهای آماده'}</span>
              </button>

              <div
                className={`absolute right-0 top-full mt-1 w-64 rounded-xl border shadow-xl p-1 z-30 hidden group-hover:block ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                {MYSQL_SQL_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => handleQueryChange(tpl.sql)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex flex-col gap-0.5 cursor-pointer transition ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <span className="font-semibold text-[11px]">{isEn ? tpl.name : tpl.nameFa}</span>
                    <span className="font-mono text-[9px] opacity-60 truncate">{tpl.sql.replace(/\n/g, ' ')}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleFormatSql}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
              title={isEn ? 'Format SQL' : 'مرتب‌سازی ساختار SQL'}
            >
              <FileCode className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleQueryChange('')}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
              title={isEn ? 'Clear Editor' : 'پاک‌سازی ادیتور'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Textarea Code Editor */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={6}
            value={activeTab?.query || ''}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isEn ? 'Enter MySQL query (e.g., SELECT * FROM `table` LIMIT 50;)' : 'کوئری MySQL خود را وارد کنید...'}
            className={`w-full p-3 rounded-xl border font-mono text-xs outline-none transition resize-y focus:ring-1 focus:ring-orange-500 ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-inner'
                : 'bg-black/50 border-white/10 text-slate-100 shadow-inner'
            }`}
          />
        </div>

        {/* Execution Bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.2 rounded bg-black/20 text-slate-300 text-[10px] border border-white/10">
                Ctrl+Enter
              </span>
              <span>{isEn ? 'to run' : 'جهت اجرا'}</span>
            </span>
            {queryResult?.durationMs !== undefined && (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <Clock className="w-3 h-3" />
                <span>{queryResult.durationMs}ms</span>
              </span>
            )}
            {queryResult?.rowCount !== undefined && (
              <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                <TableIcon className="w-3 h-3" />
                <span>
                  {queryResult.rowCount} {isEn ? 'rows' : 'سطر'}
                </span>
              </span>
            )}
            {queryResult?.affectedRows !== undefined && queryResult.affectedRows > 0 && (
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                <Activity className="w-3 h-3" />
                <span>
                  {queryResult.affectedRows} {isEn ? 'affected' : 'تغییریافته'}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => executeQuery(activeTab?.query || '')}
              disabled={isExecuting || !activeTab?.query?.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-lg shadow-orange-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Executing...' : 'در حال اجرا...'}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isEn ? 'Run Query' : 'اجرای کوئری'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. DESTRUCTIVE QUERY CONFIRMATION DIALOG */}
      {showDestructiveWarning && pendingQueryToExecute && (
        <div className="fixed inset-0 z-[999995] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150 ${
              isLightMode ? 'bg-white border-red-300 text-slate-900' : 'bg-slate-900 border-red-500/40 text-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-red-500">
                  {isEn ? 'Potentially Destructive Query Warning' : 'هشدار اجرای کوئری مخرب'}
                </h4>
                <p className="text-xs opacity-75">
                  {isEn
                    ? 'The SQL statement contains potentially irreversible modifications (DROP, TRUNCATE, or unrestricted DELETE/UPDATE).'
                    : 'دستور ارسالی شامل عملیات غیرقابل بازگشت (حذف جدول، پایگاه‌داده یا ویرایش سراسری بدون شرط) است.'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/10 font-mono text-xs max-h-36 overflow-y-auto text-red-300">
              {pendingQueryToExecute}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDestructiveWarning(false);
                  setPendingQueryToExecute(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                  isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={() => executeQuery(pendingQueryToExecute, true)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 cursor-pointer"
              >
                {isEn ? 'I understand the risks, execute' : 'خطرات را می‌دانم، اجرا شود'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. EXECUTION ERROR BANNER */}
      {executionError && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs animate-in fade-in duration-150 ${
            isLightMode ? 'bg-red-50 border-red-200 text-red-800' : 'bg-red-950/40 border-red-800/60 text-red-300'
          }`}
        >
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <span className="font-bold">{isEn ? 'MySQL Execution Error' : 'خطای اجرای MySQL'}</span>
            <div className="font-mono text-[11px] leading-relaxed break-all">{executionError}</div>
          </div>
          <button
            type="button"
            onClick={() => setExecutionError(null)}
            className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5. QUERY RESULT DISPLAY */}
      {queryResult && (
        <div className="space-y-3">
          {/* Result Controls Bar (Only when there are tabular rows) */}
          {Array.isArray(queryResult.rows) && queryResult.rows.length > 0 ? (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
                isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/60 border-white/10'
              }`}
            >
              {/* Search in Result */}
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={resultsSearchQuery}
                  onChange={(e) => {
                    setResultsSearchQuery(e.target.value);
                    setResultsPage(1);
                  }}
                  placeholder={isEn ? 'Filter in results...' : 'جستجو در نتایج...'}
                  className={`w-full px-2.5 py-1 rounded-lg border text-xs font-mono outline-none ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-black/30 border-white/10 text-slate-200'
                  }`}
                />
                {resultsSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setResultsSearchQuery('')}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Stats & Exports */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400">
                  {isEn
                    ? `Showing ${processedRows.length} of ${queryResult.rows.length} rows`
                    : `نمایش ${processedRows.length} از ${queryResult.rows.length} سطر`}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-black/20 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                    title={isEn ? 'Export to CSV' : 'خروجی فایل CSV'}
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJson}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-black/20 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                    title={isEn ? 'Export to JSON' : 'خروجی فایل JSON'}
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Table Grid / Success Message */}
          <div
            className={`rounded-2xl border overflow-hidden shadow-sm ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
            }`}
          >
            {Array.isArray(queryResult.rows) && queryResult.rows.length > 0 ? (
              <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead
                    className={`sticky top-0 z-10 border-b text-[11px] uppercase tracking-wider ${
                      isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-900 border-white/10 text-slate-300'
                    }`}
                  >
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center text-slate-500 font-sans font-bold select-none cursor-default">
                        #
                      </th>
                      {(queryResult.columns || Object.keys(queryResult.rows[0] || {})).map((col) => {
                        const isSorted = sortColumn === col;
                        return (
                          <th
                            key={col}
                            onClick={() => {
                              if (sortColumn === col) {
                                setSortDir(sortDir === 'ASC' ? 'DESC' : 'ASC');
                              } else {
                                setSortColumn(col);
                                setSortDir('ASC');
                              }
                            }}
                            className={`py-2.5 px-3 font-semibold cursor-pointer select-none transition ${
                              isSorted
                                ? 'bg-orange-500/15 text-orange-300'
                                : isLightMode
                                ? 'hover:bg-slate-200 text-slate-700'
                                : 'hover:bg-white/5 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{col}</span>
                              <span className="ml-auto text-slate-400">
                                {isSorted ? (
                                  sortDir === 'ASC' ? (
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
                    {paginatedRows.map((row, rowIdx) => {
                      const rowNumber = (resultsPage - 1) * resultsPageSize + rowIdx + 1;
                      const cols = queryResult.columns || Object.keys(row);

                      return (
                        <tr key={rowIdx} className="hover:bg-white/5 transition group">
                          <td
                            onClick={() => setInspectedRow(row)}
                            className="py-2 px-3 text-center text-slate-400 font-sans text-[11px] select-none cursor-pointer hover:bg-orange-500/20 hover:text-orange-300 font-bold"
                            title={isEn ? 'Click to inspect full row' : 'مشاهده جزئیات سطر'}
                          >
                            {rowNumber}
                          </td>
                          {cols.map((col) => {
                            const val = row[col];
                            const cellId = `cell-${rowIdx}-${col}`;
                            const isNull = val === null || val === undefined;
                            const isCopied = copiedCellId === cellId;

                            return (
                              <td
                                key={col}
                                onClick={() => !isNull && handleCopyCell(val, cellId)}
                                className={`py-2 px-3 whitespace-nowrap max-w-xs truncate transition cursor-pointer ${
                                  isNull
                                    ? 'text-slate-500 italic'
                                    : isCopied
                                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                                    : 'text-slate-200 group-hover:text-white'
                                }`}
                                title={
                                  isNull
                                    ? 'NULL'
                                    : isEn
                                    ? 'Click to copy value'
                                    : 'جهت کپی مقدار کلیک کنید'
                                }
                              >
                                {isNull ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 text-[10px]">
                                    NULL
                                  </span>
                                ) : typeof val === 'object' ? (
                                  JSON.stringify(val)
                                ) : (
                                  String(val)
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
            ) : (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-emerald-400">
                  {isEn ? 'Statement Executed Successfully' : 'دستور با موفقیت اجرا شد'}
                </h4>
                <p className="text-xs text-slate-400 font-mono">
                  {isEn
                    ? `Affected rows: ${queryResult.affectedRows ?? 0} • Duration: ${queryResult.durationMs ?? 0}ms`
                    : `سطرهای تغییر یافته: ${queryResult.affectedRows ?? 0} • مدت زمان: ${queryResult.durationMs ?? 0} میلی‌ثانیه`}
                </p>
              </div>
            )}

            {/* Pagination footer (when tabular data exists) */}
            {Array.isArray(queryResult.rows) && queryResult.rows.length > 0 && (
              <div
                className={`p-3 border-t flex items-center justify-between gap-3 flex-wrap ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>{isEn ? 'Page Size:' : 'اندازه صفحه:'}</span>
                  <select
                    value={resultsPageSize}
                    onChange={(e) => {
                      setResultsPageSize(Number(e.target.value));
                      setResultsPage(1);
                    }}
                    className={`px-2 py-0.5 rounded border text-xs font-mono outline-none cursor-pointer ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/10 text-slate-200'
                    }`}
                  >
                    {[25, 50, 100, 200].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">
                    {isEn
                      ? `Page ${resultsPage} of ${totalPages}`
                      : `صفحه ${resultsPage} از ${totalPages}`}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={resultsPage <= 1}
                      onClick={() => setResultsPage(1)}
                      className="p-1 rounded border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={resultsPage <= 1}
                      onClick={() => setResultsPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={resultsPage >= totalPages}
                      onClick={() => setResultsPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1 rounded border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={resultsPage >= totalPages}
                      onClick={() => setResultsPage(totalPages)}
                      className="p-1 rounded border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. QUERY HISTORY DRAWER / MODAL */}
      {showHistory && (
        <div className="fixed inset-0 z-[999995] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl max-h-[80vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-white/10 text-slate-100'
            }`}
          >
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-orange-400" />
                <h4 className="text-sm font-bold">{isEn ? 'MySQL Query Execution History' : 'تاریخچه اجرای کوئری‌های MySQL'}</h4>
              </div>

              <div className="flex items-center gap-2">
                {queryHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{isEn ? 'Clear History' : 'پاک‌سازی تاریخچه'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {queryHistory.length === 0 ? (
                <div className="p-10 text-center text-slate-400 space-y-2">
                  <History className="w-8 h-8 mx-auto opacity-50" />
                  <p className="text-xs font-medium">{isEn ? 'No queries executed yet.' : 'هنوز کوئری اجرا نشده است.'}</p>
                </div>
              ) : (
                queryHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border flex flex-col gap-2 transition ${
                      item.success
                        ? isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/10'
                        : isLightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/20 border-rose-800/30'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-2">
                        {item.success ? (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                            SUCCESS
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20">
                            FAILED
                          </span>
                        )}
                        {item.database && (
                          <span className="text-orange-400 font-semibold flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            <span>{item.database}</span>
                          </span>
                        )}
                        {item.durationMs !== undefined && (
                          <span className="text-slate-400">{item.durationMs}ms</span>
                        )}
                      </div>

                      <span className="text-slate-500 text-[10px]">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="font-mono text-xs p-2 rounded-lg bg-black/40 text-slate-200 break-all select-all">
                      {item.query}
                    </div>

                    {item.error && (
                      <div className="text-[11px] text-rose-400 font-mono">{item.error}</div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleQueryChange(item.query);
                          if (item.database) handleDatabaseChange(item.database);
                          setShowHistory(false);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{isEn ? 'Load into Editor' : 'بارگذاری در ادیتور'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(item.query);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-white/10 text-slate-300 hover:bg-white/10 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{isEn ? 'Copy' : 'کپی'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. ROW INSPECTOR MODAL */}
      {inspectedRow && (
        <div className="fixed inset-0 z-[999995] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-white/10 text-slate-100'
            }`}
          >
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-400" />
                <h4 className="text-sm font-bold">{isEn ? 'Row Details Inspector' : 'بازرس جزئیات سطر'}</h4>
              </div>

              <button
                type="button"
                onClick={() => setInspectedRow(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b flex items-center gap-2 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={inspectedRowFieldSearch}
                onChange={(e) => setInspectedRowFieldSearch(e.target.value)}
                placeholder={isEn ? 'Filter columns...' : 'فیلتر ستون‌ها...'}
                className={`w-full px-2 py-1 rounded-lg border text-xs font-mono outline-none ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-black/30 border-white/10 text-slate-200'
                }`}
              />
              {inspectedRowFieldSearch && (
                <button
                  type="button"
                  onClick={() => setInspectedRowFieldSearch('')}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {Object.entries(inspectedRow)
                .filter(([col]) =>
                  inspectedRowFieldSearch ? col.toLowerCase().includes(inspectedRowFieldSearch.toLowerCase()) : true
                )
                .map(([col, val]) => {
                  const isNull = val === null || val === undefined;
                  const isObj = typeof val === 'object' && !isNull;

                  return (
                    <div
                      key={col}
                      className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono font-bold text-orange-400">
                        <span>{col}</span>
                        <button
                          type="button"
                          onClick={() => !isNull && navigator.clipboard.writeText(isObj ? JSON.stringify(val, null, 2) : String(val))}
                          className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{isEn ? 'Copy' : 'کپی'}</span>
                        </button>
                      </div>

                      <div className="font-mono text-xs break-all">
                        {isNull ? (
                          <span className="italic text-slate-500">NULL</span>
                        ) : isObj ? (
                          <pre className="p-2 rounded bg-black/40 text-[11px] overflow-x-auto text-emerald-300">
                            {JSON.stringify(val, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-slate-200">{String(val)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 border-t flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setInspectedRow(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                  isLightMode ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-white/10 hover:bg-white/10 text-slate-300'
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
};
