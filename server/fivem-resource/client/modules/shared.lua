CadBridge = CadBridge or {}
CadBridge.util = CadBridge.util or {}
CadBridge.notify = CadBridge.notify or {}
CadBridge.ui = CadBridge.ui or {}
CadBridge.state = CadBridge.state or {}

local util = CadBridge.util
local notify = CadBridge.notify
local ui = CadBridge.ui
local state = CadBridge.state

if state.emergencyUiOpen == nil then state.emergencyUiOpen = false end
if state.emergencyUiReady == nil then state.emergencyUiReady = false end
if state.emergencyUiAwaitingOpenAck == nil then state.emergencyUiAwaitingOpenAck = false end
if state.emergencyUiOpenedAtMs == nil then state.emergencyUiOpenedAtMs = 0 end
if state.trafficStopUiOpen == nil then state.trafficStopUiOpen = false end
if state.trafficStopUiReady == nil then state.trafficStopUiReady = false end
if state.trafficStopUiAwaitingOpenAck == nil then state.trafficStopUiAwaitingOpenAck = false end
if state.trafficStopUiOpenedAtMs == nil then state.trafficStopUiOpenedAtMs = 0 end
if state.jailReleaseUiOpen == nil then state.jailReleaseUiOpen = false end
if state.jailReleaseUiReady == nil then state.jailReleaseUiReady = false end
if state.jailReleaseUiAwaitingOpenAck == nil then state.jailReleaseUiAwaitingOpenAck = false end
if state.jailReleaseUiOpenedAtMs == nil then state.jailReleaseUiOpenedAtMs = 0 end
if state.driverLicenseUiOpen == nil then state.driverLicenseUiOpen = false end
if state.vehicleRegistrationUiOpen == nil then state.vehicleRegistrationUiOpen = false end
if state.idCardUiOpen == nil then state.idCardUiOpen = false end
if state.headshotCapturePending == nil then state.headshotCapturePending = nil end
if state.lastDocumentInteractAt == nil then state.lastDocumentInteractAt = 0 end

function util.trim(value)
  if value == nil then return '' end
  return (tostring(value):gsub('^%s+', ''):gsub('%s+$', ''))
end

local function toBoolean(value)
  if value == true then return true end
  local numeric = tonumber(value)
  if numeric and numeric ~= 0 then return true end
  local text = util.trim(value):lower()
  return text == 'true' or text == 'yes'
end

local function parseWasabiDeadResult(value)
  if type(value) == 'table' then
    if value.isDead ~= nil then return toBoolean(value.isDead) end
    if value.dead ~= nil then return toBoolean(value.dead) end
    if value.value ~= nil then return toBoolean(value.value) end

    local status = util.trim(value.status or value.state or '')
    if status ~= '' then
      local normalized = status:lower()
      if normalized == 'dead' or normalized == 'down' or normalized == 'dying' then return true end
      if normalized == 'alive' or normalized == 'healthy' then return false end
      return toBoolean(status)
    end

    if value[1] ~= nil then return toBoolean(value[1]) end
    return false
  end
  return toBoolean(value)
end

local autoAmbulanceDeathEpisode = 0
local autoAmbulanceLastObservedDead = nil
local autoAmbulanceLastSentDead = nil
local autoAmbulanceLastSentAt = 0

local function getLocalPedHealthSnapshot()
  local ped = PlayerPedId()
  if not ped or ped == 0 then
    return {
      health = 0,
      fatally_injured = false,
      alive = false,
    }
  end

  local health = tonumber(GetEntityHealth(ped)) or 0
  local fatallyInjured = false
  if type(IsPedFatallyInjured) == 'function' then
    local ok, result = pcall(function()
      return IsPedFatallyInjured(ped)
    end)
    fatallyInjured = ok and (result == true)
  end

  return {
    health = health,
    fatally_injured = fatallyInjured,
    alive = health > 101 and not fatallyInjured,
  }
end

local function getLocalWasabiDeathState()
  if Config.AutoAmbulanceCallEnabled ~= true then return false end
  if GetResourceState('wasabi_ambulance') ~= 'started' then return false end

  local serverId = tonumber(GetPlayerServerId(PlayerId()) or 0) or 0
  local ok, result = pcall(function()
    return exports.wasabi_ambulance:isPlayerDead(serverId)
  end)
  if not ok then
    ok, result = pcall(function()
      return exports.wasabi_ambulance:isPlayerDead()
    end)
  end
  if not ok then return false end

  return parseWasabiDeadResult(result)
