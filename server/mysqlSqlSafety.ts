/**
 * MySQL SQL Safety & Risk Classification Engine
 * Analyzes and classifies MySQL statements for safety controls and risk management.
 */

export type MysqlSqlClassificationType =
  | 'read_only'
  | 'write'
  | 'ddl'
  | 'administrative'
  | 'destructive';

export type MysqlSqlRiskLevel =
  | 'safe'
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical';

export interface MysqlSqlStatementAnalysis {
  sql: string;
  command: string;
  type: MysqlSqlClassificationType;
  riskLevel: MysqlSqlRiskLevel;
  isDestructive: boolean;
  targetObject?: string;
  reasons: string[];
  reasonsFa: string[];
}

export interface MysqlSqlQuerySafetyReport {
  overallType: MysqlSqlClassificationType;
  overallRiskLevel: MysqlSqlRiskLevel;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  statementCount: number;
  destructiveReasons: string[];
  destructiveReasonsFa: string[];
  statements: MysqlSqlStatementAnalysis[];
}

/**
 * Sanitizes MySQL SQL string for token analysis by replacing string literals,
 * comments (#, --, and /* ... *\/), and backticked identifiers.
 */
export function sanitizeMysqlSqlForTokenAnalysis(sql: string): string {
  if (!sql) return '';
  let sanitized = sql;
  // Remove multi-line comments /* ... */
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove single line dash-dash comments -- ...
  sanitized = sanitized.replace(/--.*$/gm, ' ');
  // Remove single line hash comments # ... (MySQL specific)
  sanitized = sanitized.replace(/#.*$/gm, ' ');
  // Replace double-quoted and single-quoted strings
  sanitized = sanitized.replace(/'(?:''|[^'])*'/g, "'$str$'");
  sanitized = sanitized.replace(/"(?:""|[^"])*"/g, '"$str$"');
  return sanitized;
}

/**
 * Splits a MySQL SQL script into individual statements, respecting single quotes,
 * double quotes, backticks, and MySQL comment styles.
 */
export function splitMysqlSqlStatements(sql: string): string[] {
  if (!sql || !sql.trim()) return [];

  const rawStatements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBlockComment = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1] || '';

    // Line comment handling (-- or #)
    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inBlockComment) {
      if (!inLineComment && ((char === '-' && nextChar === '-') || char === '#')) {
        inLineComment = true;
        current += char;
        if (char === '-') {
          current += nextChar;
          i++;
        }
        continue;
      }
      if (inLineComment) {
        current += char;
        if (char === '\n') {
          inLineComment = false;
        }
        continue;
      }
    }

    // Block comment handling (/* ... */)
    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inLineComment) {
      if (!inBlockComment && char === '/' && nextChar === '*') {
        inBlockComment = true;
        current += char;
        continue;
      }
      if (inBlockComment) {
        current += char;
        if (char === '*' && nextChar === '/') {
          current += nextChar;
          i++;
          inBlockComment = false;
        }
        continue;
      }
    }

    // Single quotes handling
    if (!inDoubleQuote && !inBacktick && !inBlockComment && !inLineComment) {
      if (char === "'") {
        if (inSingleQuote && nextChar === "'") {
          current += "''";
          i++;
          continue;
        }
        inSingleQuote = !inSingleQuote;
        current += char;
        continue;
      }
    }

    // Double quotes handling
    if (!inSingleQuote && !inBacktick && !inBlockComment && !inLineComment) {
      if (char === '"') {
        if (inDoubleQuote && nextChar === '"') {
          current += '""';
          i++;
          continue;
        }
        inDoubleQuote = !inDoubleQuote;
        current += char;
        continue;
      }
    }

    // Backticks handling (`identifier`)
    if (!inSingleQuote && !inDoubleQuote && !inBlockComment && !inLineComment) {
      if (char === '`') {
        if (inBacktick && nextChar === '`') {
          current += '``';
          i++;
          continue;
        }
        inBacktick = !inBacktick;
        current += char;
        continue;
      }
    }

    // Semicolon statement boundary
    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick && !inBlockComment && !inLineComment) {
      if (current.trim()) {
        rawStatements.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    rawStatements.push(current.trim());
  }

  return rawStatements;
}

/**
 * Analyzes a single MySQL SQL statement to classify operation type, risk level,
 * and whether it requires explicit operator confirmation.
 */
