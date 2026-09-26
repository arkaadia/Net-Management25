import {
  PostgresSqlClassificationType,
  PostgresSqlRiskLevel,
  PostgresSqlStatementAnalysis,
  PostgresSqlQuerySafetyReport,
} from '../types';

/**
 * Sanitize comments and string literals to prevent keyword false positives
 * (e.g. SELECT 'DROP TABLE foo' -> SELECT '___' )
 */
export function sanitizeSqlForTokenAnalysis(sql: string): string {
  if (!sql) return '';

  let sanitized = sql;

  // 1. Remove block comments /* ... */
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, ' ');

  // 2. Remove single-line comments -- ...
  sanitized = sanitized.replace(/--.*$/gm, ' ');

  // 3. Replace dollar-quoted strings: $tag$ ... $tag$ or $$ ... $$
  sanitized = sanitized.replace(/\$([a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/g, "'$string$'");

  // 4. Replace single-quoted literals: '...'
  sanitized = sanitized.replace(/'(?:''|[^'])*'/g, "'$str$'");

  return sanitized;
}

/**
 * Split multi-statement SQL script by semicolons, ignoring semicolons within quotes.
 */
export function splitSqlStatements(sql: string): string[] {
  if (!sql || !sql.trim()) return [];

  const rawStatements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDollarQuote = false;
  let dollarTag = '';
  let inBlockComment = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1] || '';

    // Check line comment
    if (!inSingleQuote && !inDollarQuote && !inBlockComment) {
      if (!inLineComment && char === '-' && nextChar === '-') {
        inLineComment = true;
        current += char;
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

    // Check block comment
    if (!inSingleQuote && !inDollarQuote && !inLineComment) {
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

    // Check single quote
    if (!inDollarQuote && !inBlockComment && !inLineComment) {
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

    // Check dollar quote
    if (!inSingleQuote && !inBlockComment && !inLineComment) {
      if (char === '$') {
        if (!inDollarQuote) {
          // Lookahead for ending tag
          const tagMatch = sql.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
          if (tagMatch) {
            inDollarQuote = true;
            dollarTag = tagMatch[0];
            current += dollarTag;
            i += dollarTag.length - 1;
            continue;
          }
        } else if (sql.slice(i).startsWith(dollarTag)) {
          inDollarQuote = false;
          current += dollarTag;
          i += dollarTag.length - 1;
          dollarTag = '';
          continue;
        }
      }
    }

    // Split on semicolon if outside strings and comments
    if (char === ';' && !inSingleQuote && !inDollarQuote && !inBlockComment && !inLineComment) {
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
 * Classify and inspect a single SQL statement for safety risks.
 */
export function analyzeSingleSqlStatement(rawSql: string): PostgresSqlStatementAnalysis {
  const sanitized = sanitizeSqlForTokenAnalysis(rawSql).trim();
  const normalized = sanitized.replace(/\s+/g, ' ');
  const upper = normalized.toUpperCase();

  // Extract command name (first word or two)
  const tokens = upper.split(' ').filter(Boolean);
  const command = (tokens[0] || 'UNKNOWN').toUpperCase();
  const subCommand = (tokens[1] || '').toUpperCase();
  const fullCommand = `${command} ${subCommand}`.trim();

  const reasons: string[] = [];
  const reasonsFa: string[] = [];

  let type: PostgresSqlClassificationType = 'read_only';
  let riskLevel: PostgresSqlRiskLevel = 'safe';
  let isDestructive = false;
  let targetObject: string | undefined;

  // 1. DROP operations (Destructive - Critical/High)
  if (command === 'DROP') {
    type = 'destructive';
    isDestructive = true;
    targetObject = tokens.slice(1, 4).join(' ');

    if (subCommand === 'DATABASE') {
      riskLevel = 'critical';
      reasons.push(`DROP DATABASE permanently destroys the entire database and all contained schemas, tables, and data.`);
      reasonsFa.push(`دستور DROP DATABASE کل پایگاه داده و تمامی جداول، داده‌ها و اشیاء آن را برای همیشه پاک می‌کند.`);
    } else if (subCommand === 'TABLE') {
      riskLevel = 'critical';
      reasons.push(`DROP TABLE permanently destroys the table and all its stored data.`);
      reasonsFa.push(`دستور DROP TABLE جدول و تمامی اطلاعات ذخیره‌شده در آن را برای همیشه نابود می‌کند.`);
    } else if (subCommand === 'SCHEMA') {
      riskLevel = 'critical';
      reasons.push(`DROP SCHEMA removes schema namespace and potentially all contained tables.`);
      reasonsFa.push(`دستور DROP SCHEMA محدوده اسکیما و اشیاء درون آن را حذف می‌کند.`);
    } else if (subCommand === 'ROLE' || subCommand === 'USER' || subCommand === 'GROUP') {
      riskLevel = 'high';
      reasons.push(`DROP ${subCommand} deletes database authorization credentials.`);
      reasonsFa.push(`دستور DROP ${subCommand} حساب کاربری و مجوزهای دسترسی را حذف می‌کند.`);
    } else {
      riskLevel = 'high';
      reasons.push(`DROP ${subCommand || 'OBJECT'} permanently removes the specified database object.`);
      reasonsFa.push(`دستور DROP شیء مشخص‌شده در پایگاه داده را برای همیشه حذف می‌نماید.`);
    }
  }

  // 2. TRUNCATE operation (Destructive - Critical)
  else if (command === 'TRUNCATE') {
    type = 'destructive';
    isDestructive = true;
    riskLevel = 'critical';
    targetObject = tokens.slice(1, 4).join(' ');
    reasons.push(`TRUNCATE TABLE removes all rows immediately and resets table storage without triggering individual row audit triggers.`);
    reasonsFa.push(`دستور TRUNCATE تمام سطرهای جدول را فوراً و غیرقابل بازگشت پاک‌سازی می‌کند.`);
  }

  // 3. DELETE operations (Check for unbounded vs bounded)
  else if (command === 'DELETE') {
    targetObject = tokens[1] === 'FROM' ? tokens[2] : tokens[1];
    const hasWhere = /\bWHERE\b/i.test(upper);
    const isTrivialWhere = /\bWHERE\s+(?:1\s*=\s*1|TRUE|'1'\s*=\s*'1')(?:\s*;|\s*$)/i.test(upper);

    if (!hasWhere || isTrivialWhere) {
      type = 'destructive';
      isDestructive = true;
      riskLevel = 'critical';
      reasons.push(`UNBOUNDED DELETE without a specific WHERE clause will delete ALL rows in target table "${targetObject || 'unknown'}".`);
      reasonsFa.push(`دستور DELETE بدون شرط مشخص WHERE، تمام رکوردهای جدول «${targetObject || 'نامشخص'}» را به طور کامل حذف خواهد کرد.`);
    } else {
      type = 'write';
      riskLevel = 'moderate';
      reasons.push(`Filtered DELETE operation with WHERE clause.`);
      reasonsFa.push(`عملیات حذف سطرها با فیلتر و شرط WHERE.`);
    }
  }

  // 4. UPDATE operations (Check for unbounded vs bounded)
  else if (command === 'UPDATE') {
    targetObject = tokens[1];
    const hasWhere = /\bWHERE\b/i.test(upper);
    const isTrivialWhere = /\bWHERE\s+(?:1\s*=\s*1|TRUE|'1'\s*=\s*'1')(?:\s*;|\s*$)/i.test(upper);

    if (!hasWhere || isTrivialWhere) {
      type = 'destructive';
      isDestructive = true;
      riskLevel = 'critical';
      reasons.push(`UNBOUNDED UPDATE without a specific WHERE clause will modify ALL rows in target table "${targetObject || 'unknown'}".`);
      reasonsFa.push(`دستور UPDATE بدون شرط مشخص WHERE، مقادیر تمام سطرهای جدول «${targetObject || 'نامشخص'}» را تغییر خواهد داد.`);
    } else {
      type = 'write';
      riskLevel = 'low';
      reasons.push(`Filtered UPDATE operation.`);
      reasonsFa.push(`عملیات به‌روزرسانی سطرها با فیلتر مشخص.`);
    }
  }

  // 5. ALTER TABLE DROP COLUMN / CONSTRAINT (Destructive - High)
  else if (command === 'ALTER') {
    targetObject = tokens.slice(1, 4).join(' ');
    if (/\bDROP\s+(?:COLUMN|CONSTRAINT)\b/i.test(upper)) {
      type = 'destructive';
      isDestructive = true;
      riskLevel = 'high';
      reasons.push(`ALTER ... DROP permanently removes table columns or data constraints.`);
      reasonsFa.push(`دستور ALTER ... DROP ستون‌ها یا قیود داده‌ای را از جدول حذف می‌کند.`);
    } else {
      type = 'ddl';
      riskLevel = 'low';
      reasons.push(`Schema modification operation (ALTER).`);
      reasonsFa.push(`عملیات تغییر ساختار (ALTER).`);
    }
  }

  // 6. REVOKE permissions (Destructive - High)
  else if (command === 'REVOKE') {
    type = 'destructive';
    isDestructive = true;
    riskLevel = 'high';
    targetObject = tokens.slice(1, 4).join(' ');
    reasons.push(`REVOKE removes database access permissions and privileges from roles or users.`);
    reasonsFa.push(`دستور REVOKE دسترسی‌ها و مجوزهای امنیتی را از کاربران سلب می‌کند.`);
  }

  // 7. Security / Access Grants (Administrative - Moderate)
  else if (command === 'GRANT') {
    type = 'administrative';
    riskLevel = 'moderate';
    targetObject = tokens.slice(1, 4).join(' ');
    reasons.push(`GRANT grants security privileges to database roles.`);
    reasonsFa.push(`دستور GRANT مجوزهای امنیتی به نقش‌های دیتابیس اعطا می‌کند.`);
  }

  // 8. User / Role management (Administrative - Moderate)
  else if (fullCommand === 'CREATE ROLE' || fullCommand === 'CREATE USER' || fullCommand === 'ALTER ROLE' || fullCommand === 'ALTER USER') {
    type = 'administrative';
    riskLevel = 'moderate';
    targetObject = tokens.slice(2, 4).join(' ');
    reasons.push(`Database role management (${fullCommand}).`);
    reasonsFa.push(`مدیریت کاربران و نقش‌های دیتابیس (${fullCommand}).`);
  }

  // 9. Standard DDL (CREATE table, index, view, schema, function)
  else if (command === 'CREATE') {
    type = 'ddl';
    riskLevel = 'low';
    targetObject = tokens.slice(1, 4).join(' ');
    reasons.push(`DDL schema creation (${fullCommand}).`);
    reasonsFa.push(`ایجاد ساختار جدید در دیتابیس (${fullCommand}).`);
  }

  // 10. Standard Write (INSERT, MERGE)
  else if (command === 'INSERT' || command === 'MERGE') {
    type = 'write';
    riskLevel = 'low';
    targetObject = tokens.slice(1, 3).join(' ');
    reasons.push(`Data modification statement (${command}).`);
    reasonsFa.push(`عملیات درج یا تلفیق داده (${command}).`);
  }

  // 11. Maintenance / Administrative commands
  else if (['VACUUM', 'ANALYZE', 'REINDEX', 'CLUSTER', 'CHECKPOINT', 'SET', 'RESET', 'LOCK'].includes(command)) {
    type = 'administrative';
    riskLevel = command === 'VACUUM' || command === 'REINDEX' ? 'moderate' : 'low';
    targetObject = tokens.slice(1, 3).join(' ');
    reasons.push(`Administrative maintenance command (${command}).`);
    reasonsFa.push(`دستور اداری و نگهداری پایگاه داده (${command}).`);
  }

  // 12. Read-Only queries
  else if (['SELECT', 'EXPLAIN', 'SHOW', 'TABLE', 'VALUES'].includes(command)) {
    type = 'read_only';
    riskLevel = 'safe';
  } else if (command === 'WITH') {
    // Check if WITH clause terminates with SELECT vs INSERT/UPDATE/DELETE
    if (/\b(?:INSERT|UPDATE|DELETE)\b/i.test(upper)) {
      type = 'write';
      riskLevel = 'moderate';
      reasons.push(`Common Table Expression (CTE) with data modification.`);
      reasonsFa.push(`کوئری CTE همراه با تغییر داده.`);
    } else {
      type = 'read_only';
      riskLevel = 'safe';
    }
  } else {
    // Fallback classification
    type = 'write';
    riskLevel = 'low';
    reasons.push(`Unclassified command "${command}".`);
    reasonsFa.push(`دستور طبقه‌بندی‌نشده "${command}".`);
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
 * Analyze an entire multi-statement SQL script for comprehensive safety report.
 */
export function analyzePostgresSqlSafety(sql: string): PostgresSqlQuerySafetyReport {
  const statements = splitSqlStatements(sql);

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

  const statementAnalyses = statements.map(analyzeSingleSqlStatement);

  const destructiveStatements = statementAnalyses.filter((s) => s.isDestructive);
  const isDestructive = destructiveStatements.length > 0;

  const allDestructiveReasons = destructiveStatements.flatMap((s) => s.reasons);
  const allDestructiveReasonsFa = destructiveStatements.flatMap((s) => s.reasonsFa);

  // Determine overall risk level
  let overallRiskLevel: PostgresSqlRiskLevel = 'safe';
  if (statementAnalyses.some((s) => s.riskLevel === 'critical')) {
    overallRiskLevel = 'critical';
  } else if (statementAnalyses.some((s) => s.riskLevel === 'high')) {
    overallRiskLevel = 'high';
  } else if (statementAnalyses.some((s) => s.riskLevel === 'moderate')) {
    overallRiskLevel = 'moderate';
  } else if (statementAnalyses.some((s) => s.riskLevel === 'low')) {
    overallRiskLevel = 'low';
  }

  // Determine overall classification type
  let overallType: PostgresSqlClassificationType = 'read_only';
  if (isDestructive) {
    overallType = 'destructive';
  } else if (statementAnalyses.some((s) => s.type === 'ddl')) {
    overallType = 'ddl';
  } else if (statementAnalyses.some((s) => s.type === 'administrative')) {
    overallType = 'administrative';
  } else if (statementAnalyses.some((s) => s.type === 'write')) {
    overallType = 'write';
  } else {
    overallType = 'read_only';
  }

  return {
    overallType,
    overallRiskLevel,
    isDestructive,
    requiresConfirmation: isDestructive,
    statementCount: statements.length,
    destructiveReasons: allDestructiveReasons,
    destructiveReasonsFa: allDestructiveReasonsFa,
    statements: statementAnalyses,
  };
}