end

local function buildAutoAmbulanceDeathPayload()
  local healthSnapshot = getLocalPedHealthSnapshot()
  local wasabiDead = getLocalWasabiDeathState()
  local derivedDead = (wasabiDead == true) or (healthSnapshot.alive ~= true)

  if derivedDead and autoAmbulanceLastObservedDead ~= true then
    autoAmbulanceDeathEpisode = autoAmbulanceDeathEpisode + 1
  end
  autoAmbulanceLastObservedDead = derivedDead

  return {
    is_dead = derivedDead == true,
    wasabi_dead = wasabiDead == true,
    death_episode = autoAmbulanceDeathEpisode,
    ped_health = tonumber(healthSnapshot.health) or 0,
    fatally_injured = healthSnapshot.fatally_injured == true,
  }
end

local function sendWasabiDeathStateToServer(payload)
  local out = type(payload) == 'table' and payload or buildAutoAmbulanceDeathPayload()
  TriggerServerEvent('cad_bridge:autoAmbulanceDeathState', {
    is_dead = out.is_dead == true,
    wasabi_dead = out.wasabi_dead == true,
    death_episode = math.max(0, math.floor(tonumber(out.death_episode) or 0)),
    ped_health = tonumber(out.ped_health) or 0,
    fatally_injured = out.fatally_injured == true,
  })
end

RegisterNetEvent('cad_bridge:requestAutoAmbulanceDeathState', function()
  local payload = buildAutoAmbulanceDeathPayload()
  sendWasabiDeathStateToServer(payload)
  autoAmbulanceLastSentDead = payload.is_dead == true
  autoAmbulanceLastSentAt = tonumber(GetGameTimer() or 0) or 0
end)

CreateThread(function()
  while true do
    local payload = buildAutoAmbulanceDeathPayload()
    local now = tonumber(GetGameTimer() or 0) or 0
    local shouldSend = (autoAmbulanceLastSentDead == nil)
      or ((payload.is_dead == true) ~= (autoAmbulanceLastSentDead == true))
      or ((now - tonumber(autoAmbulanceLastSentAt or 0)) >= 10000)

    if shouldSend then
      sendWasabiDeathStateToServer(payload)
      autoAmbulanceLastSentDead = payload.is_dead == true
      autoAmbulanceLastSentAt = now
    end

    local intervalMs = math.max(1000, tonumber(Config.AutoAmbulanceCallPollIntervalMs) or 2500)
    Wait(intervalMs)
  end
end)

local function normalizePostal(value)
  if value == nil then return '' end
  local t = type(value)
  if t == 'string' or t == 'number' then
    local v = tostring(value)
    return v ~= '' and v or ''
  end
  if t == 'table' then
    local candidates = {
      value.code,
      value.postal,
      value.postalCode,
      value.postcode,
      value[1],
    }
    for _, candidate in ipairs(candidates) do
      if candidate ~= nil then
        local str = tostring(candidate)
        if str ~= '' then return str end
      end
    end
  end
  return ''
end
util.normalizePostal = normalizePostal

local function tryPostalExport(resourceName, exportName)
  local ok, result = pcall(function()
    local resource = exports[resourceName]
    if not resource then return nil end
    local fn = resource[exportName]
    if type(fn) ~= 'function' then return nil end
    return fn()
  end)
  if not ok then return '' end
  return normalizePostal(result)
end

function util.getNearestPostal()
  if not Config.UseNearestPostal then return '' end

  local primaryResource = tostring(Config.NearestPostalResource or 'nearest-postal')
  local primaryExport = tostring(Config.NearestPostalExport or 'getPostal')
  local postal = tryPostalExport(primaryResource, primaryExport)
  if postal ~= '' then return postal end

  local fallbacks = {
    { primaryResource, 'getPostalCode' },
    { primaryResource, 'GetPostal' },
    { 'nearest-postal', 'getPostal' },
    { 'nearest-postal', 'getPostalCode' },
  }
  for _, pair in ipairs(fallbacks) do
    postal = tryPostalExport(pair[1], pair[2])
    if postal ~= '' then return postal end
  end
  return ''