export function analyzeSingleMysqlSqlStatement(rawSql: string): MysqlSqlStatementAnalysis {
  const sanitized = sanitizeMysqlSqlForTokenAnalysis(rawSql).trim();
  const normalized = sanitized.replace(/\s+/g, ' ');
  const upper = normalized.toUpperCase();

  const tokens = upper.split(' ').filter(Boolean);
  const command = (tokens[0] || 'UNKNOWN').toUpperCase();
  const subCommand = (tokens[1] || '').toUpperCase();
  const fullCommand = `${command} ${subCommand}`.trim();

  const reasons: string[] = [];
  const reasonsFa: string[] = [];

  let type: MysqlSqlClassificationType = 'read_only';
  let riskLevel: MysqlSqlRiskLevel = 'safe';
  let isDestructive = false;
  let targetObject: string | undefined;

  // 1. DROP operations
  if (command === 'DROP') {
    type = 'destructive';
    isDestructive = true;
    targetObject = tokens.slice(1, 4).join(' ');

    if (subCommand === 'DATABASE' || subCommand === 'SCHEMA') {
      riskLevel = 'critical';
      reasons.push(`DROP ${subCommand} permanently destroys the entire database and all contained tables, views, and data.`);
      reasonsFa.push(`دستور DROP ${subCommand} کل پایگاه داده و تمامی جداول، نماها و داده‌های درون آن را برای همیشه پاک می‌کند.`);
    } else if (subCommand === 'TABLE' || subCommand === 'TABLES') {
      riskLevel = 'critical';
      reasons.push(`DROP TABLE permanently destroys the table and all its stored records.`);
      reasonsFa.push(`دستور DROP TABLE جدول و تمامی اطلاعات ذخیره‌شده در آن را برای همیشه نابود می‌کند.`);
    } else if (subCommand === 'USER') {
      riskLevel = 'high';
      reasons.push(`DROP USER deletes MySQL authentication credentials and privileges for '${tokens[2] || 'target'}'.`);
      reasonsFa.push(`دستور DROP USER حساب کاربری و کلیه دسترسی‌های MySQL مربوط به '${tokens[2] || 'کاربر'}' را حذف می‌کند.`);
    } else if (subCommand === 'VIEW') {
      riskLevel = 'high';
      reasons.push(`DROP VIEW removes the specified database view definition.`);
      reasonsFa.push(`دستور DROP VIEW تعریف نمای مشخص‌شده را حذف می‌کند.`);
    } else if (subCommand === 'PROCEDURE' || subCommand === 'FUNCTION') {
      riskLevel = 'high';
      reasons.push(`DROP ${subCommand} removes stored routine logic from the database.`);
      reasonsFa.push(`دستور DROP ${subCommand} روتین یا تابع ذخیره‌شده را از دیتابیس پاک می‌کند.`);
    } else if (subCommand === 'TRIGGER' || subCommand === 'EVENT') {
      riskLevel = 'high';
      reasons.push(`DROP ${subCommand} removes automated database trigger/event execution logic.`);
      reasonsFa.push(`دستور DROP ${subCommand} منطق اجرایی خودکار تریگر یا رویداد زمان‌بندی‌شده را حذف می‌نماید.`);
    } else if (subCommand === 'INDEX') {
      riskLevel = 'moderate';
      reasons.push(`DROP INDEX removes an index, which may degrade query performance.`);
      reasonsFa.push(`دستور DROP INDEX ایندکس جدول را حذف می‌کند که ممکن است کارایی کوئری‌ها را کاهش دهد.`);
    } else {
      riskLevel = 'high';
      reasons.push(`DROP ${subCommand || 'OBJECT'} permanently removes the specified database entity.`);
      reasonsFa.push(`دستور DROP شیء مشخص‌شده در MySQL را برای همیشه حذف می‌نماید.`);
    }
  }

  // 2. TRUNCATE operation
  else if (command === 'TRUNCATE') {
    type = 'destructive';
    isDestructive = true;
    riskLevel = 'critical';
    targetObject = tokens.slice(1, 4).join(' ');
    reasons.push(`TRUNCATE TABLE removes all rows immediately and resets auto-increment counters.`);
    reasonsFa.push(`دستور TRUNCATE تمام سطرهای جدول را فوراً و غیرقابل بازگشت پاک‌سازی کرده و شمارنده را بازنشانی می‌کند.`);
  }

  // 3. DELETE operations
  else if (command === 'DELETE') {
    targetObject = tokens[1] === 'FROM' ? tokens[2] : tokens[1];
    const hasWhere = /\bWHERE\b/i.test(upper);
    const isTrivialWhere = /\bWHERE\s+(?:1\s*=\s*1|TRUE|'1'\s*=\s*'1')(?:\s*;|\s*$)/i.test(upper);

    if (!hasWhere || isTrivialWhere) {
      type = 'destructive';
      isDestructive = true;
      riskLevel = 'critical';
      reasons.push(`UNBOUNDED DELETE without a specific WHERE clause will delete ALL rows in target table '${targetObject || 'unknown'}'.`);
      reasonsFa.push(`دستور DELETE بدون شرط مشخص WHERE، تمام رکوردهای جدول «${targetObject || 'نامشخص'}» را به طور کامل حذف خواهد کرد.`);
    } else {
      type = 'write';
      riskLevel = 'moderate';
      reasons.push(`Filtered DELETE operation with WHERE clause.`);
      reasonsFa.push(`عملیات حذف سطرها با فیلتر و شرط WHERE.`);
    }
  }

  // 4. UPDATE operations
  else if (command === 'UPDATE') {
    targetObject = tokens[1];
    const hasWhere = /\bWHERE\b/i.test(upper);
    const isTrivialWhere = /\bWHERE\s+(?:1\s*=\s*1|TRUE|'1'\s*=\s*'1')(?:\s*;|\s*$)/i.test(upper);

    if (!hasWhere || isTrivialWhere) {
      type = 'destructive';
      isDestructive = true;
      riskLevel = 'critical';
      reasons.push(`UNBOUNDED UPDATE without a specific WHERE clause will modify ALL rows in target table '${targetObject || 'unknown'}'.`);
      reasonsFa.push(`دستور UPDATE بدون شرط مشخص WHERE، مقادیر تمام سطرهای جدول «${targetObject || 'نامشخص'}» را تغییر خواهد داد.`);
    } else {
      type = 'write';
      riskLevel = 'low';
      reasons.push(`Filtered UPDATE operation.`);
      reasonsFa.push(`عملیات به‌روزرسانی سطرها با فیلتر مشخص.`);
    }
  }

  // 5. ALTER TABLE operations
  else if (command === 'ALTER') {
    targetObject = tokens.slice(1, 4).join(' ');
    if (/\bDROP\s+(?:COLUMN|PRIMARY\s+KEY|FOREIGN\s+KEY|INDEX|CONSTRAINT|PARTITION)\b/i.test(upper)) {
      type = 'destructive';
      isDestructive = true;
      riskLevel = 'high';
      reasons.push(`ALTER TABLE ... DROP permanently removes columns, keys, or constraints from '${targetObject}'.`);
      reasonsFa.push(`دستور ALTER TABLE ... DROP ستون‌ها، کلیدها یا قیود را برای همیشه از «${targetObject}» حذف می‌نماید.`);
    } else if (subCommand === 'USER') {
      type = 'administrative';
      riskLevel = 'moderate';
      reasons.push(`ALTER USER modifies MySQL account credentials or security limits.`);
      reasonsFa.push(`دستور ALTER USER مشخصات یا محدودیت‌های امنیتی حساب کاربری MySQL را تغییر می‌دهد.`);
    } else {
      type = 'ddl';
      riskLevel = 'low';
      reasons.push(`Schema structure modification (ALTER).`);
      reasonsFa.push(`عملیات تغییر ساختار جدول یا پایگاه داده (ALTER).`);
    }
  }

  // 6. REVOKE permissions
  else if (command === 'REVOKE') {
    type = 'destructive';
    isDestructive = true;
    riskLevel = 'high';
    targetObject = tokens.slice(1, 4).join(' ');
    reasons.push(`REVOKE removes MySQL privileges and security grants from users.`);
    reasonsFa.push(`دستور REVOKE دسترسی‌ها و مجوزهای امنیتی را از کاربران MySQL سلب می‌کند.`);
  }

  // 7. GRANT privileges
  else if (command === 'GRANT') {
    type = 'administrative';
    riskLevel = 'moderate';
    targetObject = tokens.slice(1, 4).join(' ');
    reasons.push(`GRANT assigns MySQL security privileges to user accounts.`);
    reasonsFa.push(`دستور GRANT مجوزهای امنیتی به حساب کاربری MySQL اعطا می‌نماید.`);
  }

  // 8. User creation
  else if (fullCommand === 'CREATE USER') {
    type = 'administrative';
    riskLevel = 'moderate';
    targetObject = tokens.slice(2, 4).join(' ');
    reasons.push(`CREATE USER adds a new MySQL authentication account.`);
    reasonsFa.push(`دستور CREATE USER یک حساب کاربری جدید در دیتابیس MySQL ایجاد می‌کند.`);
  }

  // 9. Standard DDL
  else if (command === 'CREATE') {
    type = 'ddl';
    riskLevel = 'low';
    targetObject = tokens.slice(1, 4).join(' ');
    reasons.push(`DDL schema creation (${fullCommand}).`);
    reasonsFa.push(`ایجاد ساختار جدید در دیتابیس (${fullCommand}).`);
  }

  // 10. Standard Write operations
  else if (command === 'INSERT' || command === 'REPLACE' || command === 'LOAD') {
    type = 'write';
    riskLevel = 'low';
    targetObject = tokens.slice(1, 3).join(' ');
    reasons.push(`Data modification statement (${command}).`);
    reasonsFa.push(`عملیات درج یا تغییر داده (${command}).`);
  }

  // 11. Maintenance / Administrative commands
  else if (['FLUSH', 'RESET', 'KILL', 'OPTIMIZE', 'REPAIR', 'CHECK', 'ANALYZE', 'SET', 'USE'].includes(command)) {
    type = 'administrative';
    riskLevel = command === 'KILL' || command === 'FLUSH' ? 'moderate' : 'low';
    targetObject = tokens.slice(1, 3).join(' ');
    reasons.push(`Administrative maintenance command (${command}).`);
    reasonsFa.push(`دستور اداری و نگهداری سرور MySQL (${command}).`);
  }

  // 12. Read-Only queries
  else if (['SELECT', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'DESC', 'HELP'].includes(command)) {
    type = 'read_only';
    riskLevel = 'safe';
  } else if (command === 'WITH') {
    if (/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(upper)) {
      type = 'write';
      riskLevel = 'moderate';
      reasons.push(`Common Table Expression (CTE) with data modification.`);
      reasonsFa.push(`کوئری CTE همراه با تغییر داده.`);
    } else {
      type = 'read_only';
      riskLevel = 'safe';
    }
  } else {
    type = 'write';
    riskLevel = 'low';
    reasons.push(`Unclassified command '${command}'.`);
    reasonsFa.push(`دستور طبقه‌بندی‌نشده '${command}'.`);
  }

  return {
    sql: rawSql.trim(),
    command: fullCommand || command,
    type,
    riskLevel,
    isDestructive,
    targetObject,
    reasons,
    reasonsFa,
  };
}

