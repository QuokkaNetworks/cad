const mysql = require('mysql2/promise');
const config = require('../config');
const { Settings } = require('./sqlite');

let pool = null;
let poolConfigSignature = '';
const IDENTIFIER_RE = /^[A-Za-z0-9_]+$/;
let playerGroupsLookupWarningShown = false;

function getSetting(key, fallback) {
  const value = Settings.get(key);
  return value === undefined || value === null || value === '' ? fallback : value;
}

function escapeIdentifier(identifier, label) {
  if (!IDENTIFIER_RE.test(identifier)) {
    throw new Error(`${label} contains invalid characters`);
  }
  return mysql.escapeId(identifier);
}

function parseJsonSetting(key, fallbackValue = []) {
  let raw = Settings.get(key);
  if (!raw) {
    if (key === 'qbox_person_custom_fields') raw = process.env.QBOX_PERSON_CUSTOM_FIELDS || '';
    if (key === 'qbox_vehicle_custom_fields') raw = process.env.QBOX_VEHICLE_CUSTOM_FIELDS || '';
  }
  if (!raw) return fallbackValue;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${key} must be a JSON array`);
    }
    return parsed;
  } catch (err) {
    throw new Error(`Invalid JSON in setting ${key}: ${err.message}`);
  }
}

function parseMaybeJson(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeAddressText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value || '');
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => String(line || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function pickFirstAddressString(source, keys = []) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = normalizeAddressText(source[key]);
    if (value) return value;
  }
  return '';
}

function formatAddressObject(addressObj = {}) {
  if (!addressObj || typeof addressObj !== 'object' || Array.isArray(addressObj)) return '';

  const unit = pickFirstAddressString(addressObj, ['unit', 'flat', 'apartment', 'apt', 'suite']);
  const streetNumber = pickFirstAddressString(addressObj, ['street_number', 'streetno', 'house_number', 'housenumber', 'number']);
  const streetName = pickFirstAddressString(addressObj, ['street_name', 'street', 'road', 'streetname']);
  const streetLine = [unit, streetNumber, streetName].filter(Boolean).join(' ').trim();

  const line1 = streetLine || pickFirstAddressString(addressObj, ['line1', 'line_1', 'address1', 'address_1']);
  const line2 = pickFirstAddressString(addressObj, ['line2', 'line_2', 'address2', 'address_2']);
  const suburb = pickFirstAddressString(addressObj, ['suburb', 'city', 'town', 'district']);
  const state = pickFirstAddressString(addressObj, ['state', 'province', 'region']);
  const postcode = pickFirstAddressString(addressObj, ['postcode', 'postal_code', 'postal', 'zip', 'zip_code']);
  const locality = [suburb, state, postcode].filter(Boolean).join(' ').trim();

  return [line1, line2, locality].filter(Boolean).join('\n').trim();
}

function resolveAddressFromCharInfo(info = {}) {
  if (!info || typeof info !== 'object') return '';

  const directAddress = pickFirstAddressString(info, [
    'address',
    'home_address',
    'residential_address',
    'street_address',
  ]);
  if (directAddress) return directAddress;

  const nestedAddress = info.address;
  if (nestedAddress && typeof nestedAddress === 'object' && !Array.isArray(nestedAddress)) {
    const formattedNested = formatAddressObject(nestedAddress);
    if (formattedNested) return formattedNested;
  }

  const unit = pickFirstAddressString(info, ['unit', 'flat', 'apartment', 'apt', 'suite']);
  const streetNumber = pickFirstAddressString(info, ['street_number', 'streetno', 'house_number', 'housenumber', 'number']);
  const streetName = pickFirstAddressString(info, ['street_name', 'street', 'road', 'streetname']);
  const streetLine = [unit, streetNumber, streetName].filter(Boolean).join(' ').trim();
  const line1 = streetLine || pickFirstAddressString(info, ['line1', 'line_1', 'address1', 'address_1']);

  const suburb = pickFirstAddressString(info, ['suburb', 'city', 'town', 'district']);
  const state = pickFirstAddressString(info, ['state', 'province', 'region']);
  const postcode = pickFirstAddressString(info, ['postcode', 'postal_code', 'postal', 'zip', 'zip_code']);
  const locality = [suburb, state, postcode].filter(Boolean).join(' ').trim();

  return [line1, locality].filter(Boolean).join('\n').trim();
}

function formatAddressFromPropertyRow(row = {}) {
  if (!row || typeof row !== 'object') return '';
  const propertyName = normalizeAddressText(row.property_name);
  return propertyName;
}

async function resolveAddressFromPropertiesTable(poolConn, citizenId, propertiesConfig = {}) {
  const normalizedCitizenId = String(citizenId || '').trim();
  if (!normalizedCitizenId) return '';
  if (!poolConn || typeof poolConn.query !== 'function') return '';

  const propertiesTable = String(propertiesConfig.table || 'properties').trim();
  const propertiesOwnerCol = String(propertiesConfig.ownerCol || 'owner').trim();
  const propertiesNameCol = String(propertiesConfig.nameCol || 'property_name').trim();
  if (!propertiesTable || !propertiesOwnerCol || !propertiesNameCol) return '';
  if (
    !IDENTIFIER_RE.test(propertiesTable)
    || !IDENTIFIER_RE.test(propertiesOwnerCol)
    || !IDENTIFIER_RE.test(propertiesNameCol)
  ) {
    return '';
  }

  const tableSql = escapeIdentifier(propertiesTable, 'properties table');
  const ownerColSql = escapeIdentifier(propertiesOwnerCol, 'properties owner column');
  const nameColSql = escapeIdentifier(propertiesNameCol, 'properties name column');

  try {
    const [rows] = await poolConn.query(
      `SELECT ${nameColSql} AS property_name
       FROM ${tableSql}
       WHERE ${ownerColSql} = ?
       LIMIT 5`,
      [normalizedCitizenId]
    );

    for (const row of rows || []) {
      const resolved = formatAddressFromPropertyRow(row);
      if (resolved) return resolved;
    }
  } catch (err) {
    const message = String(err?.message || '').toLowerCase();
    const missingTable = message.includes("doesn't exist")
      || message.includes('does not exist')
      || message.includes('unknown column');
    if (!missingTable) {
      console.warn('QBox property address lookup failed:', err?.message || err);
    }
    return '';
  }

  return '';
}

function getPathValue(source, path) {
  if (!path) return source;
  const parts = String(path).split('.').filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function normalizeCustomFields(customFields, allowedSources) {
  const normalized = [];
  for (const field of customFields) {
    if (!field || typeof field !== 'object') continue;
    const key = String(field.key || '').trim();
    if (!key) continue;
    const source = String(field.source || 'column').trim();
    if (!allowedSources.includes(source)) continue;
    normalized.push({
      key,
      source,
      column: field.column ? String(field.column).trim() : '',
      path: field.path ? String(field.path).trim() : '',
    });
  }
  return normalized;
}

function buildCustomFieldValues({ row, charinfo, mappings }) {
  const customFields = {};
  for (const mapping of mappings) {
    let value;

    if (mapping.source === 'charinfo') {
      value = getPathValue(charinfo, mapping.path || mapping.key);
    } else if (mapping.source === 'row') {
      value = getPathValue(row, mapping.path || mapping.key);
    } else {
      if (!mapping.column) continue;
      const raw = row[mapping.column];
      if (mapping.path) {
        value = getPathValue(parseMaybeJson(raw), mapping.path);
      } else {
        value = raw;
      }
    }

    if (value !== undefined) {
      customFields[mapping.key] = value;
    }
  }
  return customFields;
}

function isMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(v => isMeaningfulValue(v));
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function valueToSignature(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function valueToDisplay(value) {
  if (!isMeaningfulValue(value)) return '';
  if (Array.isArray(value)) {
    return value.map(v => valueToDisplay(v)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function normalizeFriendlyValuesMap(value) {
  if (!value) return { map: {}, json: '' };

  let parsed = null;
  if (typeof value === 'string') {
    const text = String(value || '').trim();
    if (!text) return { map: {}, json: '' };
    parsed = parseMaybeJson(text);
  } else if (typeof value === 'object' && !Array.isArray(value)) {
    parsed = value;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { map: {}, json: '' };
  }

  const normalized = {};
  for (const [rawKey, rawLabel] of Object.entries(parsed)) {
    const key = String(rawKey || '').trim();
    if (!key) continue;
    normalized[key] = rawLabel === null || rawLabel === undefined
      ? ''
      : String(rawLabel);
  }

  if (Object.keys(normalized).length === 0) {
    return { map: {}, json: '' };
  }

  return { map: normalized, json: JSON.stringify(normalized) };
}

function applyFriendlyValueMap(value, friendlyValuesMap) {
  if (!friendlyValuesMap || typeof friendlyValuesMap !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(item => applyFriendlyValueMap(item, friendlyValuesMap));
  }
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') return value;

  const directKey = typeof value === 'string' ? value.trim() : String(value);
  if (Object.prototype.hasOwnProperty.call(friendlyValuesMap, directKey)) {
    return friendlyValuesMap[directKey];
  }

  const lowerKey = directKey.toLowerCase();
  if (lowerKey !== directKey && Object.prototype.hasOwnProperty.call(friendlyValuesMap, lowerKey)) {
    return friendlyValuesMap[lowerKey];
  }

  return value;
}

function normalizeFieldKey(value, fallbackLabel = '') {
  let key = String(value || '').trim().toLowerCase();
  if (!key && fallbackLabel) {
    key = String(fallbackLabel || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
  return key;
}

function normalizeFieldType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const allowed = new Set(['text', 'number', 'date', 'image', 'phone', 'email', 'boolean', 'select', 'badge']);
  return allowed.has(normalized) ? normalized : 'text';
}

function normalizePreviewWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(4, Math.trunc(parsed)));
}

function getBaseRowsForTable(baseRowsByTable, tableName) {
  if (!baseRowsByTable || typeof baseRowsByTable !== 'object') return null;
  if (Array.isArray(baseRowsByTable[tableName])) return baseRowsByTable[tableName];

  const target = String(tableName || '').toLowerCase();
  for (const [key, rows] of Object.entries(baseRowsByTable)) {
    if (String(key || '').toLowerCase() === target && Array.isArray(rows)) {
      return rows;
    }
  }
  return null;
}

function normalizeDatabaseFieldMappings(entityType = 'person') {
  // Advanced DB field mapping is intentionally disabled.
  // QBox integration now only relies on direct table/column settings.
  void entityType;
  return { categories: [], mappings: [] };
}

function flattenLookupFields(categories = []) {
  const lookupFields = [];
  for (const category of Array.isArray(categories) ? categories : []) {
    const fields = Array.isArray(category?.fields) ? category.fields : [];
    for (const field of fields) {
      const displayValue = String(field?.display_value || '').trim();
      if (!displayValue) continue;
      lookupFields.push({
        id: field.id,
        key: String(field.field_key || '').trim() || normalizeFieldKey(field.label, field.label),
        label: String(field.label || '').trim() || 'Field',
        value: field.value,
        display_value: displayValue,
        field_type: normalizeFieldType(field.field_type),
        preview_width: normalizePreviewWidth(field.preview_width),
        sort_order: Number.isFinite(Number(field.sort_order)) ? Number(field.sort_order) : 0,
        category_id: Number(field.category_id || 0),
        category_name: String(category?.name || '').trim() || 'Uncategorized',
      });
    }
  }
  return lookupFields;
}

async function queryRowsByMappingSource({ poolRef, tableName, joinColumn, joinValue }) {
  const tableNameSql = escapeIdentifier(tableName, `mapping table "${tableName}"`);
  const joinColSql = escapeIdentifier(joinColumn, `mapping join column "${joinColumn}"`);
  const [rows] = await poolRef.query(
    `SELECT * FROM ${tableNameSql} WHERE ${joinColSql} = ? LIMIT 100`,
    [joinValue]
  );
  return Array.isArray(rows) ? rows : [];
}

function extractValueFromMappingRow(row, mapping) {
  const raw = row?.[mapping.column_name];
  if (mapping.is_json) {
    const parsed = parseMaybeJson(raw);
    if (!mapping.json_key) return parsed;
    return getPathValue(parsed, mapping.json_key);
  }
  return raw;
}

function collectMappingValues(rows, mapping) {
  const values = [];
  const seen = new Set();
  for (const row of rows) {
    const value = extractValueFromMappingRow(row, mapping);
    if (!isMeaningfulValue(value)) continue;
    const signature = valueToSignature(value);
    if (seen.has(signature)) continue;
    seen.add(signature);
    values.push(value);
  }
  return values;
}

async function resolveMappedFieldData({
  entityType = 'person',
  joinValue,
  baseRowsByTable = {},
  includeSearchOnly = false, // DEPRECATED: All fields are now always included
}) {
  const normalizedJoinValue = String(joinValue || '').trim();
  if (!normalizedJoinValue) {
    return { categories: [], custom_fields: {} };
  }

  const { categories, mappings } = normalizeDatabaseFieldMappings(entityType);
  // Always include all mappings - the includeSearchOnly parameter is deprecated
  const activeMappings = mappings;

  if (activeMappings.length === 0) {
    return { categories: [], custom_fields: {} };
  }

  const activeCategoryIds = new Set(activeMappings.map(mapping => mapping.category_id));
  const resolvedCategories = categories
    .filter(category => activeCategoryIds.has(category.id))
    .map(category => ({
      id: category.id,
      name: String(category.name || '').trim() || 'Uncategorized',
      entity_type: category.entity_type,
      sort_order: Number.isFinite(Number(category.sort_order)) ? Number(category.sort_order) : 0,
      fields: [],
    }));

  const categoryMap = new Map(resolvedCategories.map(category => [category.id, category]));
  const rowsCache = new Map();
  const customFields = {};
  const poolRef = await getPool();

  for (const mapping of activeMappings) {
    const sourceKey = `${mapping.table_name}::${mapping.character_join_column}`;
    let sourceRows = rowsCache.get(sourceKey);

    if (!sourceRows) {
      const seededRows = getBaseRowsForTable(baseRowsByTable, mapping.table_name);
      if (Array.isArray(seededRows) && seededRows.length > 0) {
        const filteredRows = seededRows.filter((row) => {
          const joinCandidate = String(row?.[mapping.character_join_column] || '').trim();
          return joinCandidate === normalizedJoinValue;
        });
        if (filteredRows.length > 0) {
          sourceRows = filteredRows;
        }
      }

      if (!sourceRows) {
        try {
          sourceRows = await queryRowsByMappingSource({
            poolRef,
            tableName: mapping.table_name,
            joinColumn: mapping.character_join_column,
            joinValue: normalizedJoinValue,
          });
        } catch (err) {
          console.warn('[QBox] Failed to resolve mapped field source:', {
            table: mapping.table_name,
            join_column: mapping.character_join_column,
            label: mapping.label,
            error: err?.message || String(err),
          });
          sourceRows = [];
        }
      }

      rowsCache.set(sourceKey, sourceRows);
    }

    const values = collectMappingValues(sourceRows, mapping);
    const rawFieldValue = values.length === 0 ? null : (values.length === 1 ? values[0] : values);
    const fieldValue = applyFriendlyValueMap(rawFieldValue, mapping.friendly_values_map);
    const displayValue = valueToDisplay(fieldValue);

    const category = categoryMap.get(mapping.category_id);
    if (category) {
      category.fields.push({
        id: mapping.id,
        key: mapping.field_key,
        label: mapping.label,
        value: fieldValue,
        raw_value: rawFieldValue,
        display_value: displayValue,
        is_empty: !isMeaningfulValue(fieldValue),
        field_key: mapping.field_key,
        field_type: mapping.field_type,
        preview_width: mapping.preview_width,
        category_id: mapping.category_id,
        table_name: mapping.table_name,
        column_name: mapping.column_name,
        character_join_column: mapping.character_join_column,
        is_json: mapping.is_json,
        json_key: mapping.json_key,
        sort_order: mapping.sort_order,
        is_search_column: mapping.is_search_column,
        friendly_values_json: mapping.friendly_values_json,
      });
    }

    if (displayValue) {
      customFields[mapping.label] = displayValue;
    }
  }

  return {
    categories: resolvedCategories,
    custom_fields: customFields,
  };
}

function normalizeJobName(value) {
  return String(value || '').trim();
}

function normalizeJobGrade(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function isPlayerGroupsSchemaLookupError(err) {
  const code = String(err?.code || '').trim().toUpperCase();
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = String(err?.message || '').toLowerCase();
  return (
    message.includes('doesn\'t exist')
    || message.includes('unknown column')
    || message.includes('table')
  ) && message.includes('player_groups');
}

function parseJobContainer(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseMaybeJson(trimmed);
  if (parsed && typeof parsed === 'object') return parsed;
  return { name: trimmed };
}

function extractJobFromCharacterRow(row, charinfo, configuredJobColumn) {
  const candidateContainers = [];
  if (configuredJobColumn && row && Object.prototype.hasOwnProperty.call(row, configuredJobColumn)) {
    candidateContainers.push(parseJobContainer(row[configuredJobColumn]));
  }
  if ((!configuredJobColumn || configuredJobColumn !== 'job') && row && Object.prototype.hasOwnProperty.call(row, 'job')) {
    candidateContainers.push(parseJobContainer(row.job));
  }
  if (charinfo && typeof charinfo === 'object' && Object.prototype.hasOwnProperty.call(charinfo, 'job')) {
    candidateContainers.push(parseJobContainer(charinfo.job));
  }

  let jobName = '';
  let jobGrade = null;
  for (const container of candidateContainers) {
    if (!container || typeof container !== 'object') continue;

    if (!jobName) {
      const candidateName = (
        container.name
        || container.job
        || container.id
        || container.label
      );
      jobName = normalizeJobName(candidateName);
    }

    if (jobGrade === null) {
      if (container.grade && typeof container.grade === 'object') {
        jobGrade = normalizeJobGrade(
          container.grade.level
          ?? container.grade.grade
          ?? container.grade.value
          ?? container.grade.rank
        );
      } else if (container.grade !== undefined) {
        jobGrade = normalizeJobGrade(container.grade);
      } else if (container.grade_level !== undefined) {
        jobGrade = normalizeJobGrade(container.grade_level);
      } else if (container.rank !== undefined) {
        jobGrade = normalizeJobGrade(container.rank);
      }
    }
  }

  if (!jobName && row && typeof row === 'object') {
    if (row.job_name !== undefined) {
      jobName = normalizeJobName(row.job_name);
    }
    if (jobGrade === null && row.job_grade !== undefined) {
      jobGrade = normalizeJobGrade(row.job_grade);
    }
  }

  if (!jobName) return null;
  return {
    name: jobName,
    grade: jobGrade === null ? 0 : normalizeJobGrade(jobGrade),
  };
}

function getQboxTableConfig() {
  const playersTable = getSetting('qbox_players_table', 'players');
  const vehiclesTable = getSetting('qbox_vehicles_table', 'player_vehicles');
  const jobTable = getSetting('qbox_job_table', playersTable);
  const jobMatchCol = getSetting('qbox_job_match_col', 'license');
  const jobGradeCol = getSetting('qbox_job_grade_col', '');
  return {
    playersTable,
    vehiclesTable,
    jobTable,
    jobMatchCol,
    jobGradeCol,
    playerGroupsTable: getSetting('qbox_player_groups_table', 'player_groups'),
    playerGroupsCitizenIdCol: getSetting('qbox_player_groups_citizenid_col', 'citizenid'),
    playerGroupsGroupCol: getSetting('qbox_player_groups_group_col', 'group'),
    playerGroupsGradeCol: getSetting('qbox_player_groups_grade_col', 'grade'),
    propertiesTable: getSetting('qbox_properties_table', 'properties'),
    propertiesOwnerCol: getSetting('qbox_properties_owner_col', 'owner'),
    propertiesNameCol: getSetting('qbox_properties_name_col', 'property_name'),
    propertiesInteriorCol: getSetting('qbox_properties_interior_col', 'interior'),
    citizenIdCol: getSetting('qbox_citizenid_col', 'citizenid'),
    charInfoCol: getSetting('qbox_charinfo_col', 'charinfo'),
    moneyCol: getSetting('qbox_money_col', 'money'),
    jobCol: getSetting('qbox_job_col', 'job'),
  };
}

function getDbConfig() {
  // Try settings table first (admin-configured), fall back to .env
  const host = getSetting('qbox_host', config.qbox.host);
  const port = parseInt(getSetting('qbox_port', config.qbox.port), 10);
  const user = getSetting('qbox_user', config.qbox.user);
  const password = getSetting('qbox_password', config.qbox.password);
  const database = getSetting('qbox_database', config.qbox.database);
  return { host, port, user, password, database };
}

async function initPool() {
  const dbConfig = getDbConfig();
  poolConfigSignature = JSON.stringify(dbConfig);
  if (pool) {
    await pool.end().catch(() => {});
  }
  pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
  return pool;
}

async function getPool() {
  const currentSignature = JSON.stringify(getDbConfig());
  if (!pool || currentSignature !== poolConfigSignature) {
    await initPool();
  }
  return pool;
}

async function testConnection() {
  try {
    const p = await initPool();
    const [rows] = await p.query('SELECT 1 as ok');
    return { success: true, message: 'Connected successfully' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function getTableColumns(tableName) {
  const p = await getPool();
  const [rows] = await p.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?
     ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  return rows.map(r => ({
    name: r.COLUMN_NAME,
    dataType: r.DATA_TYPE,
    columnType: r.COLUMN_TYPE,
    nullable: r.IS_NULLABLE === 'YES',
    isJson: String(r.DATA_TYPE).toLowerCase() === 'json',
  }));
}

async function listTableColumns(tableName) {
  const normalized = String(tableName || '').trim();
  if (!normalized) throw new Error('table_name is required');
  if (!IDENTIFIER_RE.test(normalized)) throw new Error('table_name contains invalid characters');
  return getTableColumns(normalized);
}

function buildColumnsMap(columns) {
  return columns.reduce((acc, col) => {
    acc[col.name] = col;
    return acc;
  }, {});
}

async function inspectConfiguredSchema() {
  const report = {
    success: false,
    message: '',
    config: {},
    players: { exists: false, columns: [], warnings: [] },
    jobs: { exists: false, columns: [], warnings: [] },
    vehicles: { exists: false, columns: [], warnings: [] },
    errors: [],
  };

  try {
    await getPool();
    const cfg = getQboxTableConfig();
    report.config = cfg;

    if (!IDENTIFIER_RE.test(cfg.playersTable) || !IDENTIFIER_RE.test(cfg.vehiclesTable) || !IDENTIFIER_RE.test(cfg.jobTable)) {
      report.errors.push('Configured table names contain invalid characters');
      report.message = 'Schema check failed';
      return report;
    }
    if (
      !IDENTIFIER_RE.test(cfg.citizenIdCol)
      || !IDENTIFIER_RE.test(cfg.charInfoCol)
      || !IDENTIFIER_RE.test(cfg.moneyCol)
      || !IDENTIFIER_RE.test(cfg.jobCol)
      || !IDENTIFIER_RE.test(cfg.jobMatchCol)
      || (String(cfg.jobGradeCol || '').trim() && !IDENTIFIER_RE.test(cfg.jobGradeCol))
    ) {
      report.errors.push('Configured player column names contain invalid characters');
      report.message = 'Schema check failed';
      return report;
    }

    const playersColumns = await getTableColumns(cfg.playersTable);
    const jobColumns = cfg.jobTable === cfg.playersTable
      ? playersColumns
      : await getTableColumns(cfg.jobTable);
    const vehiclesColumns = await getTableColumns(cfg.vehiclesTable);
    report.players.exists = playersColumns.length > 0;
    report.players.columns = playersColumns;
    report.jobs.exists = jobColumns.length > 0;
    report.jobs.columns = jobColumns;
    report.vehicles.exists = vehiclesColumns.length > 0;
    report.vehicles.columns = vehiclesColumns;

    if (!report.players.exists) {
      report.errors.push(`Players table "${cfg.playersTable}" was not found`);
    }
    if (!report.jobs.exists) {
      report.errors.push(`Job source table "${cfg.jobTable}" was not found`);
    }
    if (!report.vehicles.exists) {
      report.errors.push(`Vehicles table "${cfg.vehiclesTable}" was not found`);
    }

    const playersMap = buildColumnsMap(playersColumns);
    if (report.players.exists && !playersMap[cfg.citizenIdCol]) {
      report.errors.push(`Citizen ID column "${cfg.citizenIdCol}" was not found in "${cfg.playersTable}"`);
    }
    if (report.players.exists && !playersMap[cfg.charInfoCol]) {
      report.errors.push(`Charinfo column "${cfg.charInfoCol}" was not found in "${cfg.playersTable}"`);
    }
    if (report.players.exists && !playersMap[cfg.moneyCol]) {
      report.players.warnings.push(`Money column "${cfg.moneyCol}" was not found in "${cfg.playersTable}"`);
    }
    const jobsMap = buildColumnsMap(jobColumns);
    if (report.jobs.exists && !jobsMap[cfg.jobCol]) {
      report.jobs.warnings.push(`Job column "${cfg.jobCol}" was not found in "${cfg.jobTable}"`);
    }
    if (report.jobs.exists && !jobsMap[cfg.jobMatchCol]) {
      report.jobs.warnings.push(`Job source match column "${cfg.jobMatchCol}" was not found in "${cfg.jobTable}" (job sync lookups may fail)`);
    }
    if (report.jobs.exists && String(cfg.jobGradeCol || '').trim() && !jobsMap[cfg.jobGradeCol]) {
      report.jobs.warnings.push(`Job grade column "${cfg.jobGradeCol}" was not found in "${cfg.jobTable}" (grade-specific role matching may fail)`);
    }
    if (playersMap[cfg.charInfoCol] && !playersMap[cfg.charInfoCol].isJson) {
      report.players.warnings.push(`"${cfg.charInfoCol}" is ${playersMap[cfg.charInfoCol].dataType}, not JSON. JSON parsing fallback will be used.`);
    }

    report.success = report.errors.length === 0;
    report.message = report.success ? 'Schema check completed' : 'Schema check failed';
    return report;
  } catch (err) {
    report.errors.push(err.message);
    report.message = 'Schema check failed';
    return report;
  }
}

async function searchCharacters(term) {
  try {
    const p = await getPool();
    const { playersTable, citizenIdCol, charInfoCol } = getQboxTableConfig();
    const tableNameSql = escapeIdentifier(playersTable, 'players table');
    const citizenIdColSql = escapeIdentifier(citizenIdCol, 'citizen ID column');
    const charInfoColSql = escapeIdentifier(charInfoCol, 'charinfo column');
    const raw = String(term || '').trim();
    if (!raw) return [];

    const tokens = Array.from(new Set(raw.toLowerCase().split(/\s+/).filter(Boolean))).slice(0, 6);
    if (tokens.length === 0) return [];

    const tokenClauses = [];
    const params = [];

    for (const token of tokens) {
      const tokenLike = `%${token}%`;
      const rawLike = `%${token}%`;

      tokenClauses.push(`(
        LOWER(${citizenIdColSql}) LIKE ?
        OR LOWER(CAST(${charInfoColSql} AS CHAR)) LIKE ?
        OR LOWER(CASE WHEN JSON_VALID(${charInfoColSql}) THEN JSON_UNQUOTE(JSON_EXTRACT(${charInfoColSql}, '$.firstname')) ELSE '' END) LIKE ?
        OR LOWER(CASE WHEN JSON_VALID(${charInfoColSql}) THEN JSON_UNQUOTE(JSON_EXTRACT(${charInfoColSql}, '$.lastname')) ELSE '' END) LIKE ?
        OR LOWER(CASE WHEN JSON_VALID(${charInfoColSql}) THEN CONCAT(
             COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${charInfoColSql}, '$.firstname')), ''),
             ' ',
             COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${charInfoColSql}, '$.lastname')), '')
           ) ELSE '' END) LIKE ?
      )`);

      params.push(rawLike, rawLike, tokenLike, tokenLike, tokenLike);
    }

    const [rows] = await p.query(
      `SELECT *
       FROM ${tableNameSql}
       WHERE ${tokenClauses.join(' AND ')}
       LIMIT 25`,
      params
    );

    return Promise.all(rows.map(async (row) => {
      const citizenId = String(row[citizenIdCol] || '').trim();
      const info = parseMaybeJson(row[charInfoCol]);
      const lookupFields = [
        { key: 'first_name', label: 'First Name', display_value: String(info.firstname || '').trim(), field_type: 'text', preview_width: 1, sort_order: 0, category_name: 'Identity' },
        { key: 'last_name', label: 'Last Name', display_value: String(info.lastname || '').trim(), field_type: 'text', preview_width: 1, sort_order: 1, category_name: 'Identity' },
        { key: 'dob', label: 'DOB', display_value: String(info.birthdate || '').trim(), field_type: 'date', preview_width: 1, sort_order: 2, category_name: 'Identity' },
        { key: 'phone', label: 'Phone', display_value: String(info.phone || '').trim(), field_type: 'phone', preview_width: 1, sort_order: 3, category_name: 'Contact' },
      ].filter((field) => String(field.display_value || '').trim().length > 0);

      return {
        citizenid: citizenId,
        firstname: info.firstname || '',
        lastname: info.lastname || '',
        birthdate: info.birthdate || '',
        gender: info.gender !== undefined ? String(info.gender) : '',
        phone: info.phone || '',
        nationality: info.nationality || '',
        custom_fields: {},
        lookup_fields: lookupFields,
      };
    }));
  } catch (err) {
    console.error('QBox character search error:', err);
    throw new Error(`QBox character search error: ${err.message}`);
  }
}

async function getCharacterById(citizenId) {
  try {
    const p = await getPool();
    const {
      playersTable,
      citizenIdCol,
      charInfoCol,
      jobCol,
      propertiesTable,
      propertiesOwnerCol,
      propertiesNameCol,
      propertiesInteriorCol,
    } = getQboxTableConfig();
    const tableNameSql = escapeIdentifier(playersTable, 'players table');
    const citizenIdColSql = escapeIdentifier(citizenIdCol, 'citizen ID column');
    const charInfoColSql = escapeIdentifier(charInfoCol, 'charinfo column');

    const [rows] = await p.query(
      `SELECT * FROM ${tableNameSql} WHERE ${citizenIdColSql} = ? LIMIT 1`,
      [citizenId]
    );

    if (rows.length === 0) return null;
    const row = rows[0];
    const info = parseMaybeJson(row[charInfoCol]);
    const normalizedCitizenId = String(row[citizenIdCol] || '').trim();
    const extractedJob = extractJobFromCharacterRow(row, info, jobCol);
    const charInfoAddress = resolveAddressFromCharInfo(info);
    const propertyAddress = await resolveAddressFromPropertiesTable(p, normalizedCitizenId, {
      table: propertiesTable,
      ownerCol: propertiesOwnerCol,
      nameCol: propertiesNameCol,
      interiorCol: propertiesInteriorCol,
    });
    const resolvedAddress = propertyAddress || charInfoAddress;
    const lookupFields = [
      { key: 'first_name', label: 'First Name', display_value: String(info.firstname || '').trim(), field_type: 'text', preview_width: 1, sort_order: 0, category_name: 'Identity' },
      { key: 'last_name', label: 'Last Name', display_value: String(info.lastname || '').trim(), field_type: 'text', preview_width: 1, sort_order: 1, category_name: 'Identity' },
      { key: 'dob', label: 'DOB', display_value: String(info.birthdate || '').trim(), field_type: 'date', preview_width: 1, sort_order: 2, category_name: 'Identity' },
      { key: 'phone', label: 'Phone', display_value: String(info.phone || '').trim(), field_type: 'phone', preview_width: 1, sort_order: 3, category_name: 'Contact' },
    ].filter((field) => String(field.display_value || '').trim().length > 0);

    return {
      citizenid: normalizedCitizenId,
      firstname: info.firstname || '',
      lastname: info.lastname || '',
      birthdate: info.birthdate || '',
      gender: info.gender !== undefined ? String(info.gender) : '',
      phone: info.phone || '',
      nationality: info.nationality || '',
      address: resolvedAddress,
      job: extractedJob,
      custom_fields: {},
      mapped_categories: [],
      lookup_fields: lookupFields,
      raw: row,
    };
  } catch (err) {
    console.error('QBox get character error:', err);
    throw new Error(`QBox character lookup error: ${err.message}`);
  }
}

async function getCharacterJobById(citizenId) {
  const character = await getCharacterById(citizenId);
  if (!character || !character.job || !character.job.name) {
    return null;
  }
  return {
    citizenid: String(character.citizenid || '').trim(),
    name: normalizeJobName(character.job.name),
    grade: normalizeJobGrade(character.job.grade),
  };
}

async function getPlayerCharacterJobsByCitizenId(citizenId) {
  const normalizedCitizenId = String(citizenId || '').trim();
  if (!normalizedCitizenId) return [];

  try {
    const p = await getPool();
    const {
      playersTable,
      jobTable,
      jobMatchCol,
      citizenIdCol,
      charInfoCol,
      jobCol,
      jobGradeCol,
    } = getQboxTableConfig();
    const sourceTable = String(jobTable || playersTable).trim() || playersTable;
    const tableNameSql = escapeIdentifier(sourceTable, 'job source table');
    const citizenIdColSql = escapeIdentifier(citizenIdCol, 'citizen ID column');
    const jobMatchColKey = String(jobMatchCol || 'license').trim() || 'license';
    const jobMatchColSql = escapeIdentifier(jobMatchColKey, 'job source match column');
    const configuredJobGradeCol = String(jobGradeCol || '').trim();

    let rows = [];
    const exactRowsByKey = new Map();
    const accountLicense = await getLicenseByCitizenId(normalizedCitizenId).catch(() => null);
    const matchCandidates = [];
    if (accountLicense) matchCandidates.push(String(accountLicense).trim());
    if (normalizedCitizenId && !matchCandidates.includes(normalizedCitizenId)) {
      matchCandidates.push(normalizedCitizenId);
    }

    for (const candidate of matchCandidates) {
      if (!candidate) continue;
      const [candidateRows] = await p.query(
        `SELECT * FROM ${tableNameSql} WHERE ${jobMatchColSql} = ?`,
        [candidate]
      );
      if (Array.isArray(candidateRows) && candidateRows.length > 0) {
        for (const row of candidateRows) {
          const key = JSON.stringify(row);
          if (exactRowsByKey.has(key)) continue;
          exactRowsByKey.set(key, row);
        }
      }
    }
    rows = Array.from(exactRowsByKey.values());

    // Some job tables store identifiers with inconsistent case/whitespace. If no exact
    // match rows were found, retry with a normalized string compare.
    if ((!Array.isArray(rows) || rows.length === 0) && matchCandidates.length > 0) {
      const normalizedRowsByKey = new Map();
      for (const candidate of matchCandidates) {
        if (!candidate) continue;
        const [candidateRows] = await p.query(
          `SELECT * FROM ${tableNameSql}
           WHERE LOWER(TRIM(CAST(${jobMatchColSql} AS CHAR))) = LOWER(TRIM(?))`,
          [candidate]
        );
        if (!Array.isArray(candidateRows) || candidateRows.length === 0) continue;
        for (const row of candidateRows) {
          const key = JSON.stringify(row);
          if (normalizedRowsByKey.has(key)) continue;
          normalizedRowsByKey.set(key, row);
        }
      }
      rows = Array.from(normalizedRowsByKey.values());
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      try {
        [rows] = await p.query(
          `SELECT * FROM ${tableNameSql} WHERE ${citizenIdColSql} = ? LIMIT 1`,
          [normalizedCitizenId]
        );
      } catch (fallbackErr) {
        if (String(fallbackErr?.code || '').trim().toUpperCase() !== 'ER_BAD_FIELD_ERROR') {
          throw fallbackErr;
        }
        rows = [];
      }
    }

    const seen = new Set();
    const jobs = [];
    for (const row of rows || []) {
      const rowCitizenId = String(row?.[citizenIdCol] || '').trim() || normalizedCitizenId;
      const charInfo = parseMaybeJson(
        row && Object.prototype.hasOwnProperty.call(row, charInfoCol)
          ? row[charInfoCol]
          : row?.charinfo
      );
      const extractedJob = extractJobFromCharacterRow(row, charInfo, jobCol);
      if (!extractedJob || !String(extractedJob.name || '').trim()) continue;

      const name = normalizeJobName(extractedJob.name);
      let grade = normalizeJobGrade(extractedJob.grade);
      if (configuredJobGradeCol && Object.prototype.hasOwnProperty.call(row, configuredJobGradeCol)) {
        grade = normalizeJobGrade(row[configuredJobGradeCol]);
      }
      const dedupeKey = `${rowCitizenId.toLowerCase()}::${name.toLowerCase()}::${grade}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      jobs.push({
        citizenid: rowCitizenId,
        name,
        grade,
      });
    }

    jobs.sort((a, b) => {
      const aPreferred = String(a.citizenid || '').trim().toLowerCase() === normalizedCitizenId.toLowerCase() ? 1 : 0;
      const bPreferred = String(b.citizenid || '').trim().toLowerCase() === normalizedCitizenId.toLowerCase() ? 1 : 0;
      if (bPreferred !== aPreferred) return bPreferred - aPreferred;
      if (b.grade !== a.grade) return b.grade - a.grade;
      const nameCmp = String(a.name || '').localeCompare(String(b.name || ''));
      if (nameCmp !== 0) return nameCmp;
      return String(a.citizenid || '').localeCompare(String(b.citizenid || ''));
    });

    return jobs;
  } catch (err) {
    console.error('QBox get player character jobs error:', err);
    throw new Error(`QBox player character jobs lookup error: ${err.message}`);
  }
}