end

function util.getWeaponName(ped)
  if not ped or ped == 0 then return '' end
  local weaponHash = GetSelectedPedWeapon(ped)
  if not weaponHash or weaponHash == 0 then return '' end
  if weaponHash == GetHashKey('WEAPON_UNARMED') then return '' end

  local weaponLabel = ''
  if type(GetWeaponDisplayNameFromHash) == 'function' then
    local ok, label = pcall(GetWeaponDisplayNameFromHash, weaponHash)
    if ok and type(label) == 'string' then
      weaponLabel = label
    end
  end
  if not weaponLabel or weaponLabel == '' or weaponLabel == 'WT_INVALID' then
    return ''
  end

  local localized = GetLabelText(weaponLabel)
  if localized and localized ~= '' and localized ~= 'NULL' then
    return localized
  end
  return tostring(weaponLabel)
end

local function isTowTruckModel(modelHash)
  return modelHash == GetHashKey('towtruck') or modelHash == GetHashKey('towtruck2')
end

function util.getVehicleSnapshot(ped)
  local snapshot = {
    vehicle = '',
    license_plate = '',
    has_siren_enabled = false,
    icon = 6,
  }

  if not ped or ped == 0 then return snapshot end
  if not IsPedInAnyVehicle(ped, false) then return snapshot end

  local vehicle = GetVehiclePedIsIn(ped, false)
  if not vehicle or vehicle == 0 then return snapshot end

  local modelHash = GetEntityModel(vehicle)
  local vehicleName = GetDisplayNameFromVehicleModel(modelHash)
  if vehicleName and vehicleName ~= '' then
    local localized = GetLabelText(vehicleName)
    if localized and localized ~= '' and localized ~= 'NULL' then
      vehicleName = localized
    end
  else
    vehicleName = ''
  end

  local vehicleClass = GetVehicleClass(vehicle)
  local icon = 225
  if vehicleClass == 18 then
    icon = 56
  elseif isTowTruckModel(modelHash) then
    icon = 68
  elseif IsThisModelAHeli(modelHash) then
    icon = 64
  end

  local hasSiren = IsVehicleSirenOn(vehicle) or IsVehicleSirenAudioOn(vehicle) or IsVehicleSirenSoundOn(vehicle)
  local sirenEnabled = hasSiren == true or hasSiren == 1

  snapshot.vehicle = tostring(vehicleName or '')
  snapshot.license_plate = tostring(GetVehicleNumberPlateText(vehicle) or '')
  snapshot.has_siren_enabled = sirenEnabled
  snapshot.icon = icon
  return snapshot
end

function util.buildLocationText(street, crossing, postal, coords)
  local road = tostring(street or '')
  local cross = tostring(crossing or '')
  local post = tostring(postal or '')
  local base = ''

  if road ~= '' and cross ~= '' and road:lower() ~= cross:lower() then
    base = road .. ' / ' .. cross
  elseif road ~= '' then
    base = road
  elseif cross ~= '' then
    base = cross
  end

  if base == '' then
    local x = tonumber(coords and coords.x) or 0.0
    local y = tonumber(coords and coords.y) or 0.0
    local z = tonumber(coords and coords.z) or 0.0
    base = ('X:%.1f Y:%.1f Z:%.1f'):format(x, y, z)
  end

  if post ~= '' then
    return ('%s (%s)'):format(base, post)
  end
  return base
end

function util.parseCoords(value)
  if value == nil then return nil end
  local t = type(value)
  if t ~= 'table' and t ~= 'vector3' and t ~= 'vector4' and t ~= 'userdata' then return nil end

  local function readRaw(container, key, index)
    local out = nil
    local ok = pcall(function()
      out = container[key]
    end)
    if (not ok or out == nil) and index ~= nil then
      pcall(function()
        out = container[index]
      end)
    end
    return out
  end

  local function toVec3(container)
    if container == nil then return nil end
    local x = tonumber(readRaw(container, 'x', 1))
    local y = tonumber(readRaw(container, 'y', 2))
    local z = tonumber(readRaw(container, 'z', 3) or 0.0)
    if x and y then
      return { x = x + 0.0, y = y + 0.0, z = (z or 0.0) + 0.0 }
    end
    return nil
  end

  local nested = readRaw(value, 'coords', nil) or readRaw(value, 'position', nil)
  local nestedVec = toVec3(nested)
  if nestedVec then return nestedVec end

  local directVec = toVec3(value)
  if directVec then return directVec end

  return nil
