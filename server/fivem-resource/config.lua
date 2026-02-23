Config = {}

local function trim(value)
  return (tostring(value or ''):gsub('^%s+', ''):gsub('%s+$', ''))
end

local function unquote(value)
  local text = trim(value)
  if #text >= 2 then
    local first = text:sub(1, 1)
    local last = text:sub(-1)
    if (first == '"' and last == '"') or (first == "'" and last == "'") then
      text = text:sub(2, -2)
    end
  end
  text = text:gsub('\\"', '"')
  text = text:gsub("\\'", "'")
  return text
end

local function stripInlineComment(line)
  local inSingle = false
  local inDouble = false
  local escaped = false

  for i = 1, #line do
    local char = line:sub(i, i)
    if escaped then
      escaped = false
    elseif char == '\\' then
      escaped = true
    elseif char == "'" and not inDouble then
      inSingle = not inSingle
    elseif char == '"' and not inSingle then
      inDouble = not inDouble
    elseif char == '#' and not inSingle and not inDouble then
      local prev = i > 1 and line:sub(i - 1, i - 1) or ''
      if prev == '' or prev:match('%s') then
        return line:sub(1, i - 1)
      end
    end
  end

  return line
end

local function parseConfigLine(line)
  local raw = trim(stripInlineComment(line or ''))
  if raw == '' then return nil, nil end
  if raw:match('^;') or raw:match('^%-%-') or raw:match('^#') then
    return nil, nil
  end

  local _cmd, keySet, valueSet = raw:match('^([Ss][Ee][Tt][RrSs]?)%s+([^%s]+)%s*(.-)%s*$')
  if keySet then
    return keySet, unquote(valueSet)
  end

  local keyEq, valueEq = raw:match('^([^=%s]+)%s*=%s*(.-)%s*$')
  if keyEq then
    return keyEq, unquote(valueEq)
  end

  local keySpace, valueSpace = raw:match('^([^%s]+)%s+(.+)$')
  if keySpace then
    return keySpace, unquote(valueSpace)
  end

  return nil, nil
end

local function loadResourceConfig()
  local values = {}
  local hasKey = {}
  local content = LoadResourceFile(GetCurrentResourceName(), 'config.cfg')
  if not content or content == '' then
    return values, hasKey
  end

  for line in tostring(content):gmatch('[^\r\n]+') do
    local key, value = parseConfigLine(line)
    if key then
      local normalized = trim(key)
      if normalized ~= '' then
        values[normalized] = value
        hasKey[normalized] = true
      end
    end
  end

  return values, hasKey
end

local ResourceConfigValues, ResourceConfigHasKey = loadResourceConfig()

local function getString(key, fallback)
  local lookup = trim(key)
  if lookup ~= '' and ResourceConfigHasKey[lookup] then
    return tostring(ResourceConfigValues[lookup] or '')
  end
  return GetConvar(lookup, tostring(fallback or ''))
end

local function getNumber(key, fallback)
  local value = tonumber(trim(getString(key, '')))
  if value ~= nil then return value end
  return tonumber(fallback) or 0
end

local function getBoolean(key, fallback)
  local value = trim(getString(key, ''))
  if value == '' then return fallback == true end
  local lowered = value:lower()
  if lowered == '1' or lowered == 'true' or lowered == 'yes' or lowered == 'on' then return true end
  if lowered == '0' or lowered == 'false' or lowered == 'no' or lowered == 'off' then return false end
  return fallback == true
end

local function decodeJsonTable(raw)
  local text = trim(raw)
  if text == '' then return nil end
  local ok, parsed = pcall(function()
    return json.decode(text)
  end)
  if not ok or type(parsed) ~= 'table' then
    return nil
  end
  return parsed
end

local function getJsonTable(key)
  return decodeJsonTable(getString(key, ''))
end

