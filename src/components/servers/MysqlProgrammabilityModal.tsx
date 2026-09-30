import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Eye,
  Code,
  Zap,
  Activity,
  Clock,
  Plus,
  Trash2,
  Play,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Database,
  Table,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  MysqlRoutineParameter,
  MysqlCreateViewRequest,
  MysqlDropViewRequest,
  MysqlCreateProcedureRequest,
  MysqlDropProcedureRequest,
  MysqlExecuteProcedureRequest,
  MysqlExecuteProcedureResult,
  MysqlCreateFunctionRequest,
  MysqlDropFunctionRequest,
  MysqlCreateTriggerRequest,
  MysqlDropTriggerRequest,
  MysqlCreateEventRequest,
  MysqlDropEventRequest,
  MysqlDdlOperationResult,
} from '../../types';
import {
  createRemoteServerMysqlView,
  dropRemoteServerMysqlView,
  createRemoteServerMysqlProcedure,
  dropRemoteServerMysqlProcedure,
  executeRemoteServerMysqlProcedure,
  createRemoteServerMysqlFunction,
  dropRemoteServerMysqlFunction,
  createRemoteServerMysqlTrigger,
  dropRemoteServerMysqlTrigger,
  createRemoteServerMysqlEvent,
  dropRemoteServerMysqlEvent,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export type MysqlProgrammabilityModalMode =
  | 'create_view'
  | 'drop_view'
  | 'create_procedure'
  | 'execute_procedure'
  | 'drop_procedure'
  | 'create_function'
  | 'drop_function'
  | 'create_trigger'
  | 'drop_trigger'
  | 'create_event'
  | 'drop_event';

export interface MysqlProgrammabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  serverId: string;
  serverName: string;
  databaseName: string;
  mode: MysqlProgrammabilityModalMode;
  targetName?: string;
  existingTables?: string[];
  initialRoutineParams?: MysqlRoutineParameter[];
  onSuccess: (message?: string) => void;
  isLightMode?: boolean;
  language?: string;
}

const COMMON_SQL_TYPES = [
  'INT',
  'BIGINT',
  'VARCHAR',
  'TEXT',
  'LONGTEXT',
  'DATETIME',
  'TIMESTAMP',
  'DECIMAL',
  'TINYINT',
  'BOOLEAN',
  'DOUBLE',
  'FLOAT',
  'JSON',
];