end

local function tryPostalCoordsExport(resourceName, exportName, postal)
  local ok, result = pcall(function()
    local resource = exports[resourceName]
    if not resource then return nil end
    local fn = resource[exportName]
    if type(fn) ~= 'function' then return nil end
    return fn(postal)
  end)
  if not ok then return nil end
  return util.parseCoords(result)
end

function util.getPostalCoords(postal)
  local normalized = normalizePostal(postal)
  if normalized == '' then return nil end
  local primaryResource = tostring(Config.NearestPostalResource or 'nearest-postal')
  local lookups = {
    { primaryResource, 'getCoordsFromPostal' },
    { primaryResource, 'getCoordFromPostal' },
    { primaryResource, 'getCoordinateFromPostal' },
    { primaryResource, 'getCoordinatesFromPostal' },
    { primaryResource, 'getPostalCoords' },
    { primaryResource, 'GetCoordsFromPostal' },
    { primaryResource, 'GetCoordFromPostal' },
    { primaryResource, 'GetCoordinateFromPostal' },
    { primaryResource, 'GetCoordinatesFromPostal' },
    { primaryResource, 'GetPostalCoords' },
    { 'nearest-postal', 'getCoordsFromPostal' },
    { 'nearest-postal', 'getCoordFromPostal' },
    { 'nearest-postal', 'getCoordinateFromPostal' },
    { 'nearest-postal', 'getCoordinatesFromPostal' },
    { 'nearest-postal', 'getPostalCoords' },
    { 'nearest-postal', 'GetCoordsFromPostal' },
    { 'nearest-postal', 'GetCoordFromPostal' },
    { 'nearest-postal', 'GetCoordinateFromPostal' },
    { 'nearest-postal', 'GetCoordinatesFromPostal' },
    { 'nearest-postal', 'GetPostalCoords' },
  }

  for _, pair in ipairs(lookups) do
    local coords = tryPostalCoordsExport(pair[1], pair[2], normalized)
    if coords then return coords end
  end
  return nil
end

local function getCadOxNotifyPosition()
  local configured = util.trim(Config and Config.OxNotifyPosition or 'center-right')
  if configured == '' then configured = 'center-right' end
  return configured
end

function util.triggerCadOxNotify(payload)
  if GetResourceState('ox_lib') ~= 'started' then return false end

  local nextPayload = {}
  if type(payload) == 'table' then
    for key, value in pairs(payload) do
      nextPayload[key] = value
    end
  end

  if (Config and Config.ForceOxNotifyPosition == true) or util.trim(nextPayload.position or '') == '' then
    nextPayload.position = getCadOxNotifyPosition()
  end

  TriggerEvent('ox_lib:notify', nextPayload)
  return true
end

function notify.route(route, hadWaypoint)
  local callId = tostring(route.call_id or '?')
  local targetLabel = util.trim(route.route_label or '')
  if targetLabel == '' then
    targetLabel = normalizePostal(route.postal)
  end
  if targetLabel == '' then targetLabel = tostring(route.location or '') end

  local message = hadWaypoint
    and ('CAD route set for call #%s%s%s'):format(callId, targetLabel ~= '' and ' -> ' or '', targetLabel)
    or ('CAD assigned call #%s%s%s (postal lookup unavailable for waypoint)'):format(callId, targetLabel ~= '' and ' -> ' or '', targetLabel)

  if util.triggerCadOxNotify({
    title = 'CAD Dispatch',
    description = message,
    type = hadWaypoint and 'inform' or 'warning',
  }) then
    return
  end
end

function notify.routeCleared(route)
  local callId = tostring(route.call_id or '?')
  local message = ('CAD route cleared for call #%s'):format(callId)
  if util.triggerCadOxNotify({
    title = 'CAD Dispatch',
    description = message,
    type = 'inform',
  }) then
    return
  end
end