local function parseCsvList(rawValue, transform)
  local raw = trim(rawValue)
  local out = {}
  local seen = {}
  if raw == '' then return out end

  for token in raw:gmatch('([^,]+)') do
    local item = trim(token)
    if item ~= '' then
      if type(transform) == 'function' then
        item = transform(item)
      end
      if item ~= '' and not seen[item] then
        seen[item] = true
        out[#out + 1] = item
      end
    end
  end

  return out
end

local function parseCsvIntegerList(rawValue)
  local values = parseCsvList(rawValue, function(item)
    local numeric = tonumber(item)
    if not numeric then return '' end
    numeric = math.floor(numeric)
    if numeric < 1 then return '' end
    return tostring(numeric)
  end)

  local out = {}
  for _, entry in ipairs(values) do
    out[#out + 1] = tonumber(entry)
  end
  return out
end

local function firstNonEmptyList(...)
  for i = 1, select('#', ...) do
    local candidate = select(i, ...)
    if type(candidate) == 'table' and #candidate > 0 then
      return candidate
    end
  end
  return {}
end

local function parseVec4String(rawValue, fallback)
  if type(fallback) ~= 'table' then
    fallback = { x = 0.0, y = 0.0, z = 0.0, w = 0.0 }
  end
  local raw = trim(rawValue)
  if raw == '' then
    return {
      x = tonumber(fallback.x) or 0.0,
      y = tonumber(fallback.y) or 0.0,
      z = tonumber(fallback.z) or 0.0,
      w = tonumber(fallback.w) or 0.0,
    }
  end

  local numbers = {}
  for token in raw:gmatch('([^,%s]+)') do
    local numeric = tonumber(token)
    if numeric then
      numbers[#numbers + 1] = numeric
    end
  end
  if #numbers < 4 then
    return {
      x = tonumber(fallback.x) or 0.0,
      y = tonumber(fallback.y) or 0.0,
      z = tonumber(fallback.z) or 0.0,
      w = tonumber(fallback.w) or 0.0,
    }
  end

  return {
    x = tonumber(numbers[1]) or 0.0,
    y = tonumber(numbers[2]) or 0.0,
    z = tonumber(numbers[3]) or 0.0,
    w = tonumber(numbers[4]) or 0.0,
  }
end

local function normalizeVec4List(value, fallback)
  local out = {}
  if type(value) == 'table' then
    for _, entry in ipairs(value) do
      if type(entry) == 'table' then
        local x = tonumber(entry.x or entry[1])
        local y = tonumber(entry.y or entry[2])
        local z = tonumber(entry.z or entry[3])
        local w = tonumber(entry.w or entry.h or entry.heading or entry[4]) or 0.0
        if x and y and z then
          out[#out + 1] = {
            x = x + 0.0,
            y = y + 0.0,
            z = z + 0.0,
            w = w + 0.0,
            label = trim(entry.label or entry.name or ''),
            description = trim(entry.description or ''),
            emote = trim(entry.emote or ''),
          }
        end
      end
    end
  end

  if #out > 0 then return out end

  local fallbackOut = {}
  if type(fallback) == 'table' then
    for _, entry in ipairs(fallback) do
      if type(entry) == 'table' then
        fallbackOut[#fallbackOut + 1] = {
          x = tonumber(entry.x) or 0.0,
          y = tonumber(entry.y) or 0.0,
          z = tonumber(entry.z) or 0.0,
          w = tonumber(entry.w) or 0.0,
          label = trim(entry.label or entry.name or ''),
          description = trim(entry.description or ''),
          emote = trim(entry.emote or ''),
        }
      end
    end
  end
  return fallbackOut
end

local function normalizeAlarmZoneList(value, fallback)
  local function normalizePoints(rawPoints)
    local points = {}
    if type(rawPoints) ~= 'table' then return points end
    for _, rawPoint in ipairs(rawPoints) do
      if type(rawPoint) == 'table' then
        local px = tonumber(rawPoint.x or rawPoint[1] or (type(rawPoint.coords) == 'table' and (rawPoint.coords.x or rawPoint.coords[1])))
        local py = tonumber(rawPoint.y or rawPoint[2] or (type(rawPoint.coords) == 'table' and (rawPoint.coords.y or rawPoint.coords[2])))
        local pz = tonumber(rawPoint.z or rawPoint[3] or (type(rawPoint.coords) == 'table' and (rawPoint.coords.z or rawPoint.coords[3])))
        if px and py then
          points[#points + 1] = {
            x = px + 0.0,
            y = py + 0.0,
            z = pz and (pz + 0.0) or nil,
          }
        end
      end
    end
    return points
  end

  local out = {}
  local function pushZone(entry, index, target)
    if type(entry) ~= 'table' then return end
    local normalizedShape = trim(entry.shape or entry.type or '')
    if normalizedShape == '' then normalizedShape = 'circle' end
    normalizedShape = normalizedShape:lower()

    local points = normalizePoints(entry.points or entry.vertices or entry.polygon or entry.poly)
    local x = tonumber(entry.x or entry[1] or (type(entry.coords) == 'table' and (entry.coords.x or entry.coords[1])))
    local y = tonumber(entry.y or entry[2] or (type(entry.coords) == 'table' and (entry.coords.y or entry.coords[2])))
    local z = tonumber(entry.z or entry[3] or (type(entry.coords) == 'table' and (entry.coords.z or entry.coords[3])))
    local radius = tonumber(entry.radius or entry.r or entry.distance) or 0.0
    local isPolygon = normalizedShape == 'polygon' or (#points >= 3)
    if isPolygon then
      if #points < 3 then return end
      if not x or not y then
        x = tonumber(points[1] and points[1].x) or 0.0
        y = tonumber(points[1] and points[1].y) or 0.0
      end
      if z == nil then
        z = tonumber(points[1] and points[1].z) or 0.0
      end
    else
      if not x or not y or radius <= 0 then return end
    end

    local id = trim(entry.id or entry.key or entry.name or ('alarm_zone_' .. tostring(index or (#out + 1))))
    if id == '' then id = 'alarm_zone_' .. tostring(index or (#out + 1)) end
    local zone = {
      id = id,
      label = trim(entry.label or entry.name or id),
      location = trim(entry.location or entry.location_label or entry.address or ''),
      description = trim(entry.description or ''),
      title = trim(entry.title or ''),
      message = trim(entry.message or ''),
      shape = isPolygon and 'polygon' or 'circle',
      x = x + 0.0,
      y = y + 0.0,
      z = (z and (z + 0.0)) or 0.0,
      radius = isPolygon and 0.0 or math.max(1.0, radius + 0.0),
      points = points,
      min_z = tonumber(entry.min_z or entry.minZ) or nil,
      max_z = tonumber(entry.max_z or entry.maxZ) or nil,
      postal = trim(entry.postal or ''),
      priority = trim(entry.priority or ''),
      job_code = trim(entry.job_code or entry.jobCode or ''),
      cooldown_ms = tonumber(entry.cooldown_ms or entry.cooldownMs) or nil,
      per_player_cooldown_ms = tonumber(entry.per_player_cooldown_ms or entry.perPlayerCooldownMs) or nil,
      requested_department_layout_type = trim(entry.requested_department_layout_type or entry.layout_type or ''),
      department_id = tonumber(entry.department_id or entry.primary_department_id or entry.primaryDepartmentId) or nil,
      backup_department_id = tonumber(entry.backup_department_id or entry.fallback_department_id or entry.backupDepartmentId) or nil,
    }
    if zone.department_id then zone.department_id = math.floor(zone.department_id) end
    if zone.backup_department_id then zone.backup_department_id = math.floor(zone.backup_department_id) end
    if zone.department_id and zone.backup_department_id and zone.department_id == zone.backup_department_id then
      zone.backup_department_id = nil
    end
    if type(target) == 'table' then
      target[#target + 1] = zone
    else
      out[#out + 1] = zone
    end
  end

  if type(value) == 'table' then
    for i, entry in ipairs(value) do
      pushZone(entry, i)
    end
  end
  if #out > 0 then return out end

  local fallbackOut = {}
  if type(fallback) == 'table' then
    for i, entry in ipairs(fallback) do
      pushZone(entry, i, fallbackOut)
    end
  end
  return fallbackOut
end

local function parseVec3String(rawValue, fallback)
  if type(fallback) ~= 'table' then
    fallback = { x = 0.0, y = 0.0, z = 0.0 }
  end
  local raw = trim(rawValue)
  if raw == '' then
    return {
      x = tonumber(fallback.x) or 0.0,
      y = tonumber(fallback.y) or 0.0,
      z = tonumber(fallback.z) or 0.0,
    }
  end

  local numbers = {}
  for token in raw:gmatch('([^,%s]+)') do
    local numeric = tonumber(token)
    if numeric then
      numbers[#numbers + 1] = numeric
    end
  end
  if #numbers < 3 then
    return {
      x = tonumber(fallback.x) or 0.0,
      y = tonumber(fallback.y) or 0.0,
      z = tonumber(fallback.z) or 0.0,
    }
  end

  return {
    x = tonumber(numbers[1]) or 0.0,
    y = tonumber(numbers[2]) or 0.0,
    z = tonumber(numbers[3]) or 0.0,
  }
end

local DEFAULT_DRIVER_LICENSE_CLASS_OPTIONS = {
  'CAR',
  'LR',
  'MR',
  'HR',
  'HC',
  'MC',
  'R',
  'L',
}

local DEFAULT_DRIVER_LICENSE_DEFAULT_CLASSES = { 'CAR' }
local DEFAULT_DURATION_OPTIONS = { 6, 14, 35, 70 }
local DEFAULT_DRIVER_LICENSE_PED_COORDS = { x = 240.87, y = -1378.69, z = 32.74, w = 140.89 }
local DEFAULT_VEHICLE_REGISTRATION_PED_COORDS = { x = -30.17, y = -1096.28, z = 26.27, w = 67.98 }
local DEFAULT_DOCUMENT_INTERACTION_PEDS = {
  {
    id = 'city_hall',
    model = 's_m_m_dockwork_01',
    coords = { x = -542.52, y = -197.15, z = 37.24, w = 76.49 },
    scenario = 'WORLD_HUMAN_CLIPBOARD',
    allows_license = true,
    allows_registration = false,
  },
  {
    id = 'pdm',
    model = 's_m_y_dealer_01',
    coords = { x = -30.17, y = -1096.28, z = 26.27, w = 67.98 },
    scenario = '',
    force_standing = true,
    allows_license = false,
    allows_registration = true,
    registration_duration_options = { 1 },
  },
  {
    id = 'driving_school',
    model = 's_m_m_dockwork_01',
    coords = { x = 240.46, y = -1379.81, z = 32.74, w = 136.77 },
    scenario = 'WORLD_HUMAN_CLIPBOARD',
    allows_license = true,
    allows_registration = true,
    registration_parking_coords = { x = 222.96, y = -1387.89, z = 29.54, w = 91.57 },
    registration_parking_radius = 20.0,
  },
  {
    id = 'sandy_pd',
    model = 's_m_y_cop_01',
    coords = { x = 1833.16, y = 3679.28, z = 33.19, w = 207.3 },
    scenario = 'WORLD_HUMAN_CLIPBOARD',
    allows_license = true,
    allows_registration = false,
  },
  {
    id = 'paleto_pd',
    model = 's_m_y_cop_01',
    coords = { x = -448.35, y = 6014.05, z = 31.29, w = 223.5 },
    scenario = 'WORLD_HUMAN_CLIPBOARD',
    allows_license = true,
    allows_registration = false,
  },
}

local DEFAULT_DRIVER_LICENSE_FEES_BY_DAYS = {
  [6] = 1500,
  [14] = 3000,
  [35] = 7500,
  [70] = 14000,
}

local DEFAULT_REGISTRATION_FEES_BY_DAYS = {
  [6] = 2500,
  [14] = 5000,
  [35] = 12000,
  [70] = 22000,
}

local DEFAULT_WRAITH_EMERGENCY_PLATE_PREFIXES = {
  'POLICE',
  'LSPD',
  'LSSD',
  'SAHP',
  'FIRE',
  'EMS',
  'AMBUL',
}
local DEFAULT_WRAITH_EMERGENCY_VEHICLE_CLASSES = { 18 }
local DEFAULT_WRAITH_SEATBELT_IGNORED_VEHICLE_CODES = {
  'sprinter19',
  'sprinter19b',
  'pumpertanker',
  'hinorescue',
  'scaniahp',
}
local DEFAULT_CAD_JAIL_SPAWN_POINTS = {
  { x = 1758.74, y = 2472.56, z = 48.69, w = 29.06, label = 'Cell 1' },
  { x = 1761.74, y = 2474.52, z = 48.69, w = 10.06, label = 'Cell 2' },
  { x = 1764.96, y = 2476.12, z = 48.69, w = 26.17, label = 'Cell 3' },
  { x = 1767.76, y = 2478.01, z = 48.69, w = 15.11, label = 'Cell 4' },
  { x = 1771.37, y = 2480.1, z = 48.69, w = 26.3, label = 'Cell 5' },
}
local DEFAULT_CAD_JAIL_RELEASE_POINTS = {
  {
    label = 'Bolingbroke Main Gate',
    description = 'Prison main release gate',
    x = 1850.7,
    y = 2585.69,
    z = 44.67,
    w = 270.25,
  },
}
local DEFAULT_AUTO_ALARM_ZONES = {}
local DEFAULT_CAD_JAIL_PRISON_OUTFITS = {
  male = {
    accessories = { item = 0, texture = 0 },
    mask = { item = 0, texture = 0 },
    pants = { item = 5, texture = 7 },
    jacket = { item = 0, texture = 0 },
    shirt = { item = 15, texture = 0 },
    arms = { item = 0, texture = 0 },
    shoes = { item = 42, texture = 2 },
    bodyArmor = { item = 0, texture = 0 },
  },
  female = {
    accessories = { item = 0, texture = 0 },
    mask = { item = 0, texture = 0 },
    pants = { item = 0, texture = 0 },
    jacket = { item = 0, texture = 0 },
    shirt = { item = 0, texture = 0 },
    arms = { item = 0, texture = 0 },
    shoes = { item = 0, texture = 0 },
    bodyArmor = { item = 0, texture = 0 },
  },
}

-- CAD bridge endpoint/token.
Config.CadBaseUrl = getString('cad_bridge_base_url', 'http://127.0.0.1:3031')
Config.SharedToken = getString('cad_bridge_token', '')

-- Sync intervals (milliseconds).
Config.HeartbeatIntervalMs = math.max(250, math.min(500, math.floor(getNumber('cad_bridge_heartbeat_ms', 500))))
Config.FinePollIntervalMs = math.max(1000, math.floor(getNumber('cad_bridge_fine_poll_ms', 7000)))
Config.JobSyncPollIntervalMs = math.max(1000, math.floor(getNumber('cad_bridge_job_sync_poll_ms', 5000)))
Config.RoutePollIntervalMs = math.max(1000, math.floor(getNumber('cad_bridge_route_poll_ms', 4000)))
Config.ClosestCallPromptPollIntervalMs = math.max(1000, math.floor(getNumber('cad_bridge_call_prompt_poll_ms', 2500)))
Config.ClosestCallPromptTimeoutMs = math.max(6000, math.floor(getNumber('cad_bridge_call_prompt_timeout_ms', 15000)))
Config.JailPollIntervalMs = math.max(250, math.floor(getNumber('cad_bridge_jail_poll_ms', 500)))
Config.AutoAmbulanceCallEnabled = getBoolean('cad_bridge_auto_ambulance_call_enabled', true)
Config.AutoAmbulanceCallPollIntervalMs = math.max(1000, math.floor(getNumber('cad_bridge_auto_ambulance_call_poll_ms', 2500)))
Config.AutoAmbulanceCallCooldownMs = math.max(10000, math.floor(getNumber('cad_bridge_auto_ambulance_call_cooldown_ms', 180000)))
Config.AutoAmbulanceCallPriority = trim(getString('cad_bridge_auto_ambulance_call_priority', '1'))
if Config.AutoAmbulanceCallPriority == '' then Config.AutoAmbulanceCallPriority = '1' end

Config.PublishAllPlayers = getBoolean('cad_bridge_publish_all_players', true)

-- Postal integration.
Config.UseNearestPostal = getBoolean('cad_bridge_use_nearest_postal', true)
Config.NearestPostalResource = getString('cad_bridge_postal_resource', 'nearest-postal')
Config.NearestPostalExport = getString('cad_bridge_postal_export', 'getPostal')

-- ox_lib notifications.
Config.ForceOxNotifyPosition = getBoolean('cad_bridge_force_ox_notify_position', true)
Config.OxNotifyPosition = trim(getString('cad_bridge_ox_notify_position', 'center-right'))
if Config.OxNotifyPosition == '' then Config.OxNotifyPosition = 'center-right' end
Config.OxNotifyForceIntervalMs = math.max(5000, math.floor(getNumber('cad_bridge_ox_notify_force_interval_ms', 60000)))

-- Driver license + registration documents.
Config.EnableDocumentCommands = getBoolean('cad_bridge_enable_document_commands', false)
Config.DriverLicenseCommand = trim(getString('cad_bridge_license_command', 'cadlicense'))
if Config.DriverLicenseCommand == '' then Config.DriverLicenseCommand = 'cadlicense' end
Config.VehicleRegistrationCommand = trim(getString('cad_bridge_registration_command', 'cadrego'))
if Config.VehicleRegistrationCommand == '' then Config.VehicleRegistrationCommand = 'cadrego' end
Config.ShowIdCommand = trim(getString('cad_bridge_show_id_command', 'showid'))
if Config.ShowIdCommand == '' then Config.ShowIdCommand = 'showid' end
Config.ShowIdKey = trim(getString('cad_bridge_show_id_key', 'PAGEDOWN'))
if Config.ShowIdKey == '' then Config.ShowIdKey = 'PAGEDOWN' end
Config.ShowIdTargetDistance = getNumber('cad_bridge_show_id_target_distance', 4.0)
if Config.ShowIdTargetDistance < 0.5 then Config.ShowIdTargetDistance = 0.5 end
Config.ShowIdNearbyDistance = getNumber('cad_bridge_show_id_nearby_distance', Config.ShowIdTargetDistance)
if Config.ShowIdNearbyDistance < 1.0 then Config.ShowIdNearbyDistance = 1.0 end

Config.DriverLicenseDefaultExpiryDays = math.max(1, math.floor(getNumber('cad_bridge_license_default_expiry_days', 35)))
Config.VehicleRegistrationDefaultDays = math.max(1, math.floor(getNumber('cad_bridge_registration_default_days', 35)))
Config.DriverLicenseQuizPassPercent = math.max(1, math.min(100, math.floor(getNumber('cad_bridge_license_quiz_pass_percent', 80))))
Config.DriverLicenseQuizExpiryDays = math.max(1, math.floor(getNumber('cad_bridge_license_quiz_expiry_days', 30)))
Config.DocumentPedInteractionDistance = getNumber('cad_bridge_document_ped_interaction_distance', 2.2)
if Config.DocumentPedInteractionDistance < 1.0 then Config.DocumentPedInteractionDistance = 1.0 end
Config.DocumentPedPromptDistance = getNumber('cad_bridge_document_ped_prompt_distance', 12.0)
if Config.DocumentPedPromptDistance < Config.DocumentPedInteractionDistance then
  Config.DocumentPedPromptDistance = Config.DocumentPedInteractionDistance + 2.0
end

local driverDurationFromCsv = parseCsvIntegerList(getString('cad_bridge_license_duration_options', ''))
local regoDurationFromCsv = parseCsvIntegerList(getString('cad_bridge_registration_duration_options', ''))
Config.DriverLicenseDurationOptions = firstNonEmptyList(driverDurationFromCsv, DEFAULT_DURATION_OPTIONS)
Config.VehicleRegistrationDurationOptions = firstNonEmptyList(regoDurationFromCsv, DEFAULT_DURATION_OPTIONS)

local classOptionsFromCsv = parseCsvList(getString('cad_bridge_license_class_options', ''), function(item)
  return item:upper()
end)
local classDefaultsFromCsv = parseCsvList(getString('cad_bridge_license_default_classes', ''), function(item)
  return item:upper()
end)
Config.DriverLicenseClassOptions = firstNonEmptyList(classOptionsFromCsv, DEFAULT_DRIVER_LICENSE_CLASS_OPTIONS)
Config.DriverLicenseDefaultClasses = firstNonEmptyList(classDefaultsFromCsv, DEFAULT_DRIVER_LICENSE_DEFAULT_CLASSES)
Config.DriverLicenseQuizClasses = firstNonEmptyList(
  parseCsvList(getString('cad_bridge_license_quiz_classes', 'CAR'), function(item)
    return item:upper()
  end),
  DEFAULT_DRIVER_LICENSE_DEFAULT_CLASSES
)

Config.DriverLicensePed = {
  enabled = getBoolean('cad_bridge_license_ped_enabled', true),
  model = trim(getString('cad_bridge_license_ped_model', 's_m_m_dockwork_01')),
  coords = parseVec4String(getString('cad_bridge_license_ped_coords', ''), DEFAULT_DRIVER_LICENSE_PED_COORDS),
  scenario = trim(getString('cad_bridge_license_ped_scenario', 'WORLD_HUMAN_CLIPBOARD')),
  label = trim(getString('cad_bridge_license_ped_label', 'Press ~INPUT_CONTEXT~ to take the licence quiz')),
}
if Config.DriverLicensePed.model == '' then Config.DriverLicensePed.model = 's_m_m_dockwork_01' end

Config.VehicleRegistrationPed = {
  enabled = getBoolean('cad_bridge_registration_ped_enabled', true),
  model = trim(getString('cad_bridge_registration_ped_model', 's_m_y_dealer_01')),
  coords = parseVec4String(getString('cad_bridge_registration_ped_coords', ''), DEFAULT_VEHICLE_REGISTRATION_PED_COORDS),
  scenario = trim(getString('cad_bridge_registration_ped_scenario', '')),
  label = trim(getString('cad_bridge_registration_ped_label', 'Press ~INPUT_CONTEXT~ to manage vehicle rego')),
}
if Config.VehicleRegistrationPed.model == '' then Config.VehicleRegistrationPed.model = 's_m_y_dealer_01' end

Config.DocumentInteractionPeds = DEFAULT_DOCUMENT_INTERACTION_PEDS

Config.DocumentFeeAccount = trim(getString('cad_bridge_document_fee_account', 'bank'))
if Config.DocumentFeeAccount == '' then Config.DocumentFeeAccount = 'bank' end
Config.RequireDocumentFeePayment = getBoolean('cad_bridge_document_fee_required', false)
Config.DocumentDebugLogs = getBoolean('cad_bridge_document_debug_logs', true)

Config.DriverLicenseFeesByDays = DEFAULT_DRIVER_LICENSE_FEES_BY_DAYS
local licenseFeesOverride = getJsonTable('cad_bridge_license_fees_json')
if type(licenseFeesOverride) == 'table' then
  Config.DriverLicenseFeesByDays = licenseFeesOverride
end

Config.VehicleRegistrationFeesByDays = DEFAULT_REGISTRATION_FEES_BY_DAYS
local registrationFeesOverride = getJsonTable('cad_bridge_registration_fees_json')
if type(registrationFeesOverride) == 'table' then
  Config.VehicleRegistrationFeesByDays = registrationFeesOverride
end

-- Mugshot/photo capture.
Config.MugshotProvider = trim(getString('cad_bridge_mugshot_provider', 'auto')):lower()
if Config.MugshotProvider == '' then Config.MugshotProvider = 'auto' end
Config.ScreenshotResource = trim(getString('cad_bridge_screenshot_resource', 'screencapture'))
if Config.ScreenshotResource == '' then Config.ScreenshotResource = 'screencapture' end
Config.ScreenshotEncoding = trim(getString('cad_bridge_screenshot_encoding', 'jpg')):lower()
if Config.ScreenshotEncoding == '' then Config.ScreenshotEncoding = 'jpg' end
Config.ScreenshotQuality = getNumber('cad_bridge_screenshot_quality', 0.7)
if Config.ScreenshotQuality < 0.1 then Config.ScreenshotQuality = 0.1 end
if Config.ScreenshotQuality > 1.0 then Config.ScreenshotQuality = 1.0 end
Config.ScreenshotTimeoutMs = math.max(1000, math.floor(getNumber('cad_bridge_screenshot_timeout_ms', 5000)))
Config.ScreenshotChromaKeyEnabled = getBoolean('cad_bridge_screenshot_chroma_key_enabled', false)
Config.MugshotResource = trim(getString('cad_bridge_mugshot_resource', 'MugShotBase64'))

-- Fine/job/jail adapters.
Config.FineAdapter = trim(getString('cad_bridge_fine_adapter', 'auto'))
if Config.FineAdapter == '' then Config.FineAdapter = 'auto' end
Config.FineCommandTemplate = getString('cad_bridge_fine_command', 'qbx_fine {citizenid} {amount} {reason}')

Config.JobSyncAdapter = trim(getString('cad_bridge_job_sync_adapter', 'none'))
if Config.JobSyncAdapter == '' then Config.JobSyncAdapter = 'none' end
Config.JobSyncCommandTemplate = getString('cad_bridge_job_sync_command', 'qbx_setjob {source} {job} {grade}')

Config.JailAdapter = trim(getString('cad_bridge_jail_adapter', 'cad_bridge'))
if Config.JailAdapter == '' then Config.JailAdapter = 'cad_bridge' end
Config.JailCommandTemplate = getString('cad_bridge_jail_command', 'jail {source} {minutes} {reason}')
Config.CadBridgeJailManageInventory = getBoolean('cad_bridge_jail_manage_inventory', true)
Config.CadBridgeJailSpawnPoints = normalizeVec4List(getJsonTable('cad_bridge_jail_spawn_points_json'), DEFAULT_CAD_JAIL_SPAWN_POINTS)
Config.CadBridgeJailReleasePoints = normalizeVec4List(getJsonTable('cad_bridge_jail_release_points_json'), DEFAULT_CAD_JAIL_RELEASE_POINTS)
Config.CadBridgeEnablePrisonOutfits = getBoolean('cad_bridge_jail_enable_prison_outfits', true)
Config.CadBridgePrisonOutfits = DEFAULT_CAD_JAIL_PRISON_OUTFITS
Config.CadBridgeJailPlaySound = function()
  local ped = PlayerPedId and PlayerPedId() or 0
  if not ped or ped == 0 then return end
  local ok, _ = pcall(function()
    if GetResourceState('qbx_core') == 'started' and type(lib) == 'table' and type(lib.load) == 'function' then
      lib.load('@qbx_core.modules.lib')
      if type(qbx) == 'table' and type(qbx.loadAudioBank) == 'function' and type(qbx.playAudio) == 'function' then
        qbx.loadAudioBank('audiodirectory/jail_sounds')
        qbx.playAudio({
          audioName = 'jail',
          audioRef = 'jail_soundset',
          source = ped,
        })
        ReleaseNamedScriptAudioBank('audiodirectory/jail_sounds')
        return
      end
    end
    RequestScriptAudioBank('audiodirectory/jail_sounds', false)
    PlaySoundFromEntity(GetSoundId(), 'jail', ped, 'jail_soundset', false, false)
    ReleaseNamedScriptAudioBank('audiodirectory/jail_sounds')
  end)
end
Config.CadBridgeJailResetClothing = function()
  if GetResourceState('illenium-appearance') == 'started' then
    TriggerEvent('illenium-appearance:client:reloadSkin', true)
    return
  end
  if GetResourceState('qb-clothing') == 'started' then
    TriggerServerEvent('qb-clothes:loadPlayerSkin')
  end
end

-- Automatic alarm zone -> CAD police call integration.
Config.AutoAlarmCallEnabled = getBoolean('cad_bridge_auto_alarm_enabled', false)
Config.AutoAlarmCallPollIntervalMs = math.max(500, math.floor(getNumber('cad_bridge_auto_alarm_poll_interval_ms', 1500)))
Config.AutoAlarmConfigPollIntervalMs = math.max(1000, math.floor(getNumber('cad_bridge_auto_alarm_config_poll_interval_ms', 5000)))
Config.AutoAlarmZoneCooldownMs = math.max(5000, math.floor(getNumber('cad_bridge_auto_alarm_zone_cooldown_ms', 180000)))
Config.AutoAlarmPerPlayerCooldownMs = math.max(1000, math.floor(getNumber('cad_bridge_auto_alarm_per_player_cooldown_ms', 60000)))
Config.AutoAlarmCallPriority = trim(getString('cad_bridge_auto_alarm_priority', '2'))
if Config.AutoAlarmCallPriority == '' then Config.AutoAlarmCallPriority = '2' end
Config.AutoAlarmCallJobCode = trim(getString('cad_bridge_auto_alarm_job_code', 'ALARM'))
if Config.AutoAlarmCallJobCode == '' then Config.AutoAlarmCallJobCode = 'ALARM' end
Config.AutoAlarmRequestedDepartmentLayoutType = trim(getString('cad_bridge_auto_alarm_department_layout_type', 'law_enforcement'))
if Config.AutoAlarmRequestedDepartmentLayoutType == '' then Config.AutoAlarmRequestedDepartmentLayoutType = 'law_enforcement' end
Config.AutoAlarmZones = normalizeAlarmZoneList(getJsonTable('cad_bridge_auto_alarm_zones_json'), DEFAULT_AUTO_ALARM_ZONES)

-- Wraith integration.
Config.WraithCadLookupEnabled = getBoolean('cad_bridge_wraith_lookup_enabled', true)
Config.WraithLookupCooldownMs = math.max(250, math.floor(getNumber('cad_bridge_wraith_lookup_cooldown_ms', 8000)))
Config.WraithIgnoreEmergencyVehicles = getBoolean('cad_bridge_wraith_ignore_emergency_vehicles', true)
Config.WraithIgnoreEmergencySeatbeltAlerts = getBoolean('cad_bridge_wraith_ignore_emergency_seatbelt_alerts', true)
Config.WraithSeatbeltIgnoredVehicleCodes = firstNonEmptyList(
  parseCsvList(getString(
    'cad_bridge_wraith_seatbelt_ignored_vehicle_codes',
    table.concat(DEFAULT_WRAITH_SEATBELT_IGNORED_VEHICLE_CODES, ',')
  ), function(item)
    return trim(item):lower():gsub('[^a-z0-9]', '')
  end),
  DEFAULT_WRAITH_SEATBELT_IGNORED_VEHICLE_CODES
)
Config.WraithEmergencyPlatePrefixes = firstNonEmptyList(
  parseCsvList(getString('cad_bridge_wraith_emergency_plate_prefixes', table.concat(DEFAULT_WRAITH_EMERGENCY_PLATE_PREFIXES, ',')), function(item)
    return trim(item):upper():gsub('[^A-Z0-9]', '')
  end),
  DEFAULT_WRAITH_EMERGENCY_PLATE_PREFIXES
)
Config.WraithEmergencyVehicleClasses = firstNonEmptyList(
  parseCsvIntegerList(getString('cad_bridge_wraith_emergency_vehicle_classes', table.concat(DEFAULT_WRAITH_EMERGENCY_VEHICLE_CLASSES, ','))),
  DEFAULT_WRAITH_EMERGENCY_VEHICLE_CLASSES
)