async function getCharacterJobGroupsById(citizenId) {
  const normalizedCitizenId = String(citizenId || '').trim();
  if (!normalizedCitizenId) return [];

  try {
    const p = await getPool();
    const {
      playerGroupsTable,
      playerGroupsCitizenIdCol,
      playerGroupsGroupCol,
      playerGroupsGradeCol,
    } = getQboxTableConfig();
    const tableSql = escapeIdentifier(playerGroupsTable, 'player groups table');
    const citizenIdColSql = escapeIdentifier(playerGroupsCitizenIdCol, 'player groups citizen ID column');
    const groupColSql = escapeIdentifier(playerGroupsGroupCol, 'player groups group column');
    const gradeColSql = escapeIdentifier(playerGroupsGradeCol, 'player groups grade column');

    const [rows] = await p.query(
      `SELECT ${groupColSql} AS job_name, ${gradeColSql} AS job_grade
       FROM ${tableSql}
       WHERE ${citizenIdColSql} = ?`,
      [normalizedCitizenId]
    );

    const seen = new Set();
    const groups = [];
    for (const row of rows || []) {
      const name = normalizeJobName(row?.job_name);
      if (!name) continue;
      const grade = normalizeJobGrade(row?.job_grade);
      const key = `${name.toLowerCase()}::${grade}`;
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push({ citizenid: normalizedCitizenId, name, grade });
    }

    groups.sort((a, b) => {
      if (b.grade !== a.grade) return b.grade - a.grade;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return groups;
  } catch (err) {
    if (isPlayerGroupsSchemaLookupError(err)) {
      if (!playerGroupsLookupWarningShown) {
        playerGroupsLookupWarningShown = true;
        console.warn('[QBox] player_groups lookup unavailable for reverse job sync; falling back to character job fields:', err.message);
      }
      return [];
    }
    throw err;
  }
}

async function searchVehicles(term) {
  try {
    const p = await getPool();
    const { vehiclesTable } = getQboxTableConfig();
    const tableNameSql = escapeIdentifier(vehiclesTable, 'vehicles table');

    const [rows] = await p.query(
      `SELECT * FROM ${tableNameSql}
       WHERE plate LIKE ? OR vehicle LIKE ?
       LIMIT 25`,
      [`%${term}%`, `%${term}%`]
    );

    return Promise.all(rows.map(async (row) => {
      const ownerCitizenId = String(row.citizenid || row.owner || '').trim();
      const lookupFields = [
        { key: 'plate', label: 'Plate', display_value: String(row.plate || '').trim(), field_type: 'text', preview_width: 1, sort_order: 0, category_name: 'Vehicle' },
        { key: 'model', label: 'Model', display_value: String(row.vehicle || '').trim(), field_type: 'text', preview_width: 1, sort_order: 1, category_name: 'Vehicle' },
        { key: 'state', label: 'State', display_value: row.state !== undefined ? String(row.state) : '', field_type: 'text', preview_width: 1, sort_order: 2, category_name: 'Vehicle' },
      ].filter((field) => String(field.display_value || '').trim().length > 0);

      return {
        plate: row.plate || '',
        vehicle: row.vehicle || '',
        owner: ownerCitizenId,
        garage: row.garage || '',
        state: row.state !== undefined ? String(row.state) : '',
        custom_fields: {},
        lookup_fields: lookupFields,
      };
    }));
  } catch (err) {
    console.error('QBox vehicle search error:', err);
    throw new Error(`QBox vehicle search error: ${err.message}`);
  }
}

async function getVehiclesByOwner(citizenId) {
  try {
    const p = await getPool();
    const { vehiclesTable } = getQboxTableConfig();
    const tableNameSql = escapeIdentifier(vehiclesTable, 'vehicles table');

    const [rows] = await p.query(
      `SELECT * FROM ${tableNameSql} WHERE citizenid = ?`,
      [citizenId]
    );

    return Promise.all(rows.map(async (row) => {
      const ownerCitizenId = String(row.citizenid || row.owner || citizenId || '').trim();
      const lookupFields = [
        { key: 'plate', label: 'Plate', display_value: String(row.plate || '').trim(), field_type: 'text', preview_width: 1, sort_order: 0, category_name: 'Vehicle' },
        { key: 'model', label: 'Model', display_value: String(row.vehicle || '').trim(), field_type: 'text', preview_width: 1, sort_order: 1, category_name: 'Vehicle' },
        { key: 'state', label: 'State', display_value: row.state !== undefined ? String(row.state) : '', field_type: 'text', preview_width: 1, sort_order: 2, category_name: 'Vehicle' },
      ].filter((field) => String(field.display_value || '').trim().length > 0);

      return {
        plate: row.plate || '',
        vehicle: row.vehicle || '',
        owner: ownerCitizenId,
        garage: row.garage || '',
        state: row.state !== undefined ? String(row.state) : '',
        custom_fields: {},
        mapped_categories: [],
        lookup_fields: lookupFields,
      };
    }));
  } catch (err) {
    console.error('QBox get vehicles error:', err);
    throw new Error(`QBox vehicle lookup error: ${err.message}`);
  }
}

async function getVehicleByPlate(plate) {
  try {
    const normalizedPlate = String(plate || '').trim();
    if (!normalizedPlate) return null;

    const p = await getPool();
    const { vehiclesTable } = getQboxTableConfig();
    const tableNameSql = escapeIdentifier(vehiclesTable, 'vehicles table');

    let rows = [];
    [rows] = await p.query(
      `SELECT * FROM ${tableNameSql} WHERE plate = ? LIMIT 1`,
      [normalizedPlate]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      [rows] = await p.query(
        `SELECT * FROM ${tableNameSql} WHERE REPLACE(plate, ' ', '') = REPLACE(?, ' ', '') LIMIT 1`,
        [normalizedPlate]
      );
    }
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const row = rows[0];
    const ownerCitizenId = String(row.citizenid || row.owner || '').trim();
    const lookupFields = [
      { key: 'plate', label: 'Plate', display_value: String(row.plate || '').trim(), field_type: 'text', preview_width: 1, sort_order: 0, category_name: 'Vehicle' },
      { key: 'model', label: 'Model', display_value: String(row.vehicle || '').trim(), field_type: 'text', preview_width: 1, sort_order: 1, category_name: 'Vehicle' },
      { key: 'state', label: 'State', display_value: row.state !== undefined ? String(row.state) : '', field_type: 'text', preview_width: 1, sort_order: 2, category_name: 'Vehicle' },
    ].filter((field) => String(field.display_value || '').trim().length > 0);

    return {
      plate: row.plate || '',
      vehicle: row.vehicle || '',
      owner: ownerCitizenId,
      garage: row.garage || '',
      state: row.state !== undefined ? String(row.state) : '',
      custom_fields: {},
      mapped_categories: [],
      lookup_fields: lookupFields,
      raw: row,
    };
  } catch (err) {
    console.error('QBox get vehicle by plate error:', err);
    throw new Error(`QBox vehicle lookup error: ${err.message}`);
  }
}

async function applyFineByCitizenId({ citizenId, amount, account = 'bank' }) {
  const normalizedCitizenId = String(citizenId || '').trim();
  const fineAmount = Number(amount || 0);
  const accountKey = String(account || 'bank').trim();

  if (!normalizedCitizenId) {
    throw new Error('citizenId is required');
  }
  if (!Number.isFinite(fineAmount) || fineAmount <= 0) {
    throw new Error('amount must be a positive number');
  }
  if (!IDENTIFIER_RE.test(accountKey)) {
    throw new Error('account contains invalid characters');
  }

  const p = await getPool();
  const { playersTable, citizenIdCol, moneyCol } = getQboxTableConfig();
  const tableNameSql = escapeIdentifier(playersTable, 'players table');
  const citizenIdColSql = escapeIdentifier(citizenIdCol, 'citizen ID column');
  const moneyColSql = escapeIdentifier(moneyCol, 'money column');

  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT ${moneyColSql} as money FROM ${tableNameSql} WHERE ${citizenIdColSql} = ? LIMIT 1 FOR UPDATE`,
      [normalizedCitizenId]
    );
    if (!rows.length) {
      throw new Error(`Citizen ${normalizedCitizenId} not found in ${playersTable}`);
    }

    const money = parseMaybeJson(rows[0].money);
    const currentBalance = Number(money?.[accountKey] || 0);
    const safeCurrent = Number.isFinite(currentBalance) ? currentBalance : 0;
    const nextBalance = Number((safeCurrent - fineAmount).toFixed(2));
    const nextMoney = { ...money, [accountKey]: nextBalance };

    await conn.query(
      `UPDATE ${tableNameSql} SET ${moneyColSql} = ? WHERE ${citizenIdColSql} = ?`,
      [JSON.stringify(nextMoney), normalizedCitizenId]
    );

    await conn.commit();
    return {
      citizenId: normalizedCitizenId,
      account: accountKey,
      amount: fineAmount,
      before: safeCurrent,
      after: nextBalance,
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

async function getLicenseByCitizenId(citizenId) {
  const cid = String(citizenId || '').trim();
  if (!cid) return null;

  try {
    const p = await getPool();
    const { playersTable, citizenIdCol } = getQboxTableConfig();
    const tbl = escapeIdentifier(playersTable, 'playersTable');
    const col = escapeIdentifier(citizenIdCol, 'citizenIdCol');
    const [rows] = await p.query(
      `SELECT license FROM ${tbl} WHERE ${col} = ? LIMIT 1`,
      [cid]
    );
    if (rows.length === 0) return null;
    const license = String(rows[0].license || '').trim();
    return license || null;
  } catch {
    return null;
  }
}

module.exports = {
  initPool,
  testConnection,
  inspectConfiguredSchema,
  listTableColumns,
  searchCharacters,
  getCharacterById,
  getCharacterJobById,
  getPlayerCharacterJobsByCitizenId,
  getCharacterJobGroupsById,
  searchVehicles,
  getVehicleByPlate,
  getVehiclesByOwner,
  applyFineByCitizenId,
  getLicenseByCitizenId,
};
