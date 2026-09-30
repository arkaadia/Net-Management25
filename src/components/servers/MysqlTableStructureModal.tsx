import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Table,
  Plus,
  Trash2,
  Edit,
  Pencil,
  Key,
  Shield,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Code,
  ArrowRight,
  Database,
  Layers,
  Settings,
  HelpCircle,
  Eye,
  RefreshCw,
  Hash,
  Link2,
  Sparkles,
} from 'lucide-react';
import {
  MysqlTableColumnDefinition,
  MysqlCreateTableRequest,
  MysqlRenameTableRequest,
  MysqlAlterTableOptionsRequest,
  MysqlDropTableRequest,
  MysqlTruncateTableRequest,
  MysqlAddColumnRequest,
  MysqlModifyColumnRequest,
  MysqlRenameColumnRequest,
  MysqlDropColumnRequest,
  MysqlCreateIndexRequest,
  MysqlDropIndexRequest,
  MysqlAddForeignKeyRequest,
  MysqlDropForeignKeyRequest,
  MysqlManagePrimaryKeyRequest,
  MysqlColumnStructure,
  MysqlIndexDetail,
  MysqlForeignKeyConstraint,
  MysqlTableMetadataStats,
  MysqlDdlOperationResult,
} from '../../types';
import {
  createRemoteServerMysqlTable,
  renameRemoteServerMysqlTable,
  alterRemoteServerMysqlTableOptions,
  dropRemoteServerMysqlTable,
  truncateRemoteServerMysqlTable,
  addRemoteServerMysqlColumn,
  modifyRemoteServerMysqlColumn,
  renameRemoteServerMysqlColumn,
  dropRemoteServerMysqlColumn,
  createRemoteServerMysqlIndex,
  dropRemoteServerMysqlIndex,
  addRemoteServerMysqlForeignKey,
  dropRemoteServerMysqlForeignKey,
  manageRemoteServerMysqlPrimaryKey,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export type MysqlTableStructureModalMode =
  | 'create_table'
  | 'alter_table'
  | 'add_column'
  | 'modify_column'
  | 'rename_column'
  | 'create_index'
  | 'add_foreign_key'
  | 'manage_primary_key'
  | 'drop_confirm';

export type MysqlDropTargetType = 'table' | 'truncate_table' | 'column' | 'index' | 'foreign_key';

export interface MysqlTableStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  serverId: string;
  serverName: string;
  databaseName: string;
  tableName?: string;
  mode: MysqlTableStructureModalMode;
  // Context data
  existingColumns?: MysqlColumnStructure[];
  existingIndexes?: MysqlIndexDetail[];
  existingForeignKeys?: MysqlForeignKeyConstraint[];
  existingTables?: string[];
  tableMetadata?: MysqlTableMetadataStats | null;
  // Specific targets for edit/drop
  targetColumn?: MysqlColumnStructure | null;
  targetIndex?: MysqlIndexDetail | null;
  targetForeignKey?: MysqlForeignKeyConstraint | null;
  dropTargetType?: MysqlDropTargetType;
  // Callbacks
  onSuccess: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

const COMMON_DATA_TYPES = [
  'INT',
  'BIGINT',
  'TINYINT',
  'SMALLINT',
  'VARCHAR',
  'CHAR',
  'TEXT',
  'MEDIUMTEXT',
  'LONGTEXT',
  'DECIMAL',
  'FLOAT',
  'DOUBLE',
  'DATETIME',
  'TIMESTAMP',
  'DATE',
  'TIME',
  'BOOLEAN',
  'JSON',
  'ENUM',
  'BLOB',
];

const MYSQL_ENGINES = ['InnoDB', 'MyISAM', 'MEMORY', 'CSV', 'ARCHIVE'];
const MYSQL_CHARSETS = ['utf8mb4', 'utf8mb3', 'latin1', 'ascii', 'binary'];
const MYSQL_COLLATIONS = ['utf8mb4_unicode_ci', 'utf8mb4_general_ci', 'utf8mb4_0900_ai_ci', 'latin1_swedish_ci'];

export const MysqlTableStructureModal: React.FC<MysqlTableStructureModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  serverId,
  serverName,
  databaseName,
  tableName = '',
  mode,
  existingColumns = [],
  existingIndexes = [],
  existingForeignKeys = [],
  existingTables = [],
  tableMetadata,
  targetColumn,
  targetIndex,
  targetForeignKey,
  dropTargetType = 'table',
  onSuccess,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSqlPreview, setShowSqlPreview] = useState(true);
  const [copiedSql, setCopiedSql] = useState(false);

  // Mode: create_table
  const [newTableName, setNewTableName] = useState('');
  const [tableEngine, setTableEngine] = useState('InnoDB');
  const [tableCharset, setTableCharset] = useState('utf8mb4');
  const [tableCollation, setTableCollation] = useState('utf8mb4_unicode_ci');
  const [tableComment, setTableComment] = useState('');
  const [tableColumns, setTableColumns] = useState<MysqlTableColumnDefinition[]>([
    {
      name: 'id',
      dataType: 'BIGINT',
      unsigned: true,
      nullable: false,
      autoIncrement: true,
      primaryKey: true,
      comment: '',
    },
    {
      name: 'created_at',
      dataType: 'DATETIME',
      nullable: false,
      isDefaultCurrentTimestamp: true,
      comment: '',
    },
  ]);

  // Mode: alter_table
  const [renamedTableName, setRenamedTableName] = useState('');
  const [alterEngine, setAlterEngine] = useState('InnoDB');
  const [alterCharset, setAlterCharset] = useState('utf8mb4');
  const [alterCollation, setAlterCollation] = useState('utf8mb4_unicode_ci');
  const [alterComment, setAlterComment] = useState('');
  const [alterAutoIncrement, setAlterAutoIncrement] = useState<string>('');

  // Mode: add_column / modify_column
  const [colName, setColName] = useState('');
  const [colType, setColType] = useState('VARCHAR');
  const [colLength, setColLength] = useState('255');
  const [colUnsigned, setColUnsigned] = useState(false);
  const [colNullable, setColNullable] = useState(true);
  const [colDefaultMode, setColDefaultMode] = useState<'none' | 'null' | 'timestamp' | 'custom'>('none');
  const [colDefaultVal, setColDefaultVal] = useState('');
  const [colAutoInc, setColAutoInc] = useState(false);
  const [colComment, setColComment] = useState('');
  const [colPosition, setColPosition] = useState<'DEFAULT' | 'FIRST' | 'AFTER'>('DEFAULT');
  const [colAfterTarget, setColAfterTarget] = useState('');

  // Mode: rename_column
  const [newColName, setNewColName] = useState('');

  // Mode: create_index
  const [idxName, setIdxName] = useState('');
  const [idxType, setIdxType] = useState<'INDEX' | 'UNIQUE' | 'FULLTEXT' | 'SPATIAL'>('INDEX');
  const [idxMethod, setIdxMethod] = useState<'BTREE' | 'HASH'>('BTREE');
  const [idxSelectedColumns, setIdxSelectedColumns] = useState<Array<{ name: string; length?: number; order?: 'ASC' | 'DESC' }>>([]);
  const [idxComment, setIdxComment] = useState('');

  // Mode: add_foreign_key
  const [fkName, setFkName] = useState('');
  const [fkColumn, setFkColumn] = useState('');
  const [fkRefTable, setFkRefTable] = useState('');
  const [fkRefColumn, setFkRefColumn] = useState('');
  const [fkOnUpdate, setFkOnUpdate] = useState<'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'>('RESTRICT');
  const [fkOnDelete, setFkOnDelete] = useState<'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'>('RESTRICT');

  // Mode: manage_primary_key
  const [selectedPkColumns, setSelectedPkColumns] = useState<string[]>([]);

  // Mode: drop_confirm
  const [confirmInput, setConfirmInput] = useState('');

  // Initialize states based on active mode
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setCopiedSql(false);
    setConfirmInput('');

    if (mode === 'create_table') {
      setNewTableName('');
      setTableEngine('InnoDB');
      setTableCharset('utf8mb4');
      setTableCollation('utf8mb4_unicode_ci');
      setTableComment('');
      setTableColumns([
        {
          name: 'id',
          dataType: 'BIGINT',
          unsigned: true,
          nullable: false,
          autoIncrement: true,
          primaryKey: true,
          comment: '',
        },
        {
          name: 'name',
          dataType: 'VARCHAR',
          length: '255',
          nullable: false,
          comment: '',
        },
        {
          name: 'created_at',
          dataType: 'DATETIME',
          nullable: false,
          isDefaultCurrentTimestamp: true,
          comment: '',
        },
      ]);
    } else if (mode === 'alter_table') {
      setRenamedTableName(tableName);
      setAlterEngine(tableMetadata?.engine || 'InnoDB');
      setAlterCharset(tableMetadata?.collation?.split('_')[0] || 'utf8mb4');
      setAlterCollation(tableMetadata?.collation || 'utf8mb4_unicode_ci');
      setAlterComment(tableMetadata?.comment || '');
      setAlterAutoIncrement(tableMetadata?.autoIncrementNext ? String(tableMetadata.autoIncrementNext) : '');
    } else if (mode === 'add_column') {
      setColName('');
      setColType('VARCHAR');
      setColLength('255');
      setColUnsigned(false);
      setColNullable(true);
      setColDefaultMode('none');
      setColDefaultVal('');
      setColAutoInc(false);
      setColComment('');
      setColPosition('DEFAULT');
      setColAfterTarget(existingColumns[existingColumns.length - 1]?.name || '');
    } else if (mode === 'modify_column' && targetColumn) {
      setColName(targetColumn.name);
      setColType(targetColumn.dataType.toUpperCase());
      const lengthMatch = targetColumn.columnType.match(/\(([^)]+)\)/);
      setColLength(lengthMatch ? lengthMatch[1] : '');
      setColUnsigned(targetColumn.columnType.toLowerCase().includes('unsigned'));
      setColNullable(targetColumn.isNullable);
      if (targetColumn.columnDefault === null && targetColumn.isNullable) {
        setColDefaultMode('null');
        setColDefaultVal('');
      } else if (targetColumn.columnDefault && targetColumn.columnDefault.includes('CURRENT_TIMESTAMP')) {
        setColDefaultMode('timestamp');
        setColDefaultVal('');
      } else if (targetColumn.columnDefault !== null && targetColumn.columnDefault !== undefined) {
        setColDefaultMode('custom');
        setColDefaultVal(targetColumn.columnDefault);
      } else {
        setColDefaultMode('none');
        setColDefaultVal('');
      }
      setColAutoInc(targetColumn.extra.toLowerCase().includes('auto_increment'));
      setColComment(targetColumn.comment || '');
      setColPosition('DEFAULT');
      setColAfterTarget('');
    } else if (mode === 'rename_column' && targetColumn) {
      setNewColName(targetColumn.name);
    } else if (mode === 'create_index') {
      setIdxName(`idx_${tableName}_${existingColumns[0]?.name || 'col'}`);
      setIdxType('INDEX');
      setIdxMethod('BTREE');
      setIdxSelectedColumns(existingColumns[0] ? [{ name: existingColumns[0].name, order: 'ASC' }] : []);
      setIdxComment('');
    } else if (mode === 'add_foreign_key') {
      const defaultCol = existingColumns[0]?.name || '';
      const otherTables = existingTables.filter((t) => t !== tableName);
      const targetTbl = otherTables[0] || '';
      setFkName(`fk_${tableName}_${defaultCol || 'target'}`);
      setFkColumn(defaultCol);
      setFkRefTable(targetTbl);
      setFkRefColumn('id');
      setFkOnUpdate('RESTRICT');
      setFkOnDelete('RESTRICT');
    } else if (mode === 'manage_primary_key') {
      const currentPks = existingColumns.filter((c) => c.isPrimaryKey).map((c) => c.name);
      setSelectedPkColumns(currentPks);
    }
  }, [isOpen, mode, tableName, tableMetadata, targetColumn, existingColumns, existingTables]);

  // Compute live SQL Preview
  const computedSqlPreview = useMemo(() => {
    try {
      const escape = (str: string) => `\`${(str || '').replace(/`/g, '``')}\``;

      if (mode === 'create_table') {
        const tbl = newTableName.trim() || 'new_table';
        const colsSql = tableColumns.map((col) => {
          let line = `  ${escape(col.name || 'col')} ${(col.dataType || 'VARCHAR').toUpperCase()}`;
          if (col.length && col.length.trim()) line += `(${col.length.trim()})`;
          if (col.unsigned) line += ' UNSIGNED';
          line += col.nullable ? ' NULL' : ' NOT NULL';
          if (col.isDefaultNull) line += ' DEFAULT NULL';
          else if (col.isDefaultCurrentTimestamp) line += ' DEFAULT CURRENT_TIMESTAMP';
          else if (col.defaultValue) line += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
          if (col.autoIncrement) line += ' AUTO_INCREMENT';
          if (col.comment) line += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
          return line;
        });
        const pks = tableColumns.filter((c) => c.primaryKey && c.name.trim()).map((c) => escape(c.name));
        if (pks.length > 0) {
          colsSql.push(`  PRIMARY KEY (${pks.join(', ')})`);
        }
        const commentSql = tableComment ? ` COMMENT='${tableComment.replace(/'/g, "''")}'` : '';
        return `CREATE TABLE ${escape(databaseName)}.${escape(tbl)} (\n${colsSql.join(',\n')}\n) ENGINE=${tableEngine} DEFAULT CHARSET=${tableCharset} COLLATE=${tableCollation}${commentSql};`;
      }

      if (mode === 'alter_table') {
        const statements: string[] = [];
        if (renamedTableName.trim() && renamedTableName.trim() !== tableName) {
          statements.push(`RENAME TABLE ${escape(databaseName)}.${escape(tableName)} TO ${escape(databaseName)}.${escape(renamedTableName.trim())};`);
        }
        const opts: string[] = [];
        if (alterEngine) opts.push(`ENGINE = ${alterEngine}`);
        if (alterCharset) opts.push(`CONVERT TO CHARACTER SET ${alterCharset}`);
        if (alterCollation) opts.push(`COLLATE ${alterCollation}`);
        if (alterComment) opts.push(`COMMENT = '${alterComment.replace(/'/g, "''")}'`);
        if (alterAutoIncrement) opts.push(`AUTO_INCREMENT = ${alterAutoIncrement}`);
        if (opts.length > 0) {
          const targetName = renamedTableName.trim() || tableName;
          statements.push(`ALTER TABLE ${escape(databaseName)}.${escape(targetName)} ${opts.join(', ')};`);
        }
        return statements.join('\n') || '-- No changes detected';
      }

      if (mode === 'add_column' || mode === 'modify_column') {
        const verb = mode === 'add_column' ? 'ADD COLUMN' : 'MODIFY COLUMN';
        let def = `${escape(colName.trim() || 'new_column')} ${colType.toUpperCase()}`;
        if (colLength && colLength.trim()) def += `(${colLength.trim()})`;
        if (colUnsigned) def += ' UNSIGNED';
        def += colNullable ? ' NULL' : ' NOT NULL';
        if (colDefaultMode === 'null') def += ' DEFAULT NULL';
        else if (colDefaultMode === 'timestamp') def += ' DEFAULT CURRENT_TIMESTAMP';
        else if (colDefaultMode === 'custom' && colDefaultVal.trim()) def += ` DEFAULT '${colDefaultVal.replace(/'/g, "''")}'`;
        if (colAutoInc) def += ' AUTO_INCREMENT';
        if (colComment) def += ` COMMENT '${colComment.replace(/'/g, "''")}'`;

        let pos = '';
        if (colPosition === 'FIRST') pos = ' FIRST';
        else if (colPosition === 'AFTER' && colAfterTarget) pos = ` AFTER ${escape(colAfterTarget)}`;

        return `ALTER TABLE ${escape(databaseName)}.${escape(tableName)} ${verb} ${def}${pos};`;
      }

      if (mode === 'rename_column' && targetColumn) {
        return `ALTER TABLE ${escape(databaseName)}.${escape(tableName)} RENAME COLUMN ${escape(targetColumn.name)} TO ${escape(newColName.trim() || targetColumn.name)};`;
      }

      if (mode === 'create_index') {
        const indexTypePrefix = idxType === 'UNIQUE' ? 'UNIQUE ' : idxType === 'FULLTEXT' ? 'FULLTEXT ' : idxType === 'SPATIAL' ? 'SPATIAL ' : '';
        const cols = idxSelectedColumns.map((c) => {
          let s = escape(c.name);
          if (c.length) s += `(${c.length})`;
          if (c.order) s += ` ${c.order}`;
          return s;
        });
        const usingMethod = idxMethod ? ` USING ${idxMethod}` : '';
        const comment = idxComment ? ` COMMENT '${idxComment.replace(/'/g, "''")}'` : '';
        return `CREATE ${indexTypePrefix}INDEX ${escape(idxName.trim() || 'idx_name')} ON ${escape(databaseName)}.${escape(tableName)} (${cols.join(', ')})${usingMethod}${comment};`;
      }

      if (mode === 'add_foreign_key') {
        return `ALTER TABLE ${escape(databaseName)}.${escape(tableName)} ADD CONSTRAINT ${escape(fkName.trim() || 'fk_name')} FOREIGN KEY (${escape(fkColumn)}) REFERENCES ${escape(databaseName)}.${escape(fkRefTable)} (${escape(fkRefColumn)}) ON UPDATE ${fkOnUpdate} ON DELETE ${fkOnDelete};`;
      }

      if (mode === 'manage_primary_key') {
        if (selectedPkColumns.length === 0) {
          return `ALTER TABLE ${escape(databaseName)}.${escape(tableName)} DROP PRIMARY KEY;`;
        }
        return `ALTER TABLE ${escape(databaseName)}.${escape(tableName)} DROP PRIMARY KEY,\n  ADD PRIMARY KEY (${selectedPkColumns.map(escape).join(', ')});`;
      }

      if (mode === 'drop_confirm') {
        if (dropTargetType === 'table') {
          return `DROP TABLE IF EXISTS ${escape(databaseName)}.${escape(tableName)};`;
        }
        if (dropTargetType === 'truncate_table') {
          return `TRUNCATE TABLE ${escape(databaseName)}.${escape(tableName)};`;
        }
        if (dropTargetType === 'column' && targetColumn) {
          return `ALTER TABLE ${escape(databaseName)}.${escape(tableName)} DROP COLUMN ${escape(targetColumn.name)};`;
        }
        if (dropTargetType === 'index' && targetIndex) {
          return `DROP INDEX ${escape(targetIndex.name)} ON ${escape(databaseName)}.${escape(tableName)};`;
        }
        if (dropTargetType === 'foreign_key' && targetForeignKey) {
          return `ALTER TABLE ${escape(databaseName)}.${escape(tableName)} DROP FOREIGN KEY ${escape(targetForeignKey.name)};`;
        }
      }
    } catch (e: any) {
      return `-- Error constructing preview: ${e.message}`;
    }
    return '-- Ready';
  }, [
    mode,
    databaseName,
    tableName,
    newTableName,
    tableEngine,
    tableCharset,
    tableCollation,
    tableComment,
    tableColumns,
    renamedTableName,
    alterEngine,
    alterCharset,
    alterCollation,
    alterComment,
    alterAutoIncrement,
    colName,
    colType,
    colLength,
    colUnsigned,
    colNullable,
    colDefaultMode,
    colDefaultVal,
    colAutoInc,
    colComment,
    colPosition,
    colAfterTarget,
    targetColumn,
    newColName,
    idxName,
    idxType,
    idxMethod,
    idxSelectedColumns,
    idxComment,
    fkName,
    fkColumn,
    fkRefTable,
    fkRefColumn,
    fkOnUpdate,
    fkOnDelete,
    selectedPkColumns,
    dropTargetType,
    targetIndex,
    targetForeignKey,
  ]);

  if (!isOpen) return null;

  const handleCopySql = () => {
    navigator.clipboard.writeText(computedSqlPreview);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleAddTableColumnRow = () => {
    setTableColumns((prev) => [
      ...prev,
      {
        name: `column_${prev.length + 1}`,
        dataType: 'VARCHAR',
        length: '255',
        nullable: true,
        comment: '',
      },
    ]);
  };

  const handleRemoveTableColumnRow = (index: number) => {
    if (tableColumns.length <= 1) return;
    setTableColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateTableColumnRow = (index: number, updates: Partial<MysqlTableColumnDefinition>) => {
    setTableColumns((prev) => prev.map((col, i) => (i === index ? { ...col, ...updates } : col)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let res: MysqlDdlOperationResult | null = null;

      if (mode === 'create_table') {
        if (!newTableName.trim()) throw new Error(isEn ? 'Table name is required.' : 'نام جدول الزامی است.');
        res = await createRemoteServerMysqlTable(serverId, {
          database: databaseName,
          tableName: newTableName.trim(),
          engine: tableEngine,
          charset: tableCharset,
          collation: tableCollation,
          comment: tableComment.trim() || undefined,
          columns: tableColumns,
        });
      } else if (mode === 'alter_table') {
        if (renamedTableName.trim() && renamedTableName.trim() !== tableName) {
          const renameRes = await renameRemoteServerMysqlTable(serverId, {
            database: databaseName,
            oldTableName: tableName,
            newTableName: renamedTableName.trim(),
          });
          if (!renameRes.success) throw new Error(renameRes.error || renameRes.message);
        }
        res = await alterRemoteServerMysqlTableOptions(serverId, {
          database: databaseName,
          tableName: renamedTableName.trim() || tableName,
          engine: alterEngine,
          charset: alterCharset,
          collation: alterCollation,
          comment: alterComment.trim() || undefined,
          autoIncrement: alterAutoIncrement ? Number(alterAutoIncrement) : undefined,
        });
      } else if (mode === 'add_column') {
        if (!colName.trim()) throw new Error(isEn ? 'Column name is required.' : 'نام ستون الزامی است.');
        const colDef: MysqlTableColumnDefinition = {
          name: colName.trim(),
          dataType: colType,
          length: colLength.trim() || undefined,
          unsigned: colUnsigned,
          nullable: colNullable,
          isDefaultNull: colDefaultMode === 'null',
          isDefaultCurrentTimestamp: colDefaultMode === 'timestamp',
          defaultValue: colDefaultMode === 'custom' ? colDefaultVal : undefined,
          autoIncrement: colAutoInc,
          comment: colComment.trim() || undefined,
          position: colPosition === 'DEFAULT' ? undefined : colPosition,
          afterColumn: colPosition === 'AFTER' ? colAfterTarget : undefined,
        };
        res = await addRemoteServerMysqlColumn(serverId, {
          database: databaseName,
          tableName,
          column: colDef,
        });
      } else if (mode === 'modify_column') {
        if (!colName.trim()) throw new Error(isEn ? 'Column name is required.' : 'نام ستون الزامی است.');
        const colDef: MysqlTableColumnDefinition = {
          name: colName.trim(),
          dataType: colType,
          length: colLength.trim() || undefined,
          unsigned: colUnsigned,
          nullable: colNullable,
          isDefaultNull: colDefaultMode === 'null',
          isDefaultCurrentTimestamp: colDefaultMode === 'timestamp',
          defaultValue: colDefaultMode === 'custom' ? colDefaultVal : undefined,
          autoIncrement: colAutoInc,
          comment: colComment.trim() || undefined,
          position: colPosition === 'DEFAULT' ? undefined : colPosition,
          afterColumn: colPosition === 'AFTER' ? colAfterTarget : undefined,
        };
        res = await modifyRemoteServerMysqlColumn(serverId, {
          database: databaseName,
          tableName,
          column: colDef,
        });
      } else if (mode === 'rename_column' && targetColumn) {
        if (!newColName.trim()) throw new Error(isEn ? 'New column name is required.' : 'نام جدید ستون الزامی است.');
        res = await renameRemoteServerMysqlColumn(serverId, {
          database: databaseName,
          tableName,
          oldColumnName: targetColumn.name,
          newColumnName: newColName.trim(),
          columnDefinition: {
            name: newColName.trim(),
            dataType: targetColumn.dataType,
            nullable: targetColumn.isNullable,
            defaultValue: targetColumn.columnDefault || undefined,
          },
        });
      } else if (mode === 'create_index') {
        if (!idxName.trim()) throw new Error(isEn ? 'Index name is required.' : 'نام ایندکس الزامی است.');
        if (idxSelectedColumns.length === 0) throw new Error(isEn ? 'At least one column is required.' : 'انتخاب حداقل یک ستون الزامی است.');
        res = await createRemoteServerMysqlIndex(serverId, {
          database: databaseName,
          tableName,
          indexName: idxName.trim(),
          indexType: idxType,
          indexMethod: idxMethod,
          columns: idxSelectedColumns,
          comment: idxComment.trim() || undefined,
        });
      } else if (mode === 'add_foreign_key') {
        if (!fkName.trim()) throw new Error(isEn ? 'Constraint name is required.' : 'نام قید کلید خارجی الزامی است.');
        if (!fkColumn) throw new Error(isEn ? 'Local column is required.' : 'انتخاب ستون مبدا الزامی است.');
        if (!fkRefTable) throw new Error(isEn ? 'Referenced table is required.' : 'انتخاب جدول مقصد الزامی است.');
        if (!fkRefColumn) throw new Error(isEn ? 'Referenced column is required.' : 'انتخاب ستون مقصد الزامی است.');
        res = await addRemoteServerMysqlForeignKey(serverId, {
          database: databaseName,
          tableName,
          constraintName: fkName.trim(),
          column: fkColumn,
          referencedTable: fkRefTable,
          referencedColumn: fkRefColumn,
          onUpdate: fkOnUpdate,
          onDelete: fkOnDelete,
        });
      } else if (mode === 'manage_primary_key') {
        res = await manageRemoteServerMysqlPrimaryKey(serverId, {
          database: databaseName,
          tableName,
          action: selectedPkColumns.length === 0 ? 'drop' : 'add',
          columns: selectedPkColumns,
        });
      } else if (mode === 'drop_confirm') {
        const requiredWord = isEn ? 'CONFIRM' : 'تایید';
        const isMatched = confirmInput.trim().toUpperCase() === 'CONFIRM' || (!isEn && confirmInput.trim() === 'تایید');
        if (!isMatched) {
          throw new Error(isEn ? `Please type "${requiredWord}" to confirm.` : `لطفاً عبارت «${requiredWord}» را جهت تایید وارد کنید.`);
        }

        if (dropTargetType === 'table') {
          res = await dropRemoteServerMysqlTable(serverId, { database: databaseName, tableName });
        } else if (dropTargetType === 'truncate_table') {
          res = await truncateRemoteServerMysqlTable(serverId, { database: databaseName, tableName });
        } else if (dropTargetType === 'column' && targetColumn) {
          res = await dropRemoteServerMysqlColumn(serverId, { database: databaseName, tableName, columnName: targetColumn.name });
        } else if (dropTargetType === 'index' && targetIndex) {
          res = await dropRemoteServerMysqlIndex(serverId, { database: databaseName, tableName, indexName: targetIndex.name });
        } else if (dropTargetType === 'foreign_key' && targetForeignKey) {
          res = await dropRemoteServerMysqlForeignKey(serverId, { database: databaseName, tableName, constraintName: targetForeignKey.name });
        }
      }

      if (res && !res.success) {
        throw new Error(isEn ? (res.error || res.message) : (res.errorFa || res.messageFa || res.message));
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || (isEn ? 'Operation failed' : 'عملیات با خطا مواجه شد'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle = useMemo(() => {
    switch (mode) {
      case 'create_table':
        return isEn ? `Create New Table in "${databaseName}"` : `ساخت جدول جدید در پایگاه داده «${databaseName}»`;
      case 'alter_table':
        return isEn ? `Table Options & Rename: "${tableName}"` : `تنظیمات و تغییر نام جدول «${tableName}»`;
      case 'add_column':
        return isEn ? `Add Column to "${tableName}"` : `افزودن ستون به جدول «${tableName}»`;
      case 'modify_column':
        return isEn ? `Modify Column "${targetColumn?.name}" in "${tableName}"` : `ویرایش مشخصات ستون «${targetColumn?.name}» در جدول «${tableName}»`;
      case 'rename_column':
        return isEn ? `Rename Column "${targetColumn?.name}" in "${tableName}"` : `تغییر نام ستون «${targetColumn?.name}» در جدول «${tableName}»`;
      case 'create_index':
        return isEn ? `Create Index on "${tableName}"` : `ساخت ایندکس جدید بر روی جدول «${tableName}»`;
      case 'add_foreign_key':
        return isEn ? `Add Foreign Key Constraint to "${tableName}"` : `افزودن قید کلید خارجی (Foreign Key) به جدول «${tableName}»`;
      case 'manage_primary_key':
        return isEn ? `Manage Primary Key on "${tableName}"` : `مدیریت کلید اصلی (Primary Key) جدول «${tableName}»`;
      case 'drop_confirm':
        return isEn ? `Confirm Destructive Action on "${tableName}"` : `تایید عملیات حساس و تخریبی بر روی جدول «${tableName}»`;
      default:
        return isEn ? 'Table Structural Management' : 'مدیریت ساختار جدول';
    }
  }, [mode, databaseName, tableName, targetColumn, isEn]);

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 pointer-events-auto bg-black/60 backdrop-blur-xs select-none"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col rounded-2xl shadow-2xl border transition-all duration-200 overflow-hidden ${
          isMaximized ? 'w-full h-full' : 'w-full max-w-4xl max-h-[92vh]'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-950 border-cyan-500/30 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b select-none ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${
                mode === 'drop_confirm'
                  ? isLightMode ? 'bg-rose-100 text-rose-600' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : isLightMode ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              }`}
            >
              {mode === 'drop_confirm' ? <AlertTriangle className="w-5 h-5" /> : <Table className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate flex items-center gap-2">
                <span>{modalTitle}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                  {serverName}
                </span>
              </h3>
              <p className="text-xs opacity-60 truncate">
                {databaseName} {tableName ? `→ ${tableName}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
                className={`p-1.5 rounded-lg transition-colors ${
                  isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              title={isMaximized ? (isEn ? 'Restore' : 'اندازه عادی') : (isEn ? 'Maximize' : 'تمام‌صفحه')}
              className={`p-1.5 rounded-lg transition-colors ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg transition-colors ${
                isLightMode ? 'hover:bg-rose-100 text-rose-600' : 'hover:bg-rose-500/20 text-rose-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-400 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="truncate">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-300 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* ============================================================ */}
          {/* MODE: CREATE TABLE */}
          {/* ============================================================ */}
          {mode === 'create_table' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 flex items-center gap-1.5">
                    <span>{isEn ? 'Table Name *' : 'نام جدول *'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      whatIsIt={isEn ? 'Identifier for the new MySQL table' : 'شناسه و نام جدول جدید MySQL'}
                      whyNeeded={isEn ? 'Required to identify the table in the schema' : 'جهت شناسایی جدول درون پایگاه داده الزامی است'}
                      example="users, orders, audit_logs"
                    />
                  </label>
                  <input
                    type="text"
                    required
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="e.g. app_users"
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none transition-colors ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 flex items-center gap-1.5">
                    <span>{isEn ? 'Storage Engine' : 'موتور ذخیره‌سازی'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      whatIsIt={isEn ? 'Underlying MySQL storage engine' : 'موتور ذخیره‌سازی جدول در سرور MySQL'}
                      whyNeeded={isEn ? 'InnoDB supports ACID transactions and foreign keys; MyISAM is legacy non-transactional' : 'InnoDB از تراکنش‌های ACID و کلیدهای خارجی پشتیبانی می‌کند'}
                      example="InnoDB (Standard)"
                    />
                  </label>
                  <select
                    value={tableEngine}
                    onChange={(e) => setTableEngine(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {MYSQL_ENGINES.map((eng) => (
                      <option key={eng} value={eng}>
                        {eng}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 flex items-center gap-1.5">
                    <span>{isEn ? 'Character Set' : 'مجموعه نویسه (Charset)'}</span>
                  </label>
                  <select
                    value={tableCharset}
                    onChange={(e) => {
                      setTableCharset(e.target.value);
                      if (e.target.value === 'utf8mb4') setTableCollation('utf8mb4_unicode_ci');
                      else if (e.target.value === 'latin1') setTableCollation('latin1_swedish_ci');
                    }}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {MYSQL_CHARSETS.map((cs) => (
                      <option key={cs} value={cs}>
                        {cs}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 flex items-center gap-1.5">
                    <span>{isEn ? 'Collation' : 'تطبیق نویسه‌ها (Collation)'}</span>
                  </label>
                  <select
                    value={tableCollation}
                    onChange={(e) => setTableCollation(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {MYSQL_COLLATIONS.map((cl) => (
                      <option key={cl} value={cl}>
                        {cl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block">
                  {isEn ? 'Table Comment / Description' : 'توضیحات جدول'}
                </label>
                <input
                  type="text"
                  value={tableComment}
                  onChange={(e) => setTableComment(e.target.value)}
                  placeholder={isEn ? 'e.g. Master customer account records' : 'مثال: جدول مشتریان اصلی سامانه'}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                      : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                  }`}
                />
              </div>

              {/* Dynamic Columns Builder */}
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <span>{isEn ? 'Columns Definition' : 'تعریف ستون‌های جدول'}</span>
                    <span className="text-[11px] font-mono opacity-60">({tableColumns.length})</span>
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddTableColumnRow}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Add Column' : 'افزودن ستون'}</span>
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead
                      className={`text-[11px] font-semibold uppercase ${
                        isLightMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-900 text-slate-300'
                      }`}
                    >
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">{isEn ? 'Name *' : 'نام ستون *'}</th>
                        <th className="py-2 px-3">{isEn ? 'Type' : 'نوع داده'}</th>
                        <th className="py-2 px-3">{isEn ? 'Length' : 'طول'}</th>
                        <th className="py-2 px-3 text-center">{isEn ? 'Nullable' : 'Null'}</th>
                        <th className="py-2 px-3 text-center">{isEn ? 'Auto Inc' : 'افزایشی'}</th>
                        <th className="py-2 px-3 text-center">{isEn ? 'Primary' : 'کلید اصلی'}</th>
                        <th className="py-2 px-3">{isEn ? 'Default' : 'مقدار پیش‌فرض'}</th>
                        <th className="py-2 px-3">{isEn ? 'Comment' : 'توضیحات'}</th>
                        <th className="py-2 px-2 text-center"></th>
                      </tr>
                    </thead>
                    <tbody
                      className={`divide-y font-mono ${
                        isLightMode ? 'divide-slate-200 bg-white' : 'divide-slate-800/80 bg-slate-950'
                      }`}
                    >
                      {tableColumns.map((col, idx) => (
                        <tr key={idx} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-900/40'}>
                          <td className="py-1.5 px-3 text-[11px] opacity-50">{idx + 1}</td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              required
                              value={col.name}
                              onChange={(e) =>
                                handleUpdateTableColumnRow(idx, {
                                  name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                                })
                              }
                              placeholder="col_name"
                              className={`w-28 px-2 py-1 text-xs rounded border outline-none ${
                                isLightMode
                                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <select
                              value={col.dataType}
                              onChange={(e) => handleUpdateTableColumnRow(idx, { dataType: e.target.value })}
                              className={`w-28 px-2 py-1 text-xs rounded border outline-none ${
                                isLightMode
                                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                            >
                              {COMMON_DATA_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={col.length || ''}
                              onChange={(e) => handleUpdateTableColumnRow(idx, { length: e.target.value })}
                              placeholder="255"
                              className={`w-16 px-2 py-1 text-xs rounded border outline-none text-center ${
                                isLightMode
                                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={col.nullable}
                              disabled={col.primaryKey}
                              onChange={(e) => handleUpdateTableColumnRow(idx, { nullable: e.target.checked })}
                              className="accent-cyan-500 rounded"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={col.autoIncrement || false}
                              onChange={(e) =>
                                handleUpdateTableColumnRow(idx, {
                                  autoIncrement: e.target.checked,
                                  primaryKey: e.target.checked ? true : col.primaryKey,
                                  nullable: e.target.checked ? false : col.nullable,
                                })
                              }
                              className="accent-cyan-500 rounded"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={col.primaryKey || false}
                              onChange={(e) =>
                                handleUpdateTableColumnRow(idx, {
                                  primaryKey: e.target.checked,
                                  nullable: e.target.checked ? false : col.nullable,
                                })
                              }
                              className="accent-cyan-500 rounded"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={col.defaultValue || ''}
                              onChange={(e) => handleUpdateTableColumnRow(idx, { defaultValue: e.target.value })}
                              placeholder="NULL"
                              className={`w-24 px-2 py-1 text-xs rounded border outline-none ${
                                isLightMode
                                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={col.comment || ''}
                              onChange={(e) => handleUpdateTableColumnRow(idx, { comment: e.target.value })}
                              placeholder="..."
                              className={`w-28 px-2 py-1 text-xs rounded border outline-none ${
                                isLightMode
                                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveTableColumnRow(idx)}
                              disabled={tableColumns.length <= 1}
                              className="p-1 rounded text-slate-400 hover:text-rose-400 disabled:opacity-20 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE: ALTER TABLE OPTIONS */}
          {/* ============================================================ */}
          {mode === 'alter_table' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Rename Table (New Name)' : 'تغییر نام جدول (نام جدید)'}
                  </label>
                  <input
                    type="text"
                    value={renamedTableName}
                    onChange={(e) => setRenamedTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Storage Engine' : 'موتور ذخیره‌سازی'}
                  </label>
                  <select
                    value={alterEngine}
                    onChange={(e) => setAlterEngine(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {MYSQL_ENGINES.map((eng) => (
                      <option key={eng} value={eng}>
                        {eng}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Character Set' : 'مجموعه نویسه (Charset)'}
                  </label>
                  <select
                    value={alterCharset}
                    onChange={(e) => setAlterCharset(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {MYSQL_CHARSETS.map((cs) => (
                      <option key={cs} value={cs}>
                        {cs}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Collation' : 'تطبیق نویسه‌ها (Collation)'}
                  </label>
                  <select
                    value={alterCollation}
                    onChange={(e) => setAlterCollation(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {MYSQL_COLLATIONS.map((cl) => (
                      <option key={cl} value={cl}>
                        {cl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Auto Increment Next Value' : 'مقدار بعدی Auto Increment'}
                  </label>
                  <input
                    type="number"
                    value={alterAutoIncrement}
                    onChange={(e) => setAlterAutoIncrement(e.target.value)}
                    placeholder="e.g. 1000"
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Table Comment' : 'توضیحات جدول'}
                  </label>
                  <input
                    type="text"
                    value={alterComment}
                    onChange={(e) => setAlterComment(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE: ADD COLUMN / MODIFY COLUMN */}
          {/* ============================================================ */}
          {(mode === 'add_column' || mode === 'modify_column') && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Column Name *' : 'نام ستون *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={colName}
                    onChange={(e) => setColName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="e.g. email_address"
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Data Type *' : 'نوع داده *'}
                  </label>
                  <select
                    value={colType}
                    onChange={(e) => setColType(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {COMMON_DATA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Length / Values' : 'طول / مقادیر'}
                  </label>
                  <input
                    type="text"
                    value={colLength}
                    onChange={(e) => setColLength(e.target.value)}
                    placeholder="255 or 10,2"
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Default Value Mode' : 'حالت مقدار پیش‌فرض'}
                  </label>
                  <select
                    value={colDefaultMode}
                    onChange={(e: any) => setColDefaultMode(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    <option value="none">{isEn ? 'None' : 'بدون مقدار'}</option>
                    <option value="null">NULL</option>
                    <option value="timestamp">CURRENT_TIMESTAMP</option>
                    <option value="custom">{isEn ? 'Custom Value' : 'مقدار سفارشی'}</option>
                  </select>
                </div>

                {colDefaultMode === 'custom' && (
                  <div>
                    <label className="text-xs font-semibold mb-1 block">
                      {isEn ? 'Custom Default' : 'مقدار پیش‌فرض'}
                    </label>
                    <input
                      type="text"
                      value={colDefaultVal}
                      onChange={(e) => setColDefaultVal(e.target.value)}
                      placeholder="e.g. active, 0"
                      className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                          : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                      }`}
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Position' : 'موقعیت قرارگیری ستون'}
                  </label>
                  <select
                    value={colPosition}
                    onChange={(e: any) => setColPosition(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    <option value="DEFAULT">{isEn ? 'Default (End of Table)' : 'پیش‌فرض (انتهای جدول)'}</option>
                    <option value="FIRST">{isEn ? 'FIRST (Beginning)' : 'ابتدای جدول (FIRST)'}</option>
                    <option value="AFTER">{isEn ? 'AFTER specified column' : 'بعد از ستون مشخص (AFTER)'}</option>
                  </select>
                </div>

                {colPosition === 'AFTER' && (
                  <div>
                    <label className="text-xs font-semibold mb-1 block">
                      {isEn ? 'After Column' : 'بعد از ستون'}
                    </label>
                    <select
                      value={colAfterTarget}
                      onChange={(e) => setColAfterTarget(e.target.value)}
                      className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                          : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                      }`}
                    >
                      {existingColumns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={colNullable}
                    onChange={(e) => setColNullable(e.target.checked)}
                    className="accent-cyan-500 rounded"
                  />
                  <span>{isEn ? 'Allow NULL' : 'پذیرش مقدار NULL'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={colUnsigned}
                    onChange={(e) => setColUnsigned(e.target.checked)}
                    className="accent-cyan-500 rounded"
                  />
                  <span>{isEn ? 'Unsigned (Positive only)' : 'بدون علامت (Unsigned)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={colAutoInc}
                    onChange={(e) => setColAutoInc(e.target.checked)}
                    className="accent-cyan-500 rounded"
                  />
                  <span>{isEn ? 'Auto Increment' : 'شناسه افزایشی (AUTO_INCREMENT)'}</span>
                </label>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block">
                  {isEn ? 'Column Comment' : 'توضیحات ستون'}
                </label>
                <input
                  type="text"
                  value={colComment}
                  onChange={(e) => setColComment(e.target.value)}
                  placeholder={isEn ? 'e.g. Primary verified email' : 'توضیح کاربرد مهندسی ستون'}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                      : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE: RENAME COLUMN */}
          {/* ============================================================ */}
          {mode === 'rename_column' && targetColumn && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Current Column Name' : 'نام فعلی ستون'}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={targetColumn.name}
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border opacity-60 ${
                      isLightMode ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'New Column Name *' : 'نام جدید ستون *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="new_column_name"
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE: CREATE INDEX */}
          {/* ============================================================ */}
          {mode === 'create_index' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Index Name *' : 'نام ایندکس *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={idxName}
                    onChange={(e) => setIdxName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Index Type' : 'نوع ایندکس'}
                  </label>
                  <select
                    value={idxType}
                    onChange={(e: any) => setIdxType(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    <option value="INDEX">{isEn ? 'INDEX (Normal / Non-unique)' : 'معمولی (غیریکتا - INDEX)'}</option>
                    <option value="UNIQUE">{isEn ? 'UNIQUE (Unique constraint)' : 'یکتا (UNIQUE)'}</option>
                    <option value="FULLTEXT">{isEn ? 'FULLTEXT (Text search)' : 'جستجوی تمام‌متن (FULLTEXT)'}</option>
                    <option value="SPATIAL">{isEn ? 'SPATIAL (GIS)' : 'مکانی (SPATIAL)'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Index Method' : 'الگوریتم نمایه (Method)'}
                  </label>
                  <select
                    value={idxMethod}
                    onChange={(e: any) => setIdxMethod(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    <option value="BTREE">BTREE (Balanced Tree)</option>
                    <option value="HASH">HASH</option>
                  </select>
                </div>
              </div>

              {/* Indexed Columns Selector */}
              <div>
                <label className="text-xs font-semibold mb-2 block">
                  {isEn ? 'Select Indexed Columns (in Order) *' : 'انتخاب ستون‌های ایندکس (به ترتیب اولویت) *'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {existingColumns.map((col) => {
                    const isSelected = idxSelectedColumns.some((c) => c.name === col.name);
                    return (
                      <div
                        key={col.name}
                        onClick={() => {
                          if (isSelected) {
                            setIdxSelectedColumns((prev) => prev.filter((c) => c.name !== col.name));
                          } else {
                            setIdxSelectedColumns((prev) => [...prev, { name: col.name, order: 'ASC' }]);
                          }
                        }}
                        className={`p-2 rounded-xl border cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          isSelected
                            ? isLightMode
                              ? 'bg-cyan-50 border-cyan-400 text-cyan-900 font-bold'
                              : 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="accent-cyan-500 rounded"
                          />
                          <span className="font-mono truncate">{col.name}</span>
                        </div>
                        <span className="text-[10px] font-mono opacity-60 uppercase">{col.dataType}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block">
                  {isEn ? 'Index Comment' : 'توضیحات ایندکس'}
                </label>
                <input
                  type="text"
                  value={idxComment}
                  onChange={(e) => setIdxComment(e.target.value)}
                  placeholder={isEn ? 'e.g. Optimize customer search' : 'مثال: بهینه‌سازی سرعت جستجو'}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                      : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE: ADD FOREIGN KEY */}
          {/* ============================================================ */}
          {mode === 'add_foreign_key' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Constraint Name *' : 'نام قید کلید خارجی *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={fkName}
                    onChange={(e) => setFkName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Local Column in this Table *' : 'ستون محلی در این جدول *'}
                  </label>
                  <select
                    value={fkColumn}
                    onChange={(e) => {
                      setFkColumn(e.target.value);
                      setFkName(`fk_${tableName}_${e.target.value}`);
                    }}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {existingColumns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.dataType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Referenced (Foreign) Table *' : 'جدول مرجع (مقصد) *'}
                  </label>
                  <select
                    value={fkRefTable}
                    onChange={(e) => setFkRefTable(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    {existingTables
                      .filter((t) => t !== tableName)
                      .map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'Referenced Column in Foreign Table *' : 'ستون مرجع در جدول مقصد *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={fkRefColumn}
                    onChange={(e) => setFkRefColumn(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="id"
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'ON UPDATE Action' : 'رفتار هنگام بروزرسانی (ON UPDATE)'}
                  </label>
                  <select
                    value={fkOnUpdate}
                    onChange={(e: any) => setFkOnUpdate(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    <option value="RESTRICT">RESTRICT (Block update if referenced)</option>
                    <option value="CASCADE">CASCADE (Update child rows)</option>
                    <option value="SET NULL">SET NULL (Set child col to NULL)</option>
                    <option value="NO ACTION">NO ACTION</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold mb-1 block">
                    {isEn ? 'ON DELETE Action' : 'رفتار هنگام حذف (ON DELETE)'}
                  </label>
                  <select
                    value={fkOnDelete}
                    onChange={(e: any) => setFkOnDelete(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                        : 'bg-slate-900 border-slate-700 focus:border-cyan-500 text-slate-100'
                    }`}
                  >
                    <option value="RESTRICT">RESTRICT (Block deletion if referenced)</option>
                    <option value="CASCADE">CASCADE (Delete child rows)</option>
                    <option value="SET NULL">SET NULL (Set child col to NULL)</option>
                    <option value="NO ACTION">NO ACTION</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE: MANAGE PRIMARY KEY */}
          {/* ============================================================ */}
          {mode === 'manage_primary_key' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs opacity-75">
                {isEn
                  ? 'Select one or more columns to compose the primary key. If all are unchecked, the primary key will be dropped.'
                  : 'یک یا چند ستون را جهت تشکیل کلید اصلی انتخاب نمایید. در صورت عدم انتخاب هر ستونی، کلید اصلی حذف خواهد شد.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {existingColumns.map((col) => {
                  const isChecked = selectedPkColumns.includes(col.name);
                  return (
                    <div
                      key={col.name}
                      onClick={() => {
                        if (isChecked) {
                          setSelectedPkColumns((prev) => prev.filter((c) => c !== col.name));
                        } else {
                          setSelectedPkColumns((prev) => [...prev, col.name]);
                        }
                      }}
                      className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between text-xs transition-colors ${
                        isChecked
                          ? isLightMode
                            ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                            : 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="accent-amber-500 rounded"
                        />
                        <span className="font-mono truncate">{col.name}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-60">{col.dataType}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE: DROP CONFIRM */}
          {/* ============================================================ */}
          {mode === 'drop_confirm' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="text-xs flex flex-col gap-1">
                  <span className="font-bold text-sm text-rose-200">
                    {isEn ? 'Destructive DDL Operation Confirmation' : 'هشدار اجرای عملیات تخریبی ساختار (DDL)'}
                  </span>
                  <p className="opacity-90">
                    {dropTargetType === 'table' &&
                      (isEn
                        ? `You are about to permanently DROP table "${tableName}". All rows, indexes, and constraints will be destroyed immediately.`
                        : `شما در حال حذف کامل و دائمی جدول «${tableName}» هستید. تمامی داده‌ها، سطرها، و ایندکس‌های آن بی‌درنگ نابود خواهند شد.`)}
                    {dropTargetType === 'truncate_table' &&
                      (isEn
                        ? `You are about to TRUNCATE table "${tableName}". All rows will be permanently wiped out.`
                        : `شما در حال پاکسازی کامل (Truncate) جدول «${tableName}» هستید. تمامی سطرهای آن برای همیشه پاک خواهند شد.`)}
                    {dropTargetType === 'column' &&
                      (isEn
                        ? `You are about to DROP column "${targetColumn?.name}" from table "${tableName}". All data stored in this column will be lost.`
                        : `شما در حال حذف ستون «${targetColumn?.name}» از جدول «${tableName}» هستید. تمامی مقادیر موجود در این ستون از بین خواهند رفت.`)}
                    {dropTargetType === 'index' &&
                      (isEn
                        ? `You are about to DROP index "${targetIndex?.name}" from table "${tableName}".`
                        : `شما در حال حذف ایندکس «${targetIndex?.name}» از جدول «${tableName}» هستید.`)}
                    {dropTargetType === 'foreign_key' &&
                      (isEn
                        ? `You are about to DROP foreign key constraint "${targetForeignKey?.name}" from table "${tableName}".`
                        : `شما در حال حذف قید کلید خارجی «${targetForeignKey?.name}» از جدول «${tableName}» هستید.`)}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block">
                  {isEn
                    ? 'Type "CONFIRM" to authorize execution:'
                    : 'جهت تایید کلمه «تایید» یا "CONFIRM" را وارد نمایید:'}
                </label>
                <input
                  type="text"
                  required
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={isEn ? 'CONFIRM' : 'تایید'}
                  className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border outline-none ${
                    isLightMode
                      ? 'bg-white border-rose-300 focus:border-rose-500 text-rose-700'
                      : 'bg-slate-900 border-rose-500/50 focus:border-rose-500 text-rose-300'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* LIVE SQL PREVIEW ACCORDION */}
          {/* ============================================================ */}
          <div
            className={`rounded-xl border transition-all ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div
              onClick={() => setShowSqlPreview((prev) => !prev)}
              className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold">{isEn ? 'Live SQL Preview' : 'پیش‌نمایش زنده دستور SQL'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-cyan-500/10 text-cyan-400">
                  DDL
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopySql();
                  }}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                >
                  {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSql ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                </button>
                <Eye className="w-3.5 h-3.5 opacity-60" />
              </div>
            </div>

            {showSqlPreview && (
              <div className="px-3.5 pb-3">
                <pre
                  className={`p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed ${
                    isLightMode ? 'bg-slate-900 text-cyan-300' : 'bg-black text-cyan-400 border border-slate-800'
                  }`}
                >
                  {computedSqlPreview}
                </pre>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl shadow-lg transition-all ${
                mode === 'drop_confirm'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30'
              } disabled:opacity-50`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Executing...' : 'در حال اجرا...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {mode === 'create_table'
                      ? isEn ? 'Create Table' : 'ساخت جدول'
                      : mode === 'alter_table'
                      ? isEn ? 'Apply Table Changes' : 'اعمال تغییرات جدول'
                      : mode === 'add_column'
                      ? isEn ? 'Add Column' : 'افزودن ستون'
                      : mode === 'modify_column'
                      ? isEn ? 'Save Column' : 'ذخیره ستون'
                      : mode === 'rename_column'
                      ? isEn ? 'Rename Column' : 'تغییر نام ستون'
                      : mode === 'create_index'
                      ? isEn ? 'Create Index' : 'ساخت ایندکس'
                      : mode === 'add_foreign_key'
                      ? isEn ? 'Add Foreign Key' : 'افزودن کلید خارجی'
                      : mode === 'manage_primary_key'
                      ? isEn ? 'Update Primary Key' : 'بروزرسانی کلید اصلی'
                      : isEn ? 'Confirm & Execute' : 'تایید و اجرا'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
