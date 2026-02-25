local util = CadBridge and CadBridge.util or {}
local ui = CadBridge and CadBridge.ui or {}
local state = CadBridge and CadBridge.state or {}
if state.vehicleRegistrationSubmitPending == nil then state.vehicleRegistrationSubmitPending = false end
if state.npwdVicRoadsSubmitPending == nil then state.npwdVicRoadsSubmitPending = false end

local vicRoadsPendingRequestsById = {}
local vicRoadsRequestSeq = 0

local function trim(value)
  if type(util.trim) == 'function' then
    return util.trim(value)
  end
  if value == nil then return '' end
  return (tostring(value):gsub('^%s+', ''):gsub('%s+$', ''))
end

local function parseCoords(value)
  if type(util.parseCoords) == 'function' then
    return util.parseCoords(value)
  end
  return nil
end

local function readStateValue(container, key, index)
  if type(container) ~= 'table' and type(container) ~= 'userdata' then return nil end
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

local function applyCharInfoToName(current, charinfo)
  if type(charinfo) ~= 'table' then return current end
  local first = trim(charinfo.firstname or charinfo.firstName or '')
  local last = trim(charinfo.lastname or charinfo.lastName or '')
  local full = trim(first .. ' ' .. last)
  if full ~= '' then return full end
  return current
end

local function getLocalCharacterFullName()
  local playerName = trim(GetPlayerName(PlayerId()) or '')
  local fullName = playerName ~= '' and playerName or 'Player'

  local localPlayer = rawget(_G, 'LocalPlayer')
  local localState = localPlayer and readStateValue(localPlayer, 'state')
  if localState then
    fullName = applyCharInfoToName(fullName, readStateValue(localState, 'charinfo'))

    local statePlayerData = readStateValue(localState, 'PlayerData')
    if type(statePlayerData) == 'table' then
      fullName = applyCharInfoToName(fullName, statePlayerData.charinfo)
      local pdName = trim(statePlayerData.name or '')
      if pdName ~= '' and trim(fullName) == '' then fullName = pdName end
    end

    local stateName = trim(readStateValue(localState, 'name') or '')
    if stateName ~= '' and trim(fullName) == '' then fullName = stateName end
  end

  if GetResourceState('qbx_core') == 'started' then
    local ok, pd = pcall(function()
      if exports.qbx_core and type(exports.qbx_core.GetPlayerData) == 'function' then
        return exports.qbx_core:GetPlayerData()
      end
      if exports.qbx_core and type(exports.qbx_core.GetPlayer) == 'function' then
        local player = exports.qbx_core:GetPlayer(GetPlayerServerId(PlayerId()))
        return player and player.PlayerData or nil
      end
      return nil
    end)
    if ok and type(pd) == 'table' then
      fullName = applyCharInfoToName(fullName, pd.charinfo)
      local pdName = trim(pd.name or '')
      if pdName ~= '' and trim(fullName) == '' then fullName = pdName end
    end
  end

  if GetResourceState('qb-core') == 'started' then
    local ok, pd = pcall(function()
      local obj = exports['qb-core']:GetCoreObject()
      if obj and obj.Functions and type(obj.Functions.GetPlayerData) == 'function' then
        return obj.Functions.GetPlayerData()
      end
      return nil
    end)
    if ok and type(pd) == 'table' then
      fullName = applyCharInfoToName(fullName, pd.charinfo)
      local pdName = trim(pd.name or '')
      if pdName ~= '' and trim(fullName) == '' then fullName = pdName end
    end
  end

  fullName = trim(fullName)
  if fullName == '' then
    fullName = trim(GetPlayerName(PlayerId()) or '') ~= '' and trim(GetPlayerName(PlayerId()) or '') or 'Player'
  end
  return fullName
end

local function notifyWarn(title, description)
  if type(util.triggerCadOxNotify) == 'function' and util.triggerCadOxNotify({
    title = tostring(title or 'CAD'),
    description = tostring(description or ''),
    type = 'warning',
  }) then
    return
  end
  print(('[cad_bridge] %s'):format(tostring(description or '')))
end