local function resolveRouteCoords(route)
  if type(route) ~= 'table' then return nil end

  local x = tonumber(route.position_x)
  local y = tonumber(route.position_y)
  if (not x or not y) and type(route.position) == 'table' then
    x = tonumber(route.position.x)
    y = tonumber(route.position.y)
  end
  if x and y then
    return { x = x + 0.0, y = y + 0.0 }
  end

  local postal = util.trim(route.postal or '')
  if postal ~= '' and type(util.getPostalCoords) == 'function' then
    local coords = util.getPostalCoords(postal)
    if coords and tonumber(coords.x) and tonumber(coords.y) then
      return {
        x = tonumber(coords.x) + 0.0,
        y = tonumber(coords.y) + 0.0,
      }
    end
  end

  return nil
end

local function clearPlayerWaypoint()
  if type(SetWaypointOff) ~= 'function' then return false end
  local ok = pcall(function()
    SetWaypointOff()
  end)
  return ok
end

RegisterNetEvent('cad_bridge:setCallRoute', function(payload)
  local route = type(payload) == 'table' and payload or {}
  local action = util.trim(route.action or ''):lower()
  local clearWaypoint = route.clear_waypoint == true or tonumber(route.clear_waypoint or 0) == 1 or action == 'clear'
  local suppressNotify = route.suppress_notify == true or tonumber(route.suppress_notify or 0) == 1

  if clearWaypoint then
    clearPlayerWaypoint()
    if not suppressNotify then
      notify.routeCleared(route)
    end
    return
  end

  local coords = resolveRouteCoords(route)
  if not coords then
    if not suppressNotify then
      notify.route(route, false)
    end
    return
  end

  pcall(function()
    SetNewWaypoint(coords.x, coords.y)
  end)
  if not suppressNotify then
    notify.route(route, true)
  end
end)

function notify.fine(payload)
  local title = tostring(payload and payload.title or 'CAD Fine Issued')
  local description = tostring(payload and payload.description or 'You have received a fine.')
  if util.triggerCadOxNotify({
    title = title,
    description = description,
    type = 'error',
  }) then
    return
  end
end

function notify.alert(payload)
  local title = tostring(payload and payload.title or 'CAD')
  local description = tostring(payload and payload.description or '')
  local notifyType = tostring(payload and payload.type or 'inform')
  if notifyType == '' then notifyType = 'inform' end

  if util.triggerCadOxNotify({
    title = title,
    description = description,
    type = notifyType,
  }) then
    return
  end
end

RegisterNetEvent('cad_bridge:notifyAlert', function(payload)
  notify.alert(type(payload) == 'table' and payload or {})
end)

function util.normalizeDepartmentIdList(value)
  local normalized = {}
  local seen = {}
  if type(value) ~= 'table' then return normalized end

  for key, raw in pairs(value) do
    local candidate = raw
    if type(key) ~= 'number' and (raw == true or raw == false or raw == nil) then
      candidate = key
    end
    local numeric = tonumber(candidate)
    if numeric and numeric > 0 then
      local id = math.floor(numeric)
      if not seen[id] then
        seen[id] = true
        normalized[#normalized + 1] = id
      end
    end
  end

  return normalized
end

function ui.hasAnyCadBridgeModalOpen()
  return state.emergencyUiOpen
    or state.trafficStopUiOpen
    or state.jailReleaseUiOpen
    or state.driverLicenseUiOpen
    or state.vehicleRegistrationUiOpen
end

function ui.refreshCadBridgeNuiFocus()
  if ui.hasAnyCadBridgeModalOpen() then
    SetNuiFocus(true, true)
  else
    SetNuiFocus(false, false)
  end
end

if type(ui.closeEmergencyPopup) ~= 'function' then
  function ui.closeEmergencyPopup() end
end
if type(ui.closeTrafficStopPopup) ~= 'function' then
  function ui.closeTrafficStopPopup() end
end
if type(ui.closeJailReleasePopup) ~= 'function' then
  function ui.closeJailReleasePopup() end
end
if type(ui.closeDriverLicensePopup) ~= 'function' then
  function ui.closeDriverLicensePopup() end
end
if type(ui.closeVehicleRegistrationPopup) ~= 'function' then
  function ui.closeVehicleRegistrationPopup() end
end

function ui.closeAllModals()
  ui.closeEmergencyPopup()
  ui.closeTrafficStopPopup()
  ui.closeJailReleasePopup()
  ui.closeDriverLicensePopup()
  ui.closeVehicleRegistrationPopup()
end
