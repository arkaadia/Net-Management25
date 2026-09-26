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
} from 'lucide-react';
import {
  RemoteServer,
  PostgresDatabaseItem,
  PostgresQueryExecutionRequest,
  PostgresQueryExecutionResponse,
  PostgresQueryStatementResult,
  PostgresQueryTab,
  PostgresQueryHistoryItem,
} from '../../types';
import { executeRemoteServerPostgresQuery } from '../../services/api';

export interface PostgresSqlEditorTabProps {
  server: RemoteServer;
  databases: PostgresDatabaseItem[];
  defaultDatabase?: string;
  defaultSchema?: string;
  initialQuery?: string;
  isLightMode: boolean;
  isEn: boolean;
}

const SQL_TEMPLATES = [
  {
    name: 'Select 50 Rows',
    nameFa: 'انتخاب ۵۰ سطر نمونه',
    sql: 'SELECT * FROM information_schema.tables WHERE table_schema = \'public\' LIMIT 50;',
  },
  {
    name: 'Database Table Sizes',
    nameFa: 'حجم جداول دیتابیس',
    sql: `SELECT 
  table_schema || '.' || table_name AS full_table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name))) AS total_size,
  pg_size_pretty(pg_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name))) AS table_size,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name)) - pg_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name))) AS index_size
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name)) DESC
LIMIT 20;`,
  },
  {
    name: 'Active Connections & Queries',
    nameFa: 'نشست‌های فعال و کوئری‌های در حال اجرا',
    sql: `SELECT 
  pid, 
  usename, 
  client_addr, 
  state, 
  NOW() - query_start AS query_duration,
  query 
FROM pg_stat_activity 
WHERE state != 'idle' AND pid != pg_backend_pid()
ORDER BY query_start ASC;`,
  },
  {
    name: 'Server Uptime & Version',
    nameFa: 'نسخه و مدت زمان فعالیت سرور',
    sql: `SELECT 
  version() AS pg_version, 
  pg_postmaster_start_time() AS server_start_time, 
  NOW() - pg_postmaster_start_time() AS uptime;`,
  },
  {
    name: 'Cache Hit Ratio',
    nameFa: 'نرخ اصابت کش دیتابیس',
    sql: `SELECT 
  sum(heap_blks_read) AS heap_read,
  sum(heap_blks_hit)  AS heap_hit,
  ROUND(sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read) + 0.000001) * 100, 2) AS hit_ratio_pct
FROM pg_statio_user_tables;`,
  },
];