export const MysqlProgrammabilityModal: React.FC<MysqlProgrammabilityModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  serverId,
  serverName,
  databaseName,
  mode,
  targetName = '',
  existingTables = [],
  initialRoutineParams = [],
  onSuccess,
  isLightMode = false,
  language = 'fa',
}) => {
  const isEn = language === 'en';
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  // View state
  const [viewName, setViewName] = useState(targetName || '');
  const [viewOrReplace, setViewOrReplace] = useState(true);
  const [viewCheckOption, setViewCheckOption] = useState<'NONE' | 'CASCADED' | 'LOCAL'>('NONE');
  const [viewSecurityType, setViewSecurityType] = useState<'DEFINER' | 'INVOKER'>('DEFINER');
  const [viewQuery, setViewQuery] = useState(
    existingTables.length > 0
      ? `SELECT * FROM \`${existingTables[0]}\` WHERE 1=1`
      : 'SELECT 1 AS id, "example" AS label'
  );

  // Procedure state
  const [procedureName, setProcedureName] = useState(targetName || '');
  const [procedureParams, setProcedureParams] = useState<MysqlRoutineParameter[]>(
    initialRoutineParams.length > 0
      ? initialRoutineParams
      : [{ mode: 'IN', name: 'p_id', dataType: 'INT', length: '' }]
  );
  const [procedureDeterministic, setProcedureDeterministic] = useState(false);
  const [procedureSecurity, setProcedureSecurity] = useState<'DEFINER' | 'INVOKER'>('DEFINER');
  const [procedureComment, setProcedureComment] = useState('');
  const [procedureBody, setProcedureBody] = useState(
    'BEGIN\n  -- Routine body logic goes here\n  SELECT * FROM information_schema.tables WHERE table_schema = DATABASE() LIMIT 10;\nEND'
  );

  // Procedure Execution state
  const [executeParamValues, setExecuteParamValues] = useState<Record<string, string>>({});
  const [executionResult, setExecutionResult] = useState<MysqlExecuteProcedureResult | null>(null);

  // Function state
  const [functionName, setFunctionName] = useState(targetName || '');
  const [functionReturnType, setFunctionReturnType] = useState('VARCHAR(255)');
  const [functionParams, setFunctionParams] = useState<MysqlRoutineParameter[]>([
    { name: 'val1', dataType: 'INT', length: '' },
  ]);
  const [functionDeterministic, setFunctionDeterministic] = useState(true);
  const [functionSecurity, setFunctionSecurity] = useState<'DEFINER' | 'INVOKER'>('DEFINER');
  const [functionComment, setFunctionComment] = useState('');
  const [functionBody, setFunctionBody] = useState(
    'BEGIN\n  DECLARE res VARCHAR(255);\n  SET res = CONCAT("Result: ", val1);\n  RETURN res;\nEND'
  );

  // Trigger state
  const [triggerName, setTriggerName] = useState(targetName || '');
  const [triggerTableName, setTriggerTableName] = useState(existingTables[0] || '');
  const [triggerTiming, setTriggerTiming] = useState<'BEFORE' | 'AFTER'>('BEFORE');
  const [triggerEvent, setTriggerEvent] = useState<'INSERT' | 'UPDATE' | 'DELETE'>('INSERT');
  const [triggerStatement, setTriggerStatement] = useState(
    'BEGIN\n  -- Trigger body logic\n  -- Access NEW.column or OLD.column\nEND'
  );

  // Event state
  const [eventName, setEventName] = useState(targetName || '');
  const [eventScheduleType, setEventScheduleType] = useState<'AT' | 'EVERY'>('EVERY');
  const [eventExecuteAt, setEventExecuteAt] = useState('');
  const [eventIntervalValue, setEventIntervalValue] = useState(1);
  const [eventIntervalField, setEventIntervalField] = useState<
    'YEAR' | 'QUARTER' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'WEEK' | 'SECOND'
  >('DAY');
  const [eventStartsAt, setEventStartsAt] = useState('');
  const [eventEndsAt, setEventEndsAt] = useState('');
  const [eventOnCompletion, setEventOnCompletion] = useState<'PRESERVE' | 'NOT PRESERVE'>('PRESERVE');
  const [eventStatus, setEventStatus] = useState<'ENABLE' | 'DISABLE'>('ENABLE');
  const [eventStatement, setEventStatement] = useState(
    'BEGIN\n  -- Event periodic task body\n  INSERT INTO _event_heartbeat (logged_at) VALUES (NOW());\nEND'
  );
  const [eventComment, setEventComment] = useState('');

  // Drop confirmation
  const [dropIfExists, setDropIfExists] = useState(true);
  const [confirmInput, setConfirmInput] = useState('');

  // Reset form when target or mode changes
  useEffect(() => {
    setError(null);
    setExecutionResult(null);
    setConfirmInput('');
    if (targetName) {
      if (mode.includes('view')) setViewName(targetName);
      if (mode.includes('procedure')) setProcedureName(targetName);
      if (mode.includes('function')) setFunctionName(targetName);
      if (mode.includes('trigger')) setTriggerName(targetName);
      if (mode.includes('event')) setEventName(targetName);
    }
  }, [mode, targetName]);

  // Sync execution parameter values with procedure params
  useEffect(() => {
    if (mode === 'execute_procedure') {
      const initial: Record<string, string> = {};
      procedureParams.forEach((p) => {
        if (p.name) initial[p.name] = '';
      });
      setExecuteParamValues(initial);
    }
  }, [mode, procedureParams]);

  // Live SQL preview generator
  const generatedSql = useMemo(() => {
    const escId = (id: string) => `\`${id.replace(/`/g, '``')}\``;
    switch (mode) {
      case 'create_view': {
        const replace = viewOrReplace ? 'OR REPLACE ' : '';
        const check = viewCheckOption !== 'NONE' ? `\nWITH ${viewCheckOption} CHECK OPTION` : '';
        const sec = viewSecurityType ? `\nSQL SECURITY ${viewSecurityType}` : '';
        return `CREATE ${replace}VIEW ${escId(databaseName)}.${escId(viewName || 'view_name')}${sec}\nAS\n${viewQuery.trim()}${check};`;
      }
      case 'drop_view': {
        const ifEx = dropIfExists ? 'IF EXISTS ' : '';
        return `DROP VIEW ${ifEx}${escId(databaseName)}.${escId(targetName || viewName)};`;
      }
      case 'create_procedure': {
        const paramsSql = procedureParams
          .filter((p) => p.name.trim())
          .map((p) => {
            const m = p.mode || 'IN';
            const len = p.length ? `(${p.length})` : '';
            return `${m} ${escId(p.name)} ${p.dataType}${len}`;
          })
          .join(', ');
        const det = procedureDeterministic ? '\nDETERMINISTIC' : '\nNOT DETERMINISTIC';
        const sec = `\nSQL SECURITY ${procedureSecurity}`;
        const com = procedureComment ? `\nCOMMENT '${procedureComment.replace(/'/g, "''")}'` : '';
        return `DELIMITER //\nCREATE PROCEDURE ${escId(databaseName)}.${escId(procedureName || 'proc_name')}(${paramsSql})${det}${sec}${com}\n${procedureBody.trim()}\n//\nDELIMITER ;`;
      }
      case 'execute_procedure': {
        const callArgs = procedureParams
          .map((p) => {
            const val = executeParamValues[p.name];
            if (val === undefined || val === '') return 'NULL';
            if (!isNaN(Number(val)) && !isNaN(parseFloat(val))) return val;
            return `'${val.replace(/'/g, "''")}'`;
          })
          .join(', ');
        return `CALL ${escId(databaseName)}.${escId(targetName || procedureName)}(${callArgs});`;
      }
      case 'drop_procedure': {
        const ifEx = dropIfExists ? 'IF EXISTS ' : '';
        return `DROP PROCEDURE ${ifEx}${escId(databaseName)}.${escId(targetName || procedureName)};`;
      }
      case 'create_function': {
        const paramsSql = functionParams
          .filter((p) => p.name.trim())
          .map((p) => {
            const len = p.length ? `(${p.length})` : '';
            return `${escId(p.name)} ${p.dataType}${len}`;
          })
          .join(', ');
        const det = functionDeterministic ? '\nDETERMINISTIC' : '\nNOT DETERMINISTIC';
        const sec = `\nSQL SECURITY ${functionSecurity}`;
        const com = functionComment ? `\nCOMMENT '${functionComment.replace(/'/g, "''")}'` : '';
        return `DELIMITER //\nCREATE FUNCTION ${escId(databaseName)}.${escId(functionName || 'func_name')}(${paramsSql})\nRETURNS ${functionReturnType}${det}${sec}${com}\n${functionBody.trim()}\n//\nDELIMITER ;`;
      }
      case 'drop_function': {
        const ifEx = dropIfExists ? 'IF EXISTS ' : '';
        return `DROP FUNCTION ${ifEx}${escId(databaseName)}.${escId(targetName || functionName)};`;
      }
      case 'create_trigger': {
        return `DELIMITER //\nCREATE TRIGGER ${escId(databaseName)}.${escId(triggerName || 'trg_name')}\n${triggerTiming} ${triggerEvent} ON ${escId(databaseName)}.${escId(triggerTableName || 'table_name')}\nFOR EACH ROW\n${triggerStatement.trim()}\n//\nDELIMITER ;`;
      }
      case 'drop_trigger': {
        const ifEx = dropIfExists ? 'IF EXISTS ' : '';
        return `DROP TRIGGER ${ifEx}${escId(databaseName)}.${escId(targetName || triggerName)};`;
      }
      case 'create_event': {
        let sched = '';
        if (eventScheduleType === 'AT' && eventExecuteAt) {
          sched = `AT '${eventExecuteAt}'`;
        } else {
          sched = `EVERY ${eventIntervalValue || 1} ${eventIntervalField}`;
          if (eventStartsAt) sched += ` STARTS '${eventStartsAt}'`;
          if (eventEndsAt) sched += ` ENDS '${eventEndsAt}'`;
        }
        const comp = eventOnCompletion === 'NOT PRESERVE' ? 'ON COMPLETION NOT PRESERVE' : 'ON COMPLETION PRESERVE';
        const com = eventComment ? ` COMMENT '${eventComment.replace(/'/g, "''")}'` : '';
        return `CREATE EVENT ${escId(databaseName)}.${escId(eventName || 'event_name')}\nON SCHEDULE ${sched}\n${comp}\n${eventStatus}${com}\nDO\n${eventStatement.trim()};`;
      }
      case 'drop_event': {
        const ifEx = dropIfExists ? 'IF EXISTS ' : '';
        return `DROP EVENT ${ifEx}${escId(databaseName)}.${escId(targetName || eventName)};`;
      }
      default:
        return '';
    }
  }, [
    mode,
    databaseName,
    viewName,
    viewOrReplace,
    viewCheckOption,
    viewSecurityType,
    viewQuery,
    dropIfExists,
    targetName,
    procedureName,
    procedureParams,
    procedureDeterministic,
    procedureSecurity,
    procedureComment,
    procedureBody,
    executeParamValues,
    functionName,
    functionReturnType,
    functionParams,
    functionDeterministic,
    functionSecurity,
    functionComment,
    functionBody,
    triggerName,
    triggerTableName,
    triggerTiming,
    triggerEvent,
    triggerStatement,
    eventName,
    eventScheduleType,
    eventExecuteAt,
    eventIntervalValue,
    eventIntervalField,
    eventStartsAt,
    eventEndsAt,
    eventOnCompletion,
    eventStatus,
    eventComment,
    eventStatement,
  ]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(generatedSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleExecute = async () => {
    setError(null);
    setLoading(true);

    try {
      let res: MysqlDdlOperationResult | MysqlExecuteProcedureResult | null = null;

      switch (mode) {
        case 'create_view': {
          if (!viewName.trim()) throw new Error(isEn ? 'View name is required' : 'نام نما الزامی است');
          res = await createRemoteServerMysqlView(serverId, {
            database: databaseName,
            viewName: viewName.trim(),
            query: viewQuery.trim(),
            orReplace: viewOrReplace,
            checkOption: viewCheckOption,
            securityType: viewSecurityType,
          });
          break;
        }
        case 'drop_view': {
          res = await dropRemoteServerMysqlView(serverId, {
            database: databaseName,
            viewName: targetName || viewName,
            ifExists: dropIfExists,
          });
          break;
        }
        case 'create_procedure': {
          if (!procedureName.trim()) throw new Error(isEn ? 'Procedure name is required' : 'نام رویه الزامی است');
          res = await createRemoteServerMysqlProcedure(serverId, {
            database: databaseName,
            procedureName: procedureName.trim(),
            parameters: procedureParams,
            body: procedureBody.trim(),
            deterministic: procedureDeterministic,
            securityType: procedureSecurity,
            comment: procedureComment.trim(),
          });
          break;
        }
        case 'execute_procedure': {
          const paramsPayload = procedureParams.map((p) => ({
            name: p.name,
            value: executeParamValues[p.name] ?? null,
            mode: p.mode,
          }));
          const execRes = await executeRemoteServerMysqlProcedure(serverId, {
            database: databaseName,
            procedureName: targetName || procedureName,
            parameters: paramsPayload,
          });
          setExecutionResult(execRes);
          if (!execRes.success) {
            setError(isEn ? execRes.error || execRes.message : execRes.errorFa || execRes.messageFa);
          }
          setLoading(false);
          return;
        }
        case 'drop_procedure': {
          res = await dropRemoteServerMysqlProcedure(serverId, {
            database: databaseName,
            procedureName: targetName || procedureName,
            ifExists: dropIfExists,
          });
          break;
        }
        case 'create_function': {
          if (!functionName.trim()) throw new Error(isEn ? 'Function name is required' : 'نام تابع الزامی است');
          res = await createRemoteServerMysqlFunction(serverId, {
            database: databaseName,
            functionName: functionName.trim(),
            returnType: functionReturnType.trim(),
            parameters: functionParams,
            body: functionBody.trim(),
            deterministic: functionDeterministic,
            securityType: functionSecurity,
            comment: functionComment.trim(),
          });
          break;
        }
        case 'drop_function': {
          res = await dropRemoteServerMysqlFunction(serverId, {
            database: databaseName,
            functionName: targetName || functionName,
            ifExists: dropIfExists,
          });
          break;
        }
        case 'create_trigger': {
          if (!triggerName.trim()) throw new Error(isEn ? 'Trigger name is required' : 'نام تریگر الزامی است');
          if (!triggerTableName.trim()) throw new Error(isEn ? 'Target table is required' : 'جدول هدف الزامی است');
          res = await createRemoteServerMysqlTrigger(serverId, {
            database: databaseName,
            triggerName: triggerName.trim(),
            tableName: triggerTableName.trim(),
            timing: triggerTiming,
            event: triggerEvent,
            statement: triggerStatement.trim(),
          });
          break;
        }
        case 'drop_trigger': {
          res = await dropRemoteServerMysqlTrigger(serverId, {
            database: databaseName,
            triggerName: targetName || triggerName,
            ifExists: dropIfExists,
          });
          break;
        }
        case 'create_event': {
          if (!eventName.trim()) throw new Error(isEn ? 'Event name is required' : 'نام رویداد الزامی است');
          res = await createRemoteServerMysqlEvent(serverId, {
            database: databaseName,
            eventName: eventName.trim(),
            scheduleType: eventScheduleType,
            executeAt: eventExecuteAt || undefined,
            intervalValue: Number(eventIntervalValue) || 1,
            intervalField: eventIntervalField,
            startsAt: eventStartsAt || undefined,
            endsAt: eventEndsAt || undefined,
            onCompletion: eventOnCompletion,
            status: eventStatus,
            statement: eventStatement.trim(),
            comment: eventComment.trim() || undefined,
          });
          break;
        }
        case 'drop_event': {
          res = await dropRemoteServerMysqlEvent(serverId, {
            database: databaseName,
            eventName: targetName || eventName,
            ifExists: dropIfExists,
          });
          break;
        }
      }

      if (res && res.success) {
        onSuccess(isEn ? res.message : res.messageFa);
        onClose();
      } else if (res) {
        setError(isEn ? res.error || res.message : res.errorFa || res.messageFa);
      }
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Title and Icon determination
  const modalInfo = (() => {
    switch (mode) {
      case 'create_view':
        return {
          title: isEn ? 'Create MySQL View' : 'ایجاد نمای جدید در پایگاه داده (View)',
          icon: <Eye className="w-5 h-5 text-purple-400" />,
          color: 'purple',
        };
      case 'drop_view':
        return {
          title: isEn ? `Drop View: ${targetName}` : `حذف نما: ${targetName}`,
          icon: <Trash2 className="w-5 h-5 text-rose-400" />,
          color: 'rose',
        };
      case 'create_procedure':
        return {
          title: isEn ? 'Create Stored Procedure' : 'ایجاد رویه ذخیره‌شده جدید (Stored Procedure)',
          icon: <Code className="w-5 h-5 text-emerald-400" />,
          color: 'emerald',
        };
      case 'execute_procedure':
        return {
          title: isEn ? `Execute Procedure: ${targetName}` : `فراخوانی و اجرای رویه: ${targetName}`,
          icon: <Play className="w-5 h-5 text-emerald-400" />,
          color: 'emerald',
        };
      case 'drop_procedure':
        return {
          title: isEn ? `Drop Stored Procedure: ${targetName}` : `حذف رویه ذخیره‌شده: ${targetName}`,
          icon: <Trash2 className="w-5 h-5 text-rose-400" />,
          color: 'rose',
        };
      case 'create_function':
        return {
          title: isEn ? 'Create Stored Function' : 'ایجاد تابع ذخیره‌شده جدید (Stored Function)',
          icon: <Zap className="w-5 h-5 text-amber-400" />,
          color: 'amber',
        };
      case 'drop_function':
        return {
          title: isEn ? `Drop Function: ${targetName}` : `حذف تابع: ${targetName}`,
          icon: <Trash2 className="w-5 h-5 text-rose-400" />,
          color: 'rose',
        };
      case 'create_trigger':
        return {
          title: isEn ? 'Create Database Trigger' : 'تعریف تریگر جدید دیتابیس (Trigger)',
          icon: <Activity className="w-5 h-5 text-rose-400" />,
          color: 'rose',
        };
      case 'drop_trigger':
        return {
          title: isEn ? `Drop Trigger: ${targetName}` : `حذف تریگر: ${targetName}`,
          icon: <Trash2 className="w-5 h-5 text-rose-400" />,
          color: 'rose',
        };
      case 'create_event':
        return {
          title: isEn ? 'Create Scheduled Event' : 'ایجاد رویداد زمان‌بندی‌شده جدید (Scheduled Event)',
          icon: <Clock className="w-5 h-5 text-blue-400" />,
          color: 'blue',
        };
      case 'drop_event':
        return {
          title: isEn ? `Drop Scheduled Event: ${targetName}` : `حذف رویداد زمان‌بندی‌شده: ${targetName}`,
          icon: <Trash2 className="w-5 h-5 text-rose-400" />,
          color: 'rose',
        };
      default:
        return {
          title: isEn ? 'Programmability Management' : 'مدیریت اشیاء و برنامه‌پذیری',
          icon: <Code className="w-5 h-5 text-cyan-400" />,
          color: 'cyan',
        };
    }
  })();

  const isDestructive = mode.startsWith('drop_');
  const canConfirmDrop = !isDestructive || confirmInput === targetName;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-3 sm:p-5 pointer-events-auto bg-black/60 backdrop-blur-sm"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`relative w-full flex flex-col rounded-2xl shadow-2xl transition-all duration-200 overflow-hidden border ${
          isMaximized ? 'h-full max-w-full' : 'max-h-[92vh] max-w-4xl'
        } ${
          isLightMode
            ? 'bg-slate-50 text-slate-800 border-slate-300 shadow-slate-900/20'
            : 'bg-slate-950 text-slate-100 border-cyan-500/30 shadow-cyan-950/40'
        }`}
      >
        {/* ============================================================ */}
        {/* MODAL HEADER WITH TRIAD BUTTONS                              */}
        {/* ============================================================ */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                isLightMode ? 'bg-slate-100' : 'bg-white/5 border border-white/10'
              }`}
            >
              {modalInfo.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">{modalInfo.title}</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {databaseName}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                <Database className="w-3 h-3 text-cyan-400" />
                <span>{serverName}</span>
                <span>•</span>
                <span className="text-cyan-400 font-semibold">{databaseName}</span>
              </p>
            </div>
          </div>

          {/* Header Controls: Minimize, Fullscreen, Close */}
          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className={`p-1.5 rounded-lg transition ${
                  isLightMode
                    ? 'hover:bg-slate-200 text-slate-600'
                    : 'hover:bg-white/10 text-slate-300'
                }`}
                title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-white/10 text-slate-300'
              }`}
              title={isMaximized ? (isEn ? 'Restore' : 'اندازه عادی') : isEn ? 'Maximize' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition ${
                isLightMode
                  ? 'hover:bg-rose-100 text-rose-600'
                  : 'hover:bg-rose-500/20 text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* MODAL BODY (SCROLLABLE)                                      */}
        {/* ============================================================ */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div
              className={`p-4 rounded-xl flex items-start gap-3 border ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold">{isEn ? 'Operation Failed' : 'خطا در اجرای عملیات'}</p>
                <p className="font-mono break-all">{error}</p>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* MODE: CREATE VIEW                                            */}
          {/* ------------------------------------------------------------ */}
          {mode === 'create_view' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold">
                      {isEn ? 'View Name' : 'نام نما'} <span className="text-rose-500">*</span>
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'View Name' : 'نام نمای دیتابیس'}
                      whatIsIt={
                        isEn
                          ? 'The unique identifier for the virtual table representation.'
                          : 'شناسه یکتا برای جدول مجازی ایجاد شده در پایگاه داده.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Allows referencing the complex query just like a physical table.'
                          : 'امکان فراخوانی و کوئری‌زدن روی پرس‌وجوی پیچیده همانند یک جدول فیزیکی را فراهم می‌کند.'
                      }
                      practicalExample="v_active_users, view_monthly_sales_summary"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                  <input
                    type="text"
                    value={viewName}
                    onChange={(e) => setViewName(e.target.value)}
                    placeholder="v_recent_orders"
                    className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-purple-500'
                        : 'bg-white/5 border-white/10 focus:border-purple-400'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold">{isEn ? 'Security Type' : 'زمینه امنیتی (Security Type)'}</label>
                    <FieldInfoTooltip
                      title={isEn ? 'SQL Security' : 'زمینه امنیتی نما'}
                      whatIsIt={
                        isEn
                          ? 'Specifies whether view runs with DEFINER or INVOKER privileges.'
                          : 'مشخص می‌کند که نما با دسترسی‌های مالک (DEFINER) اجرا شود یا کاربر فراخواننده (INVOKER).'
                      }
                      whyNeeded={
                        isEn
                          ? 'Ensures strict access control on underlying base tables.'
                          : 'کنترل دقیق سطح دسترسی به داده‌های زیربنایی جدول‌ها را تضمین می‌کند.'
                      }
                      practicalExample="DEFINER (default), INVOKER"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                  <select
                    value={viewSecurityType}
                    onChange={(e) => setViewSecurityType(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-purple-500'
                        : 'bg-white/5 border-white/10 focus:border-purple-400'
                    }`}
                  >
                    <option value="DEFINER">DEFINER ({isEn ? 'Run with owner privileges' : 'اجرا با دسترسی مالک'})</option>
                    <option value="INVOKER">INVOKER ({isEn ? 'Run with caller privileges' : 'اجرا با دسترسی فراخواننده'})</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="viewOrReplace"
                    checked={viewOrReplace}
                    onChange={(e) => setViewOrReplace(e.target.checked)}
                    className="rounded border-slate-400 text-purple-600 focus:ring-purple-500"
                  />
                  <label htmlFor="viewOrReplace" className="text-xs font-medium cursor-pointer">
                    {isEn ? 'OR REPLACE (Overwrite existing view)' : 'جایگزینی در صورت وجود (OR REPLACE)'}
                  </label>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'Check Option (for Updatable Views)' : 'بررسی محدودیت‌های به‌روزرسانی (Check Option)'}
                  </label>
                  <select
                    value={viewCheckOption}
                    onChange={(e) => setViewCheckOption(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-purple-500'
                        : 'bg-white/5 border-white/10 focus:border-purple-400'
                    }`}
                  >
                    <option value="NONE">NONE</option>
                    <option value="CASCADED">CASCADED</option>
                    <option value="LOCAL">LOCAL</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold">
                    {isEn ? 'SELECT Query Definition' : 'عبارت پرس‌وجوی نما (SELECT Query)'} <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">AS SELECT ...</span>
                </div>
                <textarea
                  value={viewQuery}
                  onChange={(e) => setViewQuery(e.target.value)}
                  rows={6}
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-purple-500'
                      : 'bg-black/30 border-white/10 focus:border-purple-400'
                  }`}
                  placeholder="SELECT id, name, created_at FROM users WHERE status = 'active'"
                />
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* MODE: CREATE STORED PROCEDURE                                */}
          {/* ------------------------------------------------------------ */}
          {mode === 'create_procedure' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'Procedure Name' : 'نام رویه ذخیره‌شده'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={procedureName}
                    onChange={(e) => setProcedureName(e.target.value)}
                    placeholder="sp_calculate_totals"
                    className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-emerald-500'
                        : 'bg-white/5 border-white/10 focus:border-emerald-400'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{isEn ? 'Comment / Description' : 'توضیحات رویه'}</label>
                  <input
                    type="text"
                    value={procedureComment}
                    onChange={(e) => setProcedureComment(e.target.value)}
                    placeholder={isEn ? 'Monthly reconciliation routine' : 'رویه تسویه ماهانه'}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-emerald-500'
                        : 'bg-white/5 border-white/10 focus:border-emerald-400'
                    }`}
                  />
                </div>
              </div>

              {/* Routine Parameters builder */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isEn ? 'Routine Parameters' : 'پارامترهای ورودی و خروجی رویه'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setProcedureParams([
                        ...procedureParams,
                        { mode: 'IN', name: `p_arg${procedureParams.length + 1}`, dataType: 'VARCHAR', length: '255' },
                      ])
                    }
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition font-bold"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{isEn ? 'Add Parameter' : 'افزودن پارامتر'}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {procedureParams.map((param, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-wrap items-center gap-2 p-2.5 rounded-xl border text-xs ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <select
                        value={param.mode || 'IN'}
                        onChange={(e) => {
                          const updated = [...procedureParams];
                          updated[idx].mode = e.target.value as any;
                          setProcedureParams(updated);
                        }}
                        className={`px-2 py-1.5 rounded-lg border font-bold text-[11px] focus:outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-white/10 text-emerald-300'
                        }`}
                      >
                        <option value="IN">IN</option>
                        <option value="OUT">OUT</option>
                        <option value="INOUT">INOUT</option>
                      </select>

                      <input
                        type="text"
                        placeholder="param_name"
                        value={param.name}
                        onChange={(e) => {
                          const updated = [...procedureParams];
                          updated[idx].name = e.target.value;
                          setProcedureParams(updated);
                        }}
                        className={`flex-1 min-w-[120px] px-2.5 py-1.5 rounded-lg border font-mono text-xs focus:outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-white/10'
                        }`}
                      />

                      <select
                        value={param.dataType}
                        onChange={(e) => {
                          const updated = [...procedureParams];
                          updated[idx].dataType = e.target.value;
                          setProcedureParams(updated);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-white/10 text-cyan-300'
                        }`}
                      >
                        {COMMON_SQL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        placeholder={isEn ? 'len (e.g. 255)' : 'طول'}
                        value={param.length || ''}
                        onChange={(e) => {
                          const updated = [...procedureParams];
                          updated[idx].length = e.target.value;
                          setProcedureParams(updated);
                        }}
                        className={`w-20 px-2.5 py-1.5 rounded-lg border font-mono text-xs focus:outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-white/10'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => setProcedureParams(procedureParams.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {procedureParams.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-400 border border-dashed rounded-xl border-white/10">
                      {isEn ? 'No parameters defined (Procedure takes no arguments).' : 'رویه بدون پارامتر تعریف شده است.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="procDeterministic"
                    checked={procedureDeterministic}
                    onChange={(e) => setProcedureDeterministic(e.target.checked)}
                    className="rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="procDeterministic" className="text-xs font-medium cursor-pointer">
                    {isEn ? 'DETERMINISTIC (Produces same result for same input)' : 'تکرارپذیر (DETERMINISTIC)'}
                  </label>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{isEn ? 'Security Type' : 'زمینه امنیتی'}</label>
                  <select
                    value={procedureSecurity}
                    onChange={(e) => setProcedureSecurity(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-emerald-500'
                        : 'bg-white/5 border-white/10 focus:border-emerald-400'
                    }`}
                  >
                    <option value="DEFINER">DEFINER</option>
                    <option value="INVOKER">INVOKER</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">
                  {isEn ? 'Procedure Body (SQL Statement)' : 'بدنه رویه (BEGIN ... END)'} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={procedureBody}
                  onChange={(e) => setProcedureBody(e.target.value)}
                  rows={8}
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-emerald-500'
                      : 'bg-black/30 border-white/10 focus:border-emerald-400'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* MODE: EXECUTE / CALL STORED PROCEDURE                        */}
          {/* ------------------------------------------------------------ */}
          {mode === 'execute_procedure' && (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-xl border ${
                  isLightMode ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-500/5 border-emerald-500/20'
                }`}
              >
                <p className="text-xs text-emerald-400 font-bold mb-1">
                  {isEn ? `Calling Procedure: ${targetName}` : `فراخوانی رویه: ${targetName}`}
                </p>
                <p className="text-[11px] text-slate-400">
                  {isEn
                    ? 'Supply the input values for parameters below and execute to inspect returned result sets and out-parameters.'
                    : 'مقادیر ورودی پارامترها را وارد کرده و جهت دریافت و بررسی نتایج، دکمه اجرا را بزنید.'}
                </p>
              </div>

              {procedureParams.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300">{isEn ? 'Parameter Inputs' : 'مقادیر ورودی پارامترها'}:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {procedureParams.map((p, idx) => (
                      <div key={idx} className="space-y-1">
                        <label className="text-[11px] font-mono flex items-center justify-between">
                          <span className="font-bold text-slate-300">{p.name}</span>
                          <span className="text-[10px] text-cyan-400">
                            {p.mode || 'IN'} {p.dataType}
                          </span>
                        </label>
                        <input
                          type="text"
                          value={executeParamValues[p.name] ?? ''}
                          onChange={(e) =>
                            setExecuteParamValues({
                              ...executeParamValues,
                              [p.name]: e.target.value,
                            })
                          }
                          placeholder={isEn ? 'Enter value...' : 'مقدار...'}
                          className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                            isLightMode
                              ? 'bg-white border-slate-300 focus:border-emerald-500'
                              : 'bg-white/5 border-white/10 focus:border-emerald-400'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  {isEn ? 'Procedure takes no parameters.' : 'این رویه هیچ پارامتری دریافت نمی‌کند.'}
                </p>
              )}

              {/* Execution Results View */}
              {executionResult && (
                <div className="mt-4 space-y-3 pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isEn ? 'Execution Result' : 'نتیجه اجرای رویه'}</span>
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                      {executionResult.executionTimeMs} ms
                    </span>
                  </div>

                  {executionResult.resultSets && executionResult.resultSets.length > 0 ? (
                    executionResult.resultSets.map((rs, rsIdx) => (
                      <div key={rsIdx} className="rounded-xl border border-white/10 overflow-hidden text-xs">
                        <div
                          className={`px-3 py-1.5 text-[11px] font-mono border-b ${
                            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-black/30 border-white/10 text-slate-400'
                          }`}
                        >
                          {isEn ? `Result Set #${rsIdx + 1} (${rs.rows.length} rows)` : `مجموعه نتایج شماره ${rsIdx + 1} (${rs.rows.length} ردیف)`}
                        </div>
                        <div className="max-h-60 overflow-auto">
                          <table className="w-full text-left font-mono">
                            <thead className={isLightMode ? 'bg-slate-200' : 'bg-white/5'}>
                              <tr>
                                {rs.columns.map((c) => (
                                  <th key={c} className="p-2 border-b border-white/5 font-semibold text-slate-300">
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {rs.rows.map((row, rIdx) => (
                                <tr key={rIdx} className={isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'}>
                                  {rs.columns.map((c) => (
                                    <td key={c} className="p-2 text-slate-200 truncate max-w-xs">
                                      {row[c] !== null && row[c] !== undefined ? String(row[c]) : <span className="text-slate-500">NULL</span>}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 rounded-xl text-center text-xs text-slate-400 border border-white/10 bg-white/5">
                      {isEn
                        ? 'Procedure executed successfully with no returned result sets.'
                        : 'رویه با موفقیت اجرا گردید و هیچ مجموعه ردیفی برنگرداند.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* MODE: CREATE FUNCTION                                        */}
          {/* ------------------------------------------------------------ */}
          {mode === 'create_function' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'Function Name' : 'نام تابع'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={functionName}
                    onChange={(e) => setFunctionName(e.target.value)}
                    placeholder="fn_format_currency"
                    className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-amber-500'
                        : 'bg-white/5 border-white/10 focus:border-amber-400'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'Returns Type' : 'نوع داده بازگشتی (RETURNS)'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={functionReturnType}
                    onChange={(e) => setFunctionReturnType(e.target.value)}
                    placeholder="VARCHAR(255) / INT / DECIMAL(10,2)"
                    className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-amber-500'
                        : 'bg-white/5 border-white/10 focus:border-amber-400'
                    }`}
                  />
                </div>
              </div>

              {/* Function Parameters */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isEn ? 'Function Arguments' : 'آرگومان‌های ورودی تابع'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFunctionParams([
                        ...functionParams,
                        { name: `arg_${functionParams.length + 1}`, dataType: 'INT', length: '' },
                      ])
                    }
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition font-bold"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{isEn ? 'Add Argument' : 'افزودن آرگومان'}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {functionParams.map((param, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-wrap items-center gap-2 p-2.5 rounded-xl border text-xs ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <input
                        type="text"
                        placeholder="arg_name"
                        value={param.name}
                        onChange={(e) => {
                          const updated = [...functionParams];
                          updated[idx].name = e.target.value;
                          setFunctionParams(updated);
                        }}
                        className={`flex-1 min-w-[120px] px-2.5 py-1.5 rounded-lg border font-mono text-xs focus:outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-white/10'
                        }`}
                      />

                      <select
                        value={param.dataType}
                        onChange={(e) => {
                          const updated = [...functionParams];
                          updated[idx].dataType = e.target.value;
                          setFunctionParams(updated);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-white/10 text-cyan-300'
                        }`}
                      >
                        {COMMON_SQL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        placeholder={isEn ? 'len' : 'طول'}
                        value={param.length || ''}
                        onChange={(e) => {
                          const updated = [...functionParams];
                          updated[idx].length = e.target.value;
                          setFunctionParams(updated);
                        }}
                        className={`w-20 px-2.5 py-1.5 rounded-lg border font-mono text-xs focus:outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-white/10'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => setFunctionParams(functionParams.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="funcDeterministic"
                    checked={functionDeterministic}
                    onChange={(e) => setFunctionDeterministic(e.target.checked)}
                    className="rounded border-slate-400 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="funcDeterministic" className="text-xs font-medium cursor-pointer">
                    {isEn ? 'DETERMINISTIC (Required for many functional indices)' : 'تکرارپذیر (DETERMINISTIC)'}
                  </label>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{isEn ? 'Security Type' : 'زمینه امنیتی'}</label>
                  <select
                    value={functionSecurity}
                    onChange={(e) => setFunctionSecurity(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-amber-500'
                        : 'bg-white/5 border-white/10 focus:border-amber-400'
                    }`}
                  >
                    <option value="DEFINER">DEFINER</option>
                    <option value="INVOKER">INVOKER</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">
                  {isEn ? 'Function Body (Must include RETURN statement)' : 'بدنه تابع (شامل عبارت RETURN)'} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={functionBody}
                  onChange={(e) => setFunctionBody(e.target.value)}
                  rows={8}
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-amber-500'
                      : 'bg-black/30 border-white/10 focus:border-amber-400'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* MODE: CREATE TRIGGER                                         */}
          {/* ------------------------------------------------------------ */}
          {mode === 'create_trigger' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'Trigger Name' : 'نام تریگر'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={triggerName}
                    onChange={(e) => setTriggerName(e.target.value)}
                    placeholder="trg_audit_user_update"
                    className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-rose-500'
                        : 'bg-white/5 border-white/10 focus:border-rose-400'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'Target Table' : 'جدول هدف'} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={triggerTableName}
                    onChange={(e) => setTriggerTableName(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-rose-500'
                        : 'bg-white/5 border-white/10 focus:border-rose-400'
                    }`}
                  >
                    {existingTables.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold block mb-1">{isEn ? 'Timing' : 'زمان اجرا (Timing)'}</label>
                  <select
                    value={triggerTiming}
                    onChange={(e) => setTriggerTiming(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-rose-500'
                        : 'bg-white/5 border-white/10 focus:border-rose-400'
                    }`}
                  >
                    <option value="BEFORE">BEFORE ({isEn ? 'Before table event' : 'پیش از اعمال رویداد'})</option>
                    <option value="AFTER">AFTER ({isEn ? 'After table event' : 'پس از اعمال رویداد'})</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{isEn ? 'Event Trigger' : 'نوع رویداد'}</label>
                  <select
                    value={triggerEvent}
                    onChange={(e) => setTriggerEvent(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-rose-500'
                        : 'bg-white/5 border-white/10 focus:border-rose-400'
                    }`}
                  >
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">
                  {isEn ? 'Trigger Logic (FOR EACH ROW ...)' : 'منطق اجرایی تریگر (BEGIN ... END)'} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={triggerStatement}
                  onChange={(e) => setTriggerStatement(e.target.value)}
                  rows={8}
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-rose-500'
                      : 'bg-black/30 border-white/10 focus:border-rose-400'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* MODE: CREATE SCHEDULED EVENT                                 */}
          {/* ------------------------------------------------------------ */}
          {mode === 'create_event' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'Event Name' : 'نام رویداد'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="ev_daily_cleanup"
                    className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-blue-500'
                        : 'bg-white/5 border-white/10 focus:border-blue-400'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">{isEn ? 'Schedule Type' : 'نوع زمان‌بندی'}</label>
                  <select
                    value={eventScheduleType}
                    onChange={(e) => setEventScheduleType(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-blue-500'
                        : 'bg-white/5 border-white/10 focus:border-blue-400'
                    }`}
                  >
                    <option value="EVERY">{isEn ? 'Recurring Interval (EVERY)' : 'تکرارشونده در فواصل معین (EVERY)'}</option>
                    <option value="AT">{isEn ? 'One-time Execution (AT)' : 'یک‌باره در زمان مشخص (AT)'}</option>
                  </select>
                </div>
              </div>

              {eventScheduleType === 'EVERY' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{isEn ? 'Interval Value' : 'میزان فاصله زمانی'}</label>
                    <input
                      type="number"
                      min={1}
                      value={eventIntervalValue}
                      onChange={(e) => setEventIntervalValue(Number(e.target.value))}
                      className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                        isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold block mb-1">{isEn ? 'Interval Unit' : 'واحد زمانی'}</label>
                    <select
                      value={eventIntervalField}
                      onChange={(e) => setEventIntervalField(e.target.value as any)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                        isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
                      }`}
                    >
                      <option value="SECOND">{isEn ? 'SECONDS' : 'ثانیه'}</option>
                      <option value="MINUTE">{isEn ? 'MINUTES' : 'دقیقه'}</option>
                      <option value="HOUR">{isEn ? 'HOURS' : 'ساعت'}</option>
                      <option value="DAY">{isEn ? 'DAYS' : 'روز'}</option>
                      <option value="WEEK">{isEn ? 'WEEKS' : 'هفته'}</option>
                      <option value="MONTH">{isEn ? 'MONTHS' : 'ماه'}</option>
                      <option value="YEAR">{isEn ? 'YEARS' : 'سال'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold block mb-1">{isEn ? 'Initial Status' : 'وضعیت اولیه'}</label>
                    <select
                      value={eventStatus}
                      onChange={(e) => setEventStatus(e.target.value as any)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border transition focus:outline-none ${
                        isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
                      }`}
                    >
                      <option value="ENABLE">ENABLE ({isEn ? 'Active' : 'فعال'})</option>
                      <option value="DISABLE">DISABLE ({isEn ? 'Disabled' : 'غیرفعال'})</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'Execute At Timestamp (YYYY-MM-DD HH:MM:SS)' : 'زمان دقیق اجرا'}
                  </label>
                  <input
                    type="text"
                    value={eventExecuteAt}
                    onChange={(e) => setEventExecuteAt(e.target.value)}
                    placeholder="2026-10-01 03:00:00"
                    className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                    }`}
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold block mb-1">
                  {isEn ? 'Event Task Body (SQL Action)' : 'دستور اجرایی رویداد (DO ...)'} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={eventStatement}
                  onChange={(e) => setEventStatement(e.target.value)}
                  rows={6}
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-blue-500'
                      : 'bg-black/30 border-white/10 focus:border-blue-400'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* MODES: DROP CONFIRMATIONS (DESTRUCTIVE 2-STEP CONFIRM)        */}
          {/* ------------------------------------------------------------ */}
          {isDestructive && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl flex items-start gap-3 border ${
                  isLightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-500/10 border-rose-500/30'
                }`}
              >
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-rose-500">
                    {isEn ? 'Warning: Destructive DDL Action' : 'هشدار: عملیات تخریبی و برگشت‌ناپذیر'}
                  </p>
                  <p className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                    {isEn
                      ? `You are about to permanently drop ${targetName} from database ${databaseName}. This cannot be undone.`
                      : `شما در حال حذف کامل شیء «${targetName}» از پایگاه داده «${databaseName}» هستید. این عملیات غیرقابل بازگشت است.`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dropIfExists"
                  checked={dropIfExists}
                  onChange={(e) => setDropIfExists(e.target.checked)}
                  className="rounded border-slate-400 text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="dropIfExists" className="text-xs font-medium cursor-pointer">
                  {isEn ? 'Use IF EXISTS (prevents error if object does not exist)' : 'استفاده از IF EXISTS (جلوگیری از خطا در صورت عدم وجود شیء)'}
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold block">
                  {isEn ? `Type "${targetName}" to confirm deletion:` : `جهت تایید، عبارت «${targetName}» را وارد کنید:`}
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={targetName}
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-rose-500'
                      : 'bg-white/5 border-white/10 focus:border-rose-500'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* LIVE SQL PREVIEW ACCORDION                                   */}
          {/* ============================================================ */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'Live SQL Dialect Preview' : 'پیش‌نمایش زنده دستور SQL'}</span>
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 transition font-mono"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">{isEn ? 'Copied' : 'کپی شد'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>{isEn ? 'Copy' : 'کپی دستور'}</span>
                  </>
                )}
              </button>
            </div>
            <pre
              className={`p-3 rounded-xl border font-mono text-[11px] overflow-x-auto whitespace-pre-wrap ${
                isLightMode ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-black/40 border-white/5 text-cyan-200'
              }`}
            >
              {generatedSql}
            </pre>
          </div>
        </div>

        {/* ============================================================ */}
        {/* MODAL FOOTER ACTIONS                                         */}
        {/* ============================================================ */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-white/10'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              isLightMode
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                : 'bg-white/5 hover:bg-white/10 text-slate-300'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExecute}
              disabled={loading || !canConfirmDrop}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                isDestructive
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                  : 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-cyan-900/30'
              }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Executing...' : 'در حال اجرا...'}</span>
                </>
              ) : mode === 'execute_procedure' ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Execute Procedure' : 'اجرای رویه'}</span>
                </>
              ) : isDestructive ? (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Confirm Drop' : 'تایید و حذف'}</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Execute & Create' : 'ایجاد و اجرا'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