local function getVehicleRegistrationDurationPresetOptions()
  local out = {}
  local seen = {}
  local configured = type(Config.VehicleRegistrationDurationOptions) == 'table' and Config.VehicleRegistrationDurationOptions or {}
  for _, raw in pairs(configured) do
    local value = math.floor(tonumber(raw) or 0)
    if value > 0 and not seen[value] then
      seen[value] = true
      out[#out + 1] = value
    end
  end
  table.sort(out)
  return out
end

local function resolveVehicleRegistrationDurationDays(requestedDays)
  local defaultDays = math.floor(tonumber(Config.VehicleRegistrationDefaultDays or 35) or 35)
  if defaultDays < 1 then defaultDays = 35 end

  local requested = math.floor(tonumber(requestedDays or 0) or 0)
  if requested < 1 then requested = defaultDays end

  local options = getVehicleRegistrationDurationPresetOptions()
  if #options <= 0 then
    return requested, {}, true
  end

  local fallback = options[1]
  for _, value in ipairs(options) do
    if value == defaultDays then
      fallback = value
      break
    end
  end

  for _, value in ipairs(options) do
    if value == requested then
      return value, options, true
    end
  end

  return fallback, options, false
end

local GTA_COLOUR_NAMES = {
  [0] = 'Black', [1] = 'Graphite', [2] = 'Black Steel', [3] = 'Dark Silver', [4] = 'Silver',
  [5] = 'Bluish Silver', [6] = 'Rolled Steel', [7] = 'Shadow Silver', [8] = 'Stone Silver', [9] = 'Midnight Silver',
  [10] = 'Cast Iron Silver', [11] = 'Anthracite Black', [12] = 'Matte Black', [13] = 'Matte Gray', [14] = 'Matte Light Gray',
  [15] = 'Util Black', [16] = 'Util Black Poly', [17] = 'Util Dark Silver', [18] = 'Util Silver', [19] = 'Util Gun Metal',
  [20] = 'Util Shadow Silver', [21] = 'Worn Black', [22] = 'Worn Graphite', [23] = 'Worn Silver Grey', [24] = 'Worn Silver',
  [25] = 'Worn Blue Silver', [26] = 'Worn Shadow Silver', [27] = 'Red', [28] = 'Torino Red', [29] = 'Formula Red',
  [30] = 'Blaze Red', [31] = 'Graceful Red', [32] = 'Garnet Red', [33] = 'Sunset Red', [34] = 'Cabernet Red',
  [35] = 'Candy Red', [36] = 'Sunrise Orange', [37] = 'Gold', [38] = 'Orange', [39] = 'Matte Red',
  [40] = 'Matte Dark Red', [41] = 'Matte Orange', [42] = 'Matte Yellow', [43] = 'Util Red', [44] = 'Util Bright Red',
  [45] = 'Util Garnet Red', [46] = 'Worn Red', [47] = 'Worn Golden Red', [48] = 'Worn Dark Red', [49] = 'Dark Green',
  [50] = 'Racing Green', [51] = 'Sea Green', [52] = 'Olive Green', [53] = 'Green', [54] = 'Gasoline Green',
  [55] = 'Matte Lime Green', [56] = 'Util Dark Green', [57] = 'Util Green', [58] = 'Worn Dark Green', [59] = 'Worn Green',
  [60] = 'Worn Sea Wash', [61] = 'Midnight Blue', [62] = 'Dark Blue', [63] = 'Saxony Blue', [64] = 'Blue',
  [65] = 'Mariner Blue', [66] = 'Harbor Blue', [67] = 'Diamond Blue', [68] = 'Surf Blue', [69] = 'Nautical Blue',
  [70] = 'Racing Blue', [71] = 'Ultra Blue', [72] = 'Light Blue', [73] = 'Chocolate Brown', [74] = 'Bison Brown',
  [75] = 'Creek Brown', [76] = 'Feltzer Brown', [77] = 'Maple Brown', [78] = 'Beechwood Brown', [79] = 'Sienna Brown',
  [80] = 'Saddle Brown', [81] = 'Moss Brown', [82] = 'Woodbeech Brown', [83] = 'Straw Brown', [84] = 'Sandy Brown',
  [85] = 'Bleached Brown', [86] = 'Schafter Purple', [87] = 'Spinnaker Purple', [88] = 'Midnight Purple', [89] = 'Bright Purple',
  [90] = 'Cream', [91] = 'Ice White', [92] = 'Frost White', [93] = 'Champagne', [94] = 'Pueblo Beige',
  [95] = 'Dark Ivory', [96] = 'Chocolate Brown', [97] = 'Golden Brown', [98] = 'Light Brown', [99] = 'Straw Beige',
  [100] = 'Moss Brown', [101] = 'Biston Brown', [102] = 'Beechwood', [103] = 'Dark Beechwood', [104] = 'Choco Orange',
  [105] = 'Beach Sand', [106] = 'Sun Bleached Sand', [107] = 'Cream', [108] = 'Util Brown', [109] = 'Util Medium Brown',
  [110] = 'Util Light Brown', [111] = 'Metallic White', [112] = 'Metallic Frost White', [113] = 'Worn Honey Beige', [114] = 'Worn Brown',
  [115] = 'Worn Dark Brown', [116] = 'Worn Straw Beige', [117] = 'Brushed Steel', [118] = 'Brushed Black Steel', [119] = 'Brushed Aluminium',
  [120] = 'Chrome', [121] = 'Worn Off White', [122] = 'Util Off White', [123] = 'Worn Orange', [124] = 'Worn Light Orange',
  [125] = 'Metallic Securicor Green', [126] = 'Worn Taxi Yellow', [127] = 'Police Blue', [128] = 'Matte Green', [129] = 'Matte Brown',
  [130] = 'Worn Orange', [131] = 'Matte White', [132] = 'Worn White', [133] = 'Worn Olive Army Green', [134] = 'Pure White',
  [135] = 'Hot Pink', [136] = 'Salmon Pink', [137] = 'Metallic Vermillion Pink', [138] = 'Orange', [139] = 'Green',
  [140] = 'Blue', [141] = 'Metallic Black Blue', [142] = 'Metallic Black Purple', [143] = 'Metallic Black Red', [144] = 'Hunter Green',
  [145] = 'Metallic Purple', [146] = 'Metallic V Dark Blue', [147] = 'Modshop Black', [148] = 'Matte Purple', [149] = 'Matte Dark Purple',
  [150] = 'Metallic Lava Red', [151] = 'Matte Forest Green', [152] = 'Matte Olive Drab', [153] = 'Matte Desert Brown', [154] = 'Matte Desert Tan',
  [155] = 'Matte Foilage Green', [156] = 'Default Alloy', [157] = 'Epsilon Blue', [158] = 'Pure Gold', [159] = 'Brushed Gold',
}

local GTA_COLOUR_NAME_OVERRIDES = {
  [0] = 'Black', [1] = 'Graphite', [2] = 'Black Steel', [3] = 'Dark Steel', [4] = 'Silver',
  [5] = 'Bluish Silver', [6] = 'Rolled Steel', [7] = 'Shadow Silver', [8] = 'Stone Silver', [9] = 'Midnight Silver',
  [10] = 'Cast Iron Silver', [11] = 'Anthracite Black', [12] = 'Matte Black', [13] = 'Matte Gray', [14] = 'Matte Light Gray',
  [27] = 'Red', [28] = 'Torino Red', [29] = 'Formula Red', [30] = 'Blaze Red', [31] = 'Grace Red',
  [32] = 'Garnet Red', [33] = 'Sunset Red', [34] = 'Cabernet Red', [35] = 'Candy Red', [36] = 'Sunrise Orange',
  [38] = 'Orange', [39] = 'Matte Red', [40] = 'Matte Dark Red', [41] = 'Matte Orange', [42] = 'Matte Yellow',
  [49] = 'Dark Green', [50] = 'Racing Green', [51] = 'Sea Green', [52] = 'Olive Green', [53] = 'Bright Green',
  [54] = 'Gasoline Green', [55] = 'Matte Lime Green', [61] = 'Galaxy Blue', [62] = 'Dark Blue', [63] = 'Saxon Blue',
  [64] = 'Blue', [65] = 'Mariner Blue', [66] = 'Harbor Blue', [67] = 'Diamond Blue', [68] = 'Surf Blue',
  [69] = 'Nautical Blue', [70] = 'Ultra Blue', [71] = 'Schafter Purple', [72] = 'Spinnaker Purple', [73] = 'Racing Blue',
  [74] = 'Light Blue', [82] = 'Matte Dark Blue', [83] = 'Matte Blue', [84] = 'Matte Midnight Blue', [88] = 'Yellow',
  [89] = 'Race Yellow', [90] = 'Bronze', [91] = 'Dew Yellow', [92] = 'Lime Green', [94] = 'Feltzer Brown',
  [95] = 'Creek Brown', [96] = 'Chocolate Brown', [97] = 'Maple Brown', [98] = 'Saddle Brown', [99] = 'Straw Brown',
  [100] = 'Moss Brown', [101] = 'Bison Brown', [102] = 'Woodbeech Brown', [103] = 'Beechwood Brown', [104] = 'Sienna Brown',
  [105] = 'Sandy Brown', [106] = 'Bleached Brown', [107] = 'Cream', [111] = 'Ice White', [112] = 'Frost White',
  [117] = 'Brushed Steel', [118] = 'Brushed Black Steel', [119] = 'Brushed Aluminum', [128] = 'Matte Green', [131] = 'Matte Ice White',
  [135] = 'Hot Pink', [136] = 'Salmon Pink', [137] = 'Pfister Pink', [138] = 'Bright Orange', [141] = 'Midnight Blue',
  [142] = 'Midnight Purple', [143] = 'Wine Red', [145] = 'Bright Purple', [147] = 'Carbon Black', [148] = 'Matte Schafter Purple',
  [149] = 'Matte Midnight Purple', [150] = 'Lava Red', [151] = 'Matte Frost Green', [152] = 'Matte Olive Drab', [154] = 'Matte Desert Tan',
  [155] = 'Matte Dark Earth', [158] = 'Pure Gold', [159] = 'Brushed Gold',
}

local function resolveVehicleColourName(index)
  local id = tonumber(index)
  if id == nil then return 'Unknown' end
  id = math.floor(id)
  if GTA_COLOUR_NAME_OVERRIDES[id] then
    return GTA_COLOUR_NAME_OVERRIDES[id]
  end
  return GTA_COLOUR_NAMES[id] or ('Colour %s'):format(tostring(id))
end

local function getVehicleCustomColourLabel(vehicle, primary)
  local hasCustom = false
  if primary then
    if type(GetIsVehiclePrimaryColourCustom) == 'function' then
      hasCustom = GetIsVehiclePrimaryColourCustom(vehicle) == true
    end
  else
    if type(GetIsVehicleSecondaryColourCustom) == 'function' then
      hasCustom = GetIsVehicleSecondaryColourCustom(vehicle) == true
    end
  end
  if not hasCustom then return '' end

  local r, g, b = nil, nil, nil
  if primary and type(GetVehicleCustomPrimaryColour) == 'function' then
    r, g, b = GetVehicleCustomPrimaryColour(vehicle)
  elseif (not primary) and type(GetVehicleCustomSecondaryColour) == 'function' then
    r, g, b = GetVehicleCustomSecondaryColour(vehicle)
  end

  if r and g and b then
    return ('Custom (%d, %d, %d)'):format(tonumber(r) or 0, tonumber(g) or 0, tonumber(b) or 0)
  end
  return 'Custom'
end

local function getVehicleColourLabel(vehicle)
  local primary, secondary = GetVehicleColours(vehicle)
  local primaryLabel = getVehicleCustomColourLabel(vehicle, true)
  if primaryLabel == '' then primaryLabel = resolveVehicleColourName(primary) end

  local secondaryLabel = getVehicleCustomColourLabel(vehicle, false)
  if secondaryLabel == '' then secondaryLabel = resolveVehicleColourName(secondary) end

  if primaryLabel == secondaryLabel then return primaryLabel end
  return ('%s / %s'):format(primaryLabel, secondaryLabel)
end

local function distanceBetweenVec2(a, b)
  local av = parseCoords(a)
  local bv = parseCoords(b)
  if not av or not bv then return 999999.0 end
  local ax = tonumber(av.x) or 0.0
  local ay = tonumber(av.y) or 0.0
  local bx = tonumber(bv.x) or 0.0
  local by = tonumber(bv.y) or 0.0
  local dx = ax - bx
  local dy = ay - by
  return math.sqrt((dx * dx) + (dy * dy))
end

local function isVehicleUsableForRegistration(vehicle)
  if not vehicle or vehicle == 0 then return false end
  if not DoesEntityExist(vehicle) then return false end
  if not IsEntityAVehicle(vehicle) then return false end
  return true
end

local function findNearestVehicleInRadius(origin, radius)
  local resolvedOrigin = parseCoords(origin)
  local vehicles = GetGamePool('CVehicle')
  if type(vehicles) ~= 'table' or not resolvedOrigin then return 0, 999999.0 end

  local maxRadius = tonumber(radius) or 8.0
  if maxRadius < 2.0 then maxRadius = 2.0 end
  if maxRadius > 80.0 then maxRadius = 80.0 end
  local searchRadius = maxRadius + math.max(1.5, maxRadius * 0.12)
  local maxZDiff = math.max(6.0, searchRadius * 0.9)

  local bestVehicle, bestDistance, bestHasPlate = 0, searchRadius + 0.001, false
  local fallbackVehicle, fallbackDistance, fallbackHasPlate = 0, searchRadius + 0.001, false

  local function considerCandidate(vehicle, dist2d, zDiff, hasPlate)
    if dist2d <= searchRadius then
      local shouldUseFallback = false
      if fallbackVehicle == 0 then
        shouldUseFallback = true
      elseif hasPlate and not fallbackHasPlate then
        shouldUseFallback = true
      elseif hasPlate == fallbackHasPlate and dist2d < fallbackDistance then
        shouldUseFallback = true
      end
      if shouldUseFallback then
        fallbackDistance = dist2d
        fallbackVehicle = vehicle
        fallbackHasPlate = hasPlate
      end
    end

    if dist2d <= searchRadius and zDiff <= maxZDiff then
      local shouldUseBest = false
      if bestVehicle == 0 then
        shouldUseBest = true
      elseif hasPlate and not bestHasPlate then
        shouldUseBest = true
      elseif hasPlate == bestHasPlate and dist2d < bestDistance then
        shouldUseBest = true
      end
      if shouldUseBest then
        bestDistance = dist2d
        bestVehicle = vehicle
        bestHasPlate = hasPlate
      end
    end
  end

  for _, vehicle in ipairs(vehicles) do
    if isVehicleUsableForRegistration(vehicle) then
      local coords = GetEntityCoords(vehicle)
      local dist2d = distanceBetweenVec2(coords, resolvedOrigin)
      local hasPlate = trim(GetVehicleNumberPlateText(vehicle) or '') ~= ''
      local zDiff = math.abs((tonumber(coords and coords.z) or 0.0) - (tonumber(resolvedOrigin and resolvedOrigin.z) or 0.0))
      considerCandidate(vehicle, dist2d, zDiff, hasPlate)
    end
  end

  local playerPed = PlayerPedId()
  if playerPed and playerPed ~= 0 and IsPedInAnyVehicle(playerPed, false) then
    local playerVehicle = GetVehiclePedIsIn(playerPed, false)
    if isVehicleUsableForRegistration(playerVehicle) then
      local playerCoords = GetEntityCoords(playerVehicle)
      local playerDist2d = distanceBetweenVec2(playerCoords, resolvedOrigin)
      local playerZDiff = math.abs((tonumber(playerCoords and playerCoords.z) or 0.0) - (tonumber(resolvedOrigin and resolvedOrigin.z) or 0.0))
      local playerHasPlate = trim(GetVehicleNumberPlateText(playerVehicle) or '') ~= ''
      considerCandidate(playerVehicle, playerDist2d, playerZDiff, playerHasPlate)
    end
  end

  if bestVehicle == 0 and type(GetClosestVehicle) == 'function' then
    local closest = GetClosestVehicle(
      tonumber(resolvedOrigin.x) or 0.0,
      tonumber(resolvedOrigin.y) or 0.0,
      tonumber(resolvedOrigin.z) or 0.0,
      searchRadius + 5.0,
      0,
      70
    )
    if isVehicleUsableForRegistration(closest) then
      local closestCoords = GetEntityCoords(closest)
      local closestDist2d = distanceBetweenVec2(closestCoords, resolvedOrigin)
      local closestZDiff = math.abs((tonumber(closestCoords and closestCoords.z) or 0.0) - (tonumber(resolvedOrigin and resolvedOrigin.z) or 0.0))
      local closestHasPlate = trim(GetVehicleNumberPlateText(closest) or '') ~= ''
      considerCandidate(closest, closestDist2d, closestZDiff, closestHasPlate)
    end
  end

  if bestVehicle == 0 then
    bestVehicle = fallbackVehicle
    bestDistance = fallbackDistance
  end
  if bestVehicle == 0 then return 0, 999999.0 end
  return bestVehicle, bestDistance
end

local function getCurrentVehicleRegistrationDefaults(registrationParking)
  local payload = {
    plate = '',
    vehicle_model = '',
    vehicle_colour = '',
    error_message = '',
  }

  local ped = PlayerPedId()
  if not ped or ped == 0 then return payload end

  local playerCoords = GetEntityCoords(ped)
  local parking = type(registrationParking) == 'table' and registrationParking or {}
  local zoneCoords = parseCoords(parking.coords)
  local zoneRadius = tonumber(parking.radius or 0) or 0
  local searchOrigin = zoneCoords or playerCoords
  local searchRadius = zoneRadius > 0 and zoneRadius or 12.0

  local vehicle, vehicleDistance = findNearestVehicleInRadius(searchOrigin, searchRadius)
  if (not vehicle or vehicle == 0) and zoneCoords then
    local expandedRadius = math.min(60.0, searchRadius + math.max(8.0, searchRadius * 0.5))
    vehicle, vehicleDistance = findNearestVehicleInRadius(searchOrigin, expandedRadius)
  end

  if not vehicle or vehicle == 0 then
    payload.error_message = 'No vehicle found in the registration area. Park any vehicle inside the marked carpark.'
    return payload
  end
  if tonumber(vehicleDistance) and tonumber(vehicleDistance) > (searchRadius + 8.0) then
    payload.error_message = 'No nearby vehicle found in the registration area. Move the vehicle closer to the marked carpark.'
    return payload
  end

  local plate = trim(GetVehicleNumberPlateText(vehicle) or '')
  if plate == '' then
    payload.error_message = 'Vehicle detected but plate could not be read. Re-park and try again.'
    return payload
  end
  local modelHash = GetEntityModel(vehicle)
  local model = GetDisplayNameFromVehicleModel(modelHash)
  if model and model ~= '' then
    local localized = GetLabelText(model)
    if localized and localized ~= '' and localized ~= 'NULL' then model = localized end
  else
    model = ''
  end
  if model == '' or model == 'NULL' or model == 'CARNOTFOUND' then
    model = tostring(modelHash or '')
  end

  payload.plate = plate
  payload.vehicle_model = trim(model or '')
  payload.vehicle_colour = getVehicleColourLabel(vehicle)
  return payload
end

local function closeVehicleRegistrationPopup()
  if not state.vehicleRegistrationUiOpen then return end
  state.vehicleRegistrationUiOpen = false
  state.vehicleRegistrationSubmitPending = false
  if type(ui.refreshCadBridgeNuiFocus) == 'function' then
    ui.refreshCadBridgeNuiFocus()
  end
  SendNUIMessage({
    action = 'cadBridgeRegistration:close',
    payload = {},
  })
end
ui.closeVehicleRegistrationPopup = closeVehicleRegistrationPopup

local function openVehicleRegistrationPopup(payload)
  if state.emergencyUiOpen and type(ui.closeEmergencyPopup) == 'function' then
    ui.closeEmergencyPopup()
  end
  if state.driverLicenseUiOpen and type(ui.closeDriverLicensePopup) == 'function' then
    ui.closeDriverLicensePopup()
  end

  local nextPayload = payload or {}
  local defaults = getCurrentVehicleRegistrationDefaults(nextPayload.registration_parking)
  if trim(nextPayload.plate or '') == '' then nextPayload.plate = defaults.plate end
  if trim(nextPayload.vehicle_model or '') == '' then nextPayload.vehicle_model = defaults.vehicle_model end
  if trim(nextPayload.vehicle_colour or '') == '' then nextPayload.vehicle_colour = defaults.vehicle_colour end

  if trim(nextPayload.plate or '') == '' or trim(nextPayload.vehicle_model or '') == '' then
    local message = trim(defaults.error_message or '')
    if message == '' then
      message = 'Park any vehicle in the registration carpark so details can be auto-filled.'
    end
    notifyWarn('CAD Registration', message)
    return
  end

  state.vehicleRegistrationUiOpen = true
  state.vehicleRegistrationSubmitPending = false
  SetNuiFocus(true, true)
  SendNUIMessage({
    action = 'cadBridgeRegistration:open',
    payload = nextPayload,
  })
end

local function nextVicRoadsRequestId(prefix)
  vicRoadsRequestSeq = (tonumber(vicRoadsRequestSeq) or 0) + 1
  if vicRoadsRequestSeq > 999999 then vicRoadsRequestSeq = 1 end
  return ('%s:%s:%s'):format(
    trim(prefix ~= '' and prefix or 'vicroads'),
    tostring(GetGameTimer() or 0),
    tostring(vicRoadsRequestSeq)
  )
end

local function awaitVicRoadsRegistrationReply(payload, timeoutMs)
  local requestId = nextVicRoadsRequestId('vicroads_registration')
  local pending = { done = false, response = nil }
  vicRoadsPendingRequestsById[requestId] = pending

  local nextPayload = type(payload) == 'table' and payload or {}
  nextPayload.request_id = requestId
  TriggerServerEvent('cad_bridge:submitVehicleRegistration', nextPayload)

  local deadline = (tonumber(GetGameTimer() or 0) or 0) + math.max(3000, tonumber(timeoutMs) or 20000)
  while pending.done ~= true and (tonumber(GetGameTimer() or 0) or 0) < deadline do
    Wait(0)
  end

  vicRoadsPendingRequestsById[requestId] = nil

  if pending.done ~= true then
    return {
      ok = false,
      error = 'timeout',
      error_code = 'timeout',
      message = 'VicRoads registration request timed out. Please try again.',
      request_id = requestId,
    }
  end

  if type(pending.response) ~= 'table' then
    return {
      ok = false,
      error = 'invalid_response',
      error_code = 'invalid_response',
      message = 'VicRoads registration returned an invalid response.',
      request_id = requestId,
    }
  end

  return pending.response
end
ui.openVehicleRegistrationPopup = openVehicleRegistrationPopup

local function buildCurrentSeatedVehicleRegistrationPrefill()
  local ped = PlayerPedId()
  if not ped or ped == 0 then
    return nil, 'Player ped not available.'
  end
  if not IsPedInAnyVehicle(ped, false) then
    return nil, 'You need to be sitting in the vehicle you want to register before opening VicRoads.'
  end

  local vehicle = GetVehiclePedIsIn(ped, false)
  if not isVehicleUsableForRegistration(vehicle) then
    return nil, 'Unable to detect the vehicle you are sitting in. Exit and re-enter the vehicle, then try again.'
  end

  local plate = trim(GetVehicleNumberPlateText(vehicle) or '')
  if plate == '' then
    return nil, 'The vehicle plate could not be read. Re-seat in the vehicle and try again.'
  end

  local modelHash = GetEntityModel(vehicle)
  local model = GetDisplayNameFromVehicleModel(modelHash)
  if model and model ~= '' then
    local localized = GetLabelText(model)
    if localized and localized ~= '' and localized ~= 'NULL' then model = localized end
  else
    model = ''
  end
  if model == '' or model == 'NULL' or model == 'CARNOTFOUND' then
    model = tostring(modelHash or '')
  end

  local ownerName = getLocalCharacterFullName()
  local resolvedDefaultDays, durationOptions = resolveVehicleRegistrationDurationDays(Config.VehicleRegistrationDefaultDays or 35)
  return {
    plate = plate,
    vehicle_model = trim(model or ''),
    vehicle_colour = getVehicleColourLabel(vehicle),
    owner_name = ownerName,
    character_name = ownerName,
    duration_options = durationOptions,
    default_duration_days = resolvedDefaultDays,
    source = 'npwd_vicroads',
  }, ''
end

RegisterNUICallback('cadBridgeRegistrationSubmit', function(data, cb)
  if state.vehicleRegistrationSubmitPending == true then
    if cb then cb({ ok = false, error = 'submit_in_progress' }) end
    return
  end

  local plate = trim(data and data.plate or data and data.license_plate or '')
  local model = trim(data and data.vehicle_model or data and data.model or '')
  local colour = trim(data and data.vehicle_colour or data and data.colour or data and data.color or '')
  local ownerName = trim(data and data.owner_name or data and data.character_name or '')
  local requestedDurationDays = tonumber(data and data.duration_days or 0) or tonumber(Config.VehicleRegistrationDefaultDays or 35) or 35
  local durationDays, _, durationAllowed = resolveVehicleRegistrationDurationDays(requestedDurationDays)

  if plate == '' or model == '' then
    if cb then cb({ ok = false, error = 'invalid_form' }) end
    return
  end

  state.vehicleRegistrationSubmitPending = true
  SendNUIMessage({
    action = 'cadBridgeRegistration:submitting',
    payload = {
      pending = true,
      message = 'Submitting registration...',
    },
  })
  if cb then cb({ ok = true, pending = true }) end
  TriggerServerEvent('cad_bridge:submitVehicleRegistration', {
    plate = plate,
    vehicle_model = model,
    vehicle_colour = colour,
    owner_name = ownerName,
    duration_days = math.floor(durationDays),
  })
end)

RegisterNUICallback('cadBridgeRegistrationCancel', function(_data, cb)
  closeVehicleRegistrationPopup()
  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridgeNpwdVicRoadsOpenRegistration', function(_data, cb)
  local payload, err = buildCurrentSeatedVehicleRegistrationPrefill()
  if not payload then
    local message = trim(err or 'You must be sitting in a vehicle to register it from the phone.')
    notifyWarn('VicRoads', message)
    if cb then cb({ ok = false, error = 'not_in_vehicle', message = message }) end
    return
  end

  openVehicleRegistrationPopup(payload)
  if cb then cb({ ok = true, message = 'VicRoads registration opened.' }) end
end)

RegisterNUICallback('cadBridgeNpwdVicRoadsGetPrefill', function(_data, cb)
  local payload, err = buildCurrentSeatedVehicleRegistrationPrefill()
  if not payload then
    local message = trim(err or 'You must be sitting in a vehicle to register it from the phone.')
    notifyWarn('VicRoads', message)
    if cb then cb({ ok = false, error = 'not_in_vehicle', error_code = 'not_in_vehicle', message = message }) end
    return
  end

  payload.duration_days = select(1, resolveVehicleRegistrationDurationDays(payload.default_duration_days or Config.VehicleRegistrationDefaultDays or 35))
  if cb then cb({ ok = true, payload = payload }) end
end)

RegisterNUICallback('cadBridgeNpwdVicRoadsSubmitRegistration', function(data, cb)
  if state.npwdVicRoadsSubmitPending == true then
    if cb then
      cb({
        ok = false,
        error = 'submit_in_progress',
        error_code = 'submit_in_progress',
        message = 'A VicRoads registration request is already in progress.',
      })
    end
    return
  end

  local plate = trim(data and data.plate or data and data.license_plate or '')
  local model = trim(data and data.vehicle_model or data and data.model or '')
  local colour = trim(data and data.vehicle_colour or data and data.colour or data and data.color or '')
  local ownerName = trim(data and data.owner_name or data and data.character_name or '')
  local durationDays = tonumber(data and data.duration_days or 0) or tonumber(Config.VehicleRegistrationDefaultDays or 35) or 35
  durationDays = select(1, resolveVehicleRegistrationDurationDays(durationDays))

  if plate == '' or model == '' then
    if cb then
      cb({
        ok = false,
        error = 'invalid_form',
        error_code = 'invalid_form',
        message = 'Plate and vehicle model are required.',
      })
    end
    return
  end
  if ownerName == '' then
    if cb then
      cb({
        ok = false,
        error = 'missing_owner',
        error_code = 'missing_owner',
        message = 'Unable to determine your current character name. Re-log and try again.',
      })
    end
    return
  end
  if durationAllowed ~= true then
    if cb then
      cb({
        ok = false,
        error = 'invalid_duration_period',
        error_code = 'invalid_duration_period',
        message = 'Select one of the available registration periods.',
      })
    end
    return
  end

  state.npwdVicRoadsSubmitPending = true
  local result = awaitVicRoadsRegistrationReply({
    plate = plate,
    vehicle_model = model,
    vehicle_colour = colour,
    owner_name = ownerName,
    duration_days = math.floor(durationDays),
    source = 'npwd_vicroads',
  }, 25000)
  state.npwdVicRoadsSubmitPending = false

  if cb then cb(result) end
end)

RegisterNetEvent('cad_bridge:promptVehicleRegistration', function(payload)
  openVehicleRegistrationPopup(payload or {})
end)

RegisterNetEvent('cad_bridge:vehicleRegistrationSubmitResult', function(payload)
  local result = type(payload) == 'table' and payload or {}
  local requestId = trim(result.request_id or '')
  local ok = result.ok == true or result.success == true
  local message = trim(result.message or result.error or '')
  local errorCode = trim(result.error_code or '')

  if requestId ~= '' then
    local pending = vicRoadsPendingRequestsById[requestId]
    if pending then
      pending.response = result
      pending.done = true
    end
  end

  state.vehicleRegistrationSubmitPending = false

  if ok then
    closeVehicleRegistrationPopup()
    return
  end

  if not state.vehicleRegistrationUiOpen then
    return
  end

  SendNUIMessage({
    action = 'cadBridgeRegistration:submitResult',
    payload = {
      ok = false,
      error_code = errorCode,
      message = message,
    },
  })
end)