/**
 * Analyzes an entire MySQL SQL payload (one or multiple statements) and generates
 * a comprehensive safety report with overall risk rating and confirmation requirements.
 */
export function analyzeMysqlSqlSafety(sql: string): MysqlSqlQuerySafetyReport {
  const statements = splitMysqlSqlStatements(sql);

  if (statements.length === 0) {
    return {
      overallType: 'read_only',
      overallRiskLevel: 'safe',
      isDestructive: false,
      requiresConfirmation: false,
      statementCount: 0,
      destructiveReasons: [],
      destructiveReasonsFa: [],
      statements: [],
    };
  }

  const analyses = statements.map(analyzeSingleMysqlSqlStatement);

  const isDestructive = analyses.some((a) => a.isDestructive);

  // Determine overall risk level
  const riskPriority: Record<MysqlSqlRiskLevel, number> = {
    critical: 5,
    high: 4,
    moderate: 3,
    low: 2,
    safe: 1,
  };

  let maxRisk: MysqlSqlRiskLevel = 'safe';
  for (const a of analyses) {
    if (riskPriority[a.riskLevel] > riskPriority[maxRisk]) {
      maxRisk = a.riskLevel;
    }
  }

  // Determine overall classification type
  const typePriority: Record<MysqlSqlClassificationType, number> = {
    destructive: 5,
    administrative: 4,
    ddl: 3,
    write: 2,
    read_only: 1,
  };

  let maxType: MysqlSqlClassificationType = 'read_only';
  for (const a of analyses) {
    if (typePriority[a.type] > typePriority[maxType]) {
      maxType = a.type;
    }
  }

  const destructiveReasons: string[] = [];
  const destructiveReasonsFa: string[] = [];

  analyses
    .filter((a) => a.isDestructive)
    .forEach((a) => {
      destructiveReasons.push(...a.reasons);
      destructiveReasonsFa.push(...a.reasonsFa);
    });

  return {
    overallType: maxType,
    overallRiskLevel: maxRisk,
    isDestructive,
    requiresConfirmation: isDestructive,
    statementCount: statements.length,
    destructiveReasons,
    destructiveReasonsFa,
    statements: analyses,
  };
}