export const PostgresSqlEditorTab: React.FC<PostgresSqlEditorTabProps> = ({
  server,
  databases,
  defaultDatabase,
  defaultSchema,
  initialQuery,
  isLightMode,
  isEn,
}) => {
  // Query tabs management
  const [tabs, setTabs] = useState<PostgresQueryTab[]>(() => {
    const initialDb = defaultDatabase || (databases.length > 0 ? databases[0].name : 'postgres');
    return [
      {
        id: 'tab-1',
        title: isEn ? 'Query 1' : 'کوئری ۱',
        query: initialQuery || 'SELECT version();',
        database: initialDb,
        schema: defaultSchema || 'public',
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
  const [queryHistory, setQueryHistory] = useState<PostgresQueryHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(`pg_query_history_${server.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Results display state
  const [selectedStatementIndex, setSelectedStatementIndex] = useState(0);
  const [resultsSearchQuery, setResultsSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState(50);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [inspectedRow, setInspectedRow] = useState<Record<string, any> | null>(null);

  // Save history to localStorage
  const saveToHistory = useCallback(
    (item: Omit<PostgresQueryHistoryItem, 'id' | 'timestamp'>) => {
      const newItem: PostgresQueryHistoryItem = {
        ...item,
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
      };
      setQueryHistory((prev) => {
        const updated = [newItem, ...prev.slice(0, 49)];
        try {
          localStorage.setItem(`pg_query_history_${server.id}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    [server.id]
  );

  const clearHistory = useCallback(() => {
    setQueryHistory([]);
    try {
      localStorage.removeItem(`pg_query_history_${server.id}`);
    } catch {}
  }, [server.id]);

  // Tab management helpers
  const handleAddTab = () => {
    const newId = `tab-${Date.now()}`;
    const newNumber = tabs.length + 1;
    const newTab: PostgresQueryTab = {
      id: newId,
      title: isEn ? `Query ${newNumber}` : `کوئری ${newNumber}`,
      query: '-- Write your SQL query here\nSELECT 1;',
      database: activeTab?.database || (databases.length > 0 ? databases[0].name : 'postgres'),
      schema: activeTab?.schema || 'public',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setSelectedStatementIndex(0);
    setResultsPage(1);
  };

  const handleCloseTab = (idToClose: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (tabs.length === 1) {
      // If closing last tab, reset it
      setTabs([
        {
          id: `tab-${Date.now()}`,
          title: isEn ? 'Query 1' : 'کوئری ۱',
          query: 'SELECT version();',
          database: databases[0]?.name || 'postgres',
          schema: 'public',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
      return;
    }

    const remaining = tabs.filter((t) => t.id !== idToClose);
    setTabs(remaining);
    if (activeTabId === idToClose) {
      setActiveTabId(remaining[remaining.length - 1].id);
    }
  };

  const handleUpdateTabQuery = (query: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, query, updatedAt: Date.now() } : t))
    );
  };

  const handleUpdateTabDatabase = (database: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, database, updatedAt: Date.now() } : t))
    );
  };

  const handleUpdateTabSchema = (schema: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, schema, updatedAt: Date.now() } : t))
    );
  };

  // Execute active query
  const handleExecuteQuery = async (options?: { explain?: boolean; queryOverride?: string }) => {
    if (!activeTab || activeTab.isExecuting) return;

    // Check if text is highlighted in textarea
    let queryToRun = options?.queryOverride;
    if (!queryToRun && textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== end) {
        const selected = activeTab.query.substring(start, end).trim();
        if (selected) {
          queryToRun = selected;
        }
      }
    }
    if (!queryToRun) {
      queryToRun = activeTab.query.trim();
    }

    if (!queryToRun) return;

    // Set tab executing state
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, isExecuting: true } : t))
    );
    setSelectedStatementIndex(0);
    setResultsPage(1);

    try {
      const response = await executeRemoteServerPostgresQuery(server.id, {
        database: activeTab.database,
        schema: activeTab.schema,
        query: queryToRun,
        explain: options?.explain,
        maxRows: 1000,
      });

      // Update tab with result
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, isExecuting: false, lastResult: response, updatedAt: Date.now() }
            : t
        )
      );

      // Record to history
      const totalRowCount = (response.results || []).reduce((acc, r) => acc + (r.rowCount || 0), 0);
      const firstCommand = response.results && response.results[0] ? response.results[0].command : 'QUERY';

      saveToHistory({
        query: queryToRun,
        database: activeTab.database,
        schema: activeTab.schema,
        success: response.success,
        durationMs: response.totalDurationMs || 0,
        rowCount: totalRowCount,
        command: firstCommand,
        errorMessage: response.error?.message,
      });
    } catch (err: any) {
      const errorResponse: PostgresQueryExecutionResponse = {
        success: false,
        error: { message: err.message || (isEn ? 'Network request failed' : 'خطای ارتباط با سرور') },
        errorFa: isEn ? err.message : 'خطای شبکه در ارسال کوئری',
      };

      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, isExecuting: false, lastResult: errorResponse } : t
        )
      );

      saveToHistory({
        query: queryToRun,
        database: activeTab.database,
        schema: activeTab.schema,
        success: false,
        durationMs: 0,
        rowCount: 0,
        command: 'ERROR',
        errorMessage: err.message,
      });
    }
  };

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecuteQuery();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      handleUpdateTabQuery(newVal);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Basic SQL Keyword Formatter
  const handleFormatSql = () => {
    if (!activeTab?.query) return;
    const keywords = [
      'SELECT',
      'FROM',
      'WHERE',
      'AND',
      'OR',
      'GROUP BY',
      'ORDER BY',
      'HAVING',
      'LIMIT',
      'OFFSET',
      'JOIN',
      'LEFT JOIN',
      'RIGHT JOIN',
      'INNER JOIN',
      'FULL JOIN',
      'CROSS JOIN',
      'ON',
      'AS',
      'INSERT INTO',
      'VALUES',
      'UPDATE',
      'SET',
      'DELETE',
      'CREATE TABLE',
      'DROP TABLE',
      'ALTER TABLE',
      'CREATE INDEX',
      'DROP INDEX',
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'UNION',
      'UNION ALL',
      'RETURNING',
      'DISTINCT',
      'COUNT',
      'SUM',
      'AVG',
      'MAX',
      'MIN',
      'CASE',
      'WHEN',
      'THEN',
      'ELSE',
      'END',
      'IS NULL',
      'IS NOT NULL',
      'EXISTS',
      'NOT EXISTS',
      'IN',
      'NOT IN',
      'LIKE',
      'ILIKE',
      'BETWEEN',
      'DESC',
      'ASC',
      'NULLS FIRST',
      'NULLS LAST',
    ];

    let formatted = activeTab.query;
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(regex, kw);
    }
    handleUpdateTabQuery(formatted);
  };

  // Jump cursor to error line
  const handleJumpToErrorLine = (line?: number, column?: number) => {
    if (!line || !textareaRef.current) return;
    const lines = activeTab.query.split('\n');
    let charPos = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i++) {
      charPos += lines[i].length + 1; // +1 for newline
    }
    if (column) {
      charPos += Math.min(column - 1, (lines[line - 1] || '').length);
    }
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(charPos, charPos);
  };

  // Active statement result
  const activeStatementResult: PostgresQueryStatementResult | undefined = useMemo(() => {
    const results = activeTab.lastResult?.results;
    if (!results || results.length === 0) return undefined;
    return results[selectedStatementIndex] || results[0];
  }, [activeTab.lastResult, selectedStatementIndex]);

  // Filtered and sorted rows
  const displayedRows = useMemo(() => {
    if (!activeStatementResult?.rows) return [];
    let rows = [...activeStatementResult.rows];

    // Search filter
    if (resultsSearchQuery.trim()) {
      const q = resultsSearchQuery.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => (v !== null && v !== undefined ? String(v).toLowerCase().includes(q) : false))
      );
    }

    // Sort
    if (sortColumn) {
      rows.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDir === 'ASC' ? valA - valB : valB - valA;
        }
        return sortDir === 'ASC'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return rows;
  }, [activeStatementResult, resultsSearchQuery, sortColumn, sortDir]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const start = (resultsPage - 1) * resultsPageSize;
    return displayedRows.slice(start, start + resultsPageSize);
  }, [displayedRows, resultsPage, resultsPageSize]);

  const totalPages = Math.max(1, Math.ceil(displayedRows.length / resultsPageSize));

  // Export results helper
  const handleExportCSV = () => {
    if (!activeStatementResult || !activeStatementResult.rows.length) return;
    const fields = activeStatementResult.fields.map((f) => f.name);
    const header = fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(',');
    const body = displayedRows
      .map((row) =>
        fields
          .map((f) => {
            const v = row[f];
            if (v === null || v === undefined) return '""';
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\n');
    const csvContent = `${header}\n${body}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeTab.title.toLowerCase().replace(/\s+/g, '_')}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (!activeStatementResult || !activeStatementResult.rows.length) return;
    const jsonContent = JSON.stringify(displayedRows, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeTab.title.toLowerCase().replace(/\s+/g, '_')}_results.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCell(id);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  // Line numbers calculation for gutter
  const lineNumbers = useMemo(() => {
    const lines = (activeTab?.query || '').split('\n').length;
    return Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1);
  }, [activeTab?.query]);

  return (
    <div className="flex flex-col h-full space-y-3 font-sans select-none" dir={isEn ? 'ltr' : 'rtl'}>
      {/* ========================================================================= */}
      {/* 1. TOP BAR: TABS & QUICK CONTROLS                                         */}
      {/* ========================================================================= */}
      <div
        className={`flex items-center justify-between border-b px-2 py-1.5 gap-2 shrink-0 ${
          isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        {/* Tabs Bar */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setSelectedStatementIndex(0);
                  setResultsPage(1);
                }}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition shrink-0 border ${
                  isActive
                    ? isLightMode
                      ? 'bg-white text-blue-700 border-blue-300 shadow-xs'
                      : 'bg-slate-800 text-cyan-300 border-cyan-500/40 shadow-xs'
                    : isLightMode
                    ? 'bg-transparent text-slate-600 border-transparent hover:bg-slate-200/60'
                    : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Code className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />

                {editingTabTitleId === tab.id ? (
                  <input
                    type="text"
                    value={tempTabTitle}
                    onChange={(e) => setTempTabTitle(e.target.value)}
                    onBlur={() => {
                      if (tempTabTitle.trim()) {
                        setTabs((prev) =>
                          prev.map((t) => (t.id === tab.id ? { ...t, title: tempTabTitle.trim() } : t))
                        );
                      }
                      setEditingTabTitleId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (tempTabTitle.trim()) {
                          setTabs((prev) =>
                            prev.map((t) => (t.id === tab.id ? { ...t, title: tempTabTitle.trim() } : t))
                          );
                        }
                        setEditingTabTitleId(null);
                      }
                    }}
                    autoFocus
                    className="w-20 px-1 py-0.5 rounded bg-black/20 border border-cyan-500 text-xs font-semibold outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={() => {
                      setEditingTabTitleId(tab.id);
                      setTempTabTitle(tab.title);
                    }}
                    title={isEn ? 'Double click to rename tab' : 'برای تغییر نام دو بار کلیک کنید'}
                    className="max-w-[120px] truncate"
                  >
                    {tab.title}
                  </span>
                )}

                {tab.isExecuting && <Activity className="w-3 h-3 text-amber-400 animate-spin shrink-0" />}

                <button
                  type="button"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className={`p-0.5 rounded-md hover:bg-rose-500/20 hover:text-rose-400 transition opacity-60 group-hover:opacity-100 ${
                    isActive ? 'text-slate-400' : 'text-slate-500'
                  }`}
                  title={isEn ? 'Close tab' : 'بستن تب'}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* New Tab Button */}
          <button
            type="button"
            onClick={handleAddTab}
            className={`p-1.5 rounded-lg border transition shrink-0 ${
              isLightMode
                ? 'border-slate-300 text-slate-600 hover:bg-slate-200'
                : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title={isEn ? 'New SQL Tab' : 'تب کوئری جدید'}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Quick Controls: History & Templates */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Query Templates Dropdown */}
          <div className="relative group">
            <button
              type="button"
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{isEn ? 'Templates' : 'الگوها'}</span>
            </button>
            <div
              className={`absolute right-0 top-full mt-1 w-64 rounded-xl border shadow-xl p-1.5 z-50 hidden group-hover:block ${
                isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/40 mb-1">
                {isEn ? 'Common SQL Queries' : 'کوئری‌های پرکاربرد'}
              </div>
              {SQL_TEMPLATES.map((tpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleUpdateTabQuery(tpl.sql)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex flex-col gap-0.5 transition cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                  }`}
                >
                  <span className="text-cyan-400 font-medium">{isEn ? tpl.name : tpl.nameFa}</span>
                  <span className="text-[10px] text-slate-400 font-mono truncate">{tpl.sql.replace(/\s+/g, ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {/* History Button */}
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
              showHistory
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : isLightMode
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title={isEn ? 'Query Execution History' : 'تاریخچه اجرای کوئری‌ها'}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isEn ? 'History' : 'تاریخچه'}</span>
            {queryHistory.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white">
                {queryHistory.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CONTEXT TOOLBAR: DATABASE, SCHEMA, RUN ACTIONS                         */}
      {/* ========================================================================= */}
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border flex-wrap ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Database Selector */}
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={activeTab?.database || ''}
              onChange={(e) => handleUpdateTabDatabase(e.target.value)}
              className={`text-xs font-mono font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                  : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500'
              }`}
            >
              {databases.map((db) => (
                <option key={db.name} value={db.name}>
                  {db.name} {db.name === 'postgres' ? '(default)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Schema Selector / Input */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <input
              type="text"
              value={activeTab?.schema || 'public'}
              onChange={(e) => handleUpdateTabSchema(e.target.value)}
              placeholder="schema"
              className={`w-28 text-xs font-mono px-2 py-1.5 rounded-lg border outline-none transition ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                  : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500'
              }`}
              title={isEn ? 'Target Schema (search_path)' : 'اسکیما هدف'}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Format SQL */}
          <button
            type="button"
            onClick={handleFormatSql}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title={isEn ? 'Format SQL keywords' : 'مرتب‌سازی کلیدواژه‌های SQL'}
          >
            <Code className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">{isEn ? 'Format' : 'فرمت'}</span>
          </button>

          {/* Explain Query */}
          <button
            type="button"
            disabled={activeTab?.isExecuting}
            onClick={() => handleExecuteQuery({ explain: true })}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title={isEn ? 'Run EXPLAIN ANALYZE on query' : 'تحلیل نحوه اجرای کوئری (EXPLAIN)'}
          >
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden md:inline">{isEn ? 'Explain' : 'تحلیل'}</span>
          </button>

          {/* Clear Editor */}
          <button
            type="button"
            onClick={() => handleUpdateTabQuery('')}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title={isEn ? 'Clear Editor' : 'پاک کردن ادیتور'}
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden md:inline">{isEn ? 'Clear' : 'پاک‌سازی'}</span>
          </button>

          {/* Run Query Main Button */}
          <button
            type="button"
            disabled={activeTab?.isExecuting || !activeTab?.query.trim()}
            onClick={() => handleExecuteQuery()}
            className="px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-md bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-black disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title={isEn ? 'Execute SQL Query (Ctrl + Enter)' : 'اجرای کوئری (Ctrl + Enter)'}
          >
            {activeTab?.isExecuting ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>{isEn ? 'Executing...' : 'در حال اجرا...'}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>{isEn ? 'Run Query' : 'اجرای کوئری'}</span>
                <span className="text-[10px] font-mono opacity-70 border border-black/30 rounded px-1 hidden lg:inline">
                  Ctrl+Enter
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN WORKSPACE: EDITOR & RESULTS / HISTORY (SPLIT VIEW)                */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
        {/* SQL Textarea Editor Container */}
        <div
          className={`relative rounded-xl border flex flex-col overflow-hidden shrink-0 h-44 sm:h-52 ${
            isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-800'
          }`}
        >
          <div className="flex-1 flex relative overflow-hidden">
            {/* Gutter with Line Numbers */}
            <div
              className={`w-10 sm:w-12 py-3 border-r select-none text-right pr-2 text-xs font-mono font-medium overflow-hidden shrink-0 ${
                isLightMode ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-slate-900/50 border-slate-800 text-slate-600'
              }`}
            >
              {lineNumbers.map((ln) => (
                <div key={ln} className="leading-6">
                  {ln}
                </div>
              ))}
            </div>

            {/* Interactive Textarea */}
            <textarea
              ref={textareaRef}
              value={activeTab?.query || ''}
              onChange={(e) => handleUpdateTabQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isEn ? '-- Write your PostgreSQL queries here...\n-- Tip: Press Ctrl+Enter to execute' : '-- کوئری‌های SQL خود را اینجا بنویسید...\n-- راهنما: برای اجرا کلید Ctrl+Enter را فشار دهید'}
              spellCheck={false}
              className={`flex-1 p-3 text-xs sm:text-sm font-mono leading-6 outline-none resize-none overflow-y-auto ${
                isLightMode ? 'bg-transparent text-slate-900 placeholder:text-slate-400' : 'bg-transparent text-slate-100 placeholder:text-slate-600'
              }`}
            />
          </div>

          {/* Editor Status Bottom Bar */}
          <div
            className={`px-3 py-1 border-t text-[11px] font-mono flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-900/60 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <span>
                {isEn ? 'Database' : 'دیتابیس'}: <strong className="text-cyan-400">{activeTab?.database}</strong>
              </span>
              <span>•</span>
              <span>
                {isEn ? 'Schema' : 'اسکیما'}: <strong className="text-emerald-400">{activeTab?.schema || 'public'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>
                {isEn ? 'Lines' : 'سطرها'}: {lineNumbers.length}
              </span>
              <span>•</span>
              <span>
                {isEn ? 'Characters' : 'کاراکترها'}: {(activeTab?.query || '').length}
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* 4. EXECUTION RESULTS OR ERROR PANEL OR HISTORY DRAWER                   */}
        {/* ======================================================================= */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* History Drawer if open */}
          {showHistory ? (
            <div
              className={`flex-1 rounded-xl border flex flex-col overflow-hidden ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            >
              <div
                className={`p-3 border-b flex items-center justify-between ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-cyan-400" />
                  <h4 className="font-bold text-xs">{isEn ? 'Query Execution History' : 'تاریخچه اجرای کوئری‌ها'}</h4>
                  <span className="text-[10px] font-mono text-slate-400">({queryHistory.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  {queryHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={clearHistory}
                      className="px-2 py-1 rounded text-xs font-semibold text-rose-400 hover:bg-rose-500/15 transition flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{isEn ? 'Clear History' : 'پاک کردن تاریخچه'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    className="p-1 rounded hover:bg-black/20 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-2">
                {queryHistory.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {isEn ? 'No query execution history recorded yet.' : 'هنوز تاریخچه‌ای برای اجرای کوئری ثبت نشده است.'}
                  </div>
                ) : (
                  queryHistory.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-lg flex items-start justify-between gap-3 transition group ${
                        isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-[11px] font-mono flex-wrap">
                          {item.success ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              {item.command || 'SUCCESS'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              FAILED
                            </span>
                          )}
                          <span className="text-slate-400">{item.database}</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-400">{item.durationMs} ms</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-400">
                            {item.rowCount} {isEn ? 'rows' : 'سطر'}
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-500 text-[10px]">{new Date(item.timestamp).toLocaleTimeString()}</span>
                        </div>

                        <pre className="text-xs font-mono text-slate-300 bg-black/30 p-2 rounded-md overflow-x-auto max-h-24 whitespace-pre-wrap break-all">
                          {item.query}
                        </pre>

                        {item.errorMessage && (
                          <p className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>{item.errorMessage}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            handleUpdateTabQuery(item.query);
                            handleUpdateTabDatabase(item.database);
                            setShowHistory(false);
                          }}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 transition shadow-xs"
                          title={isEn ? 'Load this query into editor' : 'بارگذاری در ادیتور'}
                        >
                          <Terminal className="w-3 h-3" />
                          <span>{isEn ? 'Load' : 'بارگذاری'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(item.query, item.id)}
                          className="p-1.5 rounded hover:bg-black/20 text-slate-400 hover:text-white transition"
                          title={isEn ? 'Copy SQL' : 'کپی SQL'}
                        >
                          {copiedCell === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab.lastResult && !activeTab.lastResult.success ? (
            /* ======================================================================= */
            /* ERROR DIAGNOSTICS DISPLAY                                               */
            /* ======================================================================= */
            <div
              className={`flex-1 rounded-xl border p-4 sm:p-5 flex flex-col space-y-3 overflow-y-auto ${
                isLightMode ? 'bg-rose-50 border-rose-200 text-rose-950' : 'bg-rose-950/30 border-rose-900/60 text-rose-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">
                      {isEn ? 'Query Execution Error' : 'خطا در اجرای کوئری SQL'}
                    </h4>
                    {activeTab.lastResult.error?.code && (
                      <span className="text-xs font-mono font-semibold text-rose-400">
                        PostgreSQL Error Code: {activeTab.lastResult.error.code}
                      </span>
                    )}
                  </div>
                </div>

                {activeTab.lastResult.error?.line && (
                  <button
                    type="button"
                    onClick={() =>
                      handleJumpToErrorLine(
                        activeTab.lastResult?.error?.line,
                        activeTab.lastResult?.error?.column
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>
                      {isEn
                        ? `Jump to Line ${activeTab.lastResult.error.line}:${activeTab.lastResult.error.column || 1}`
                        : `پرش به سطر ${activeTab.lastResult.error.line}:${activeTab.lastResult.error.column || 1}`}
                    </span>
                  </button>
                )}
              </div>

              {/* Error Message Box */}
              <div className="p-3 rounded-lg bg-black/40 font-mono text-xs text-rose-300 border border-rose-500/30 space-y-2">
                <p className="font-bold text-sm text-rose-200">{activeTab.lastResult.error?.message}</p>
                {activeTab.lastResult.error?.detail && (
                  <p className="text-slate-300">
                    <strong className="text-slate-400">Detail:</strong> {activeTab.lastResult.error.detail}
                  </p>
                )}
                {activeTab.lastResult.error?.hint && (
                  <p className="text-amber-300">
                    <strong className="text-amber-400">Hint:</strong> {activeTab.lastResult.error.hint}
                  </p>
                )}
                {activeTab.lastResult.error?.where && (
                  <p className="text-slate-400 text-[11px]">
                    <strong>Where:</strong> {activeTab.lastResult.error.where}
                  </p>
                )}
              </div>
            </div>
          ) : activeTab.lastResult && activeTab.lastResult.results ? (
            /* ======================================================================= */
            /* QUERY RESULTS GRID & TELEMETRY                                          */
            /* ======================================================================= */
            <div
              className={`flex-1 rounded-xl border flex flex-col overflow-hidden ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            >
              {/* Telemetry and Statement Tabs */}
              <div
                className={`p-2 sm:px-3 border-b flex items-center justify-between gap-3 flex-wrap ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                {/* Multi-statement Tabs or Summary */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {activeTab.lastResult.results.map((res, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => {
                        setSelectedStatementIndex(sIdx);
                        setResultsPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                        selectedStatementIndex === sIdx
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>{res.command || 'Statement'}</span>
                      <span className="text-[10px] opacity-75 font-mono">({res.rowCount})</span>
                    </button>
                  ))}

                  {/* Telemetry Badge */}
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 ml-2">
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      {activeTab.lastResult.totalDurationMs} ms
                    </span>
                    <span>•</span>
                    <span>
                      {activeStatementResult?.rowCount || 0} {isEn ? 'rows' : 'سطر'}
                    </span>
                    {activeStatementResult?.isTruncated && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {isEn ? 'Capped at 1,000' : 'محدود به ۱۰۰۰ سطر'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Search Filter & Export Buttons */}
                <div className="flex items-center gap-2">
                  <div className="relative min-w-[140px] max-w-xs">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={resultsSearchQuery}
                      onChange={(e) => {
                        setResultsSearchQuery(e.target.value);
                        setResultsPage(1);
                      }}
                      placeholder={isEn ? 'Filter output...' : 'فیلتر نتایج...'}
                      className={`w-full pl-7 pr-2 py-1 text-xs rounded-lg border outline-none font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                          : 'bg-slate-900 border-slate-800 text-slate-200 focus:border-cyan-500'
                      }`}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    disabled={!activeStatementResult?.rows.length}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    } disabled:opacity-40`}
                    title={isEn ? 'Export visible rows as CSV' : 'خروجی CSV'}
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJSON}
                    disabled={!activeStatementResult?.rows.length}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    } disabled:opacity-40`}
                    title={isEn ? 'Export visible rows as JSON' : 'خروجی JSON'}
                  >
                    <Download className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              {/* Grid Table */}
              <div className="flex-1 overflow-auto">
                {activeStatementResult && activeStatementResult.fields.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead
                      className={`sticky top-0 z-10 uppercase text-[10px] tracking-wider font-semibold border-b ${
                        isLightMode
                          ? 'bg-slate-100 border-slate-300 text-slate-700'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <tr>
                        <th className="py-2 px-3 w-10 text-slate-500 font-mono">#</th>
                        {activeStatementResult.fields.map((col) => {
                          const isSorted = sortColumn === col.name;
                          return (
                            <th
                              key={col.name}
                              onClick={() => {
                                if (sortColumn === col.name) {
                                  setSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
                                } else {
                                  setSortColumn(col.name);
                                  setSortDir('ASC');
                                }
                              }}
                              className="py-2 px-3 whitespace-nowrap cursor-pointer hover:bg-black/10 transition select-none group"
                            >
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className={isSorted ? 'text-cyan-400 font-bold' : ''}>{col.name}</span>
                                {isSorted ? (
                                  sortDir === 'ASC' ? (
                                    <ArrowUp className="w-3 h-3 text-cyan-400" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3 text-cyan-400" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono text-xs">
                      {paginatedRows.length > 0 ? (
                        paginatedRows.map((row, rIdx) => {
                          const absoluteIndex = (resultsPage - 1) * resultsPageSize + rIdx + 1;
                          return (
                            <tr
                              key={rIdx}
                              className={`transition ${
                                isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-900/50'
                              }`}
                            >
                              <td className="py-1.5 px-3 text-slate-500 text-[11px]">{absoluteIndex}</td>
                              {activeStatementResult.fields.map((col) => {
                                const val = row[col.name];
                                const isNull = val === null || val === undefined;
                                const cellKey = `${rIdx}-${col.name}`;

                                let displayContent: React.ReactNode;
                                if (isNull) {
                                  displayContent = <span className="text-slate-500 italic text-[11px]">NULL</span>;
                                } else if (typeof val === 'boolean') {
                                  displayContent = val ? (
                                    <span className="px-1 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                      TRUE
                                    </span>
                                  ) : (
                                    <span className="px-1 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                      FALSE
                                    </span>
                                  );
                                } else if (typeof val === 'object') {
                                  const jsonStr = JSON.stringify(val);
                                  displayContent = (
                                    <span
                                      className="text-purple-300 truncate max-w-xs block cursor-pointer hover:underline"
                                      onClick={() => setInspectedRow(row)}
                                      title={jsonStr}
                                    >
                                      {jsonStr}
                                    </span>
                                  );
                                } else {
                                  displayContent = (
                                    <span
                                      className="truncate max-w-sm block text-slate-200"
                                      title={String(val)}
                                    >
                                      {String(val)}
                                    </span>
                                  );
                                }

                                return (
                                  <td
                                    key={col.name}
                                    onDoubleClick={() => copyToClipboard(String(val), cellKey)}
                                    className="py-1.5 px-3 whitespace-nowrap"
                                  >
                                    {displayContent}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={activeStatementResult.fields.length + 1}
                            className="py-8 text-center text-slate-500 font-sans"
                          >
                            {isEn ? 'No rows match filter criteria.' : 'هیچ سطری با فیلتر تطابق ندارد.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                    <p className="font-bold text-sm text-slate-200">
                      {activeStatementResult?.command || 'Query'} {isEn ? 'Executed Successfully' : 'با موفقیت اجرا شد'}
                    </p>
                    <p className="text-slate-500">
                      {activeStatementResult?.rowCount || 0} {isEn ? 'rows affected.' : 'سطر تحت تاثیر قرار گرفت.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Results Pagination Bottom Bar */}
              {totalPages > 1 && (
                <div
                  className={`px-3 py-1.5 border-t flex items-center justify-between text-xs font-mono ${
                    isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>
                      {isEn ? 'Showing' : 'نمایش'} {(resultsPage - 1) * resultsPageSize + 1} -{' '}
                      {Math.min(resultsPage * resultsPageSize, displayedRows.length)} {isEn ? 'of' : 'از'}{' '}
                      {displayedRows.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={resultsPage <= 1}
                      onClick={() => setResultsPage(1)}
                      className="p-1 rounded hover:bg-black/20 disabled:opacity-30"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={resultsPage <= 1}
                      onClick={() => setResultsPage((prev) => Math.max(1, prev - 1))}
                      className="p-1 rounded hover:bg-black/20 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 font-bold text-cyan-400">
                      {resultsPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={resultsPage >= totalPages}
                      onClick={() => setResultsPage((prev) => Math.min(totalPages, prev + 1))}
                      className="p-1 rounded hover:bg-black/20 disabled:opacity-30"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={resultsPage >= totalPages}
                      onClick={() => setResultsPage(totalPages)}
                      className="p-1 rounded hover:bg-black/20 disabled:opacity-30"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ======================================================================= */
            /* EMPTY STATE: READY TO EXECUTE                                           */
            /* ======================================================================= */
            <div
              className={`flex-1 rounded-xl border border-dashed flex flex-col items-center justify-center p-8 text-center select-none ${
                isLightMode ? 'bg-slate-50/50 border-slate-300 text-slate-500' : 'bg-slate-900/20 border-slate-800 text-slate-500'
              }`}
            >
              <Terminal className="w-10 h-10 text-cyan-400/40 mb-3" />
              <h4 className="font-bold text-sm text-slate-300 mb-1">
                {isEn ? 'PostgreSQL SQL Workspace Ready' : 'محیط اجرای کوئری آماده است'}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mb-4">
                {isEn
                  ? 'Type your PostgreSQL statement and press Ctrl+Enter to execute. Results, row counts, and execution metrics will display here.'
                  : 'کوئری خود را بنویسید و کلید Ctrl+Enter را فشار دهید تا خروجی، زمان اجرا و تعداد سطرها در این بخش نمایش یابند.'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExecuteQuery()}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-black text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Play className="w-3 h-3 fill-black" />
                  <span>{isEn ? 'Execute Current Query' : 'اجرای کوئری فعلی'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. ROW JSON / DETAIL INSPECTOR MODAL                                      */}
      {/* ========================================================================= */}
      {inspectedRow && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
              isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
            }`}
          >
            <div
              className={`p-3 border-b flex items-center justify-between ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <h4 className="font-bold text-xs">{isEn ? 'Inspected Row Data' : 'مشاهده کامل مقادیر سطر'}</h4>
              </div>
              <button
                type="button"
                onClick={() => setInspectedRow(null)}
                className="p-1 rounded hover:bg-black/20 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <pre className="text-xs font-mono bg-black/40 p-3 rounded-lg border border-slate-800 text-emerald-300 overflow-x-auto">
                {JSON.stringify(inspectedRow, null, 2)}
              </pre>
            </div>
            <div
              className={`p-3 border-t flex items-center justify-between ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => copyToClipboard(JSON.stringify(inspectedRow, null, 2), 'modal-inspect')}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition hover:bg-slate-800"
              >
                {copiedCell === 'modal-inspect' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isEn ? 'Copied!' : 'کپی شد!'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Copy JSON' : 'کپی JSON'}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setInspectedRow(null)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
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
