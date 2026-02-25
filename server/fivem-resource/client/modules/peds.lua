local util = CadBridge and CadBridge.util or {}
local ui = CadBridge and CadBridge.ui or {}
local state = CadBridge and CadBridge.state or {}

local function trim(value)
  if type(util.trim) == 'function' then
    return util.trim(value)
  end
  if value == nil then return '' end
  return (tostring(value):gsub('^%s+', ''):gsub('%s+$', ''))
end

local documentInteractionDistance = tonumber(Config.DocumentPedInteractionDistance or 2.2) or 2.2
if documentInteractionDistance < 1.0 then documentInteractionDistance = 1.0 end
local documentPromptDistance = tonumber(Config.DocumentPedPromptDistance or 12.0) or 12.0
if documentPromptDistance < documentInteractionDistance then
  documentPromptDistance = documentInteractionDistance + 2.0
end

local documentPeds = {}
local documentPedBlips = {}
local documentPedTargetEntities = {}
local useOxTargetForDocuments = GetResourceState('ox_target') == 'started'

local trafficYieldAssistEnabled = Config.AiTrafficYieldAssistEnabled == true
local trafficYieldAssistStates = {}
local trafficYieldDrivingStyle = 786603
local trafficYieldStopAtLightsFlag = 128
local trafficYieldClearDrivingStyle = trafficYieldDrivingStyle
if (trafficYieldClearDrivingStyle % (trafficYieldStopAtLightsFlag * 2)) >= trafficYieldStopAtLightsFlag then
  -- Remove the stop-at-lights bit while clearing space for emergency vehicles.
  trafficYieldClearDrivingStyle = trafficYieldClearDrivingStyle - trafficYieldStopAtLightsFlag
end

local trafficYieldPollIntervalMs = math.max(100, math.floor(tonumber(Config.AiTrafficYieldAssistPollIntervalMs) or 250))
local trafficYieldRadiusMeters = math.max(20.0, tonumber(Config.AiTrafficYieldAssistRadiusMeters) or 70.0)
local trafficYieldMinOfficerSpeedMps = math.max(0.0, tonumber(Config.AiTrafficYieldAssistMinOfficerSpeedMps) or 8.0)
local trafficYieldLaneBandMeters = math.max(4.0, tonumber(Config.AiTrafficYieldAssistLaneBandMeters) or 14.0)
local trafficYieldForwardOffsetMeters = math.max(6.0, tonumber(Config.AiTrafficYieldAssistForwardOffsetMeters) or 18.0)
local trafficYieldSideOffsetMeters = math.max(2.0, tonumber(Config.AiTrafficYieldAssistSideOffsetMeters) or 5.5)
local trafficYieldPreferLeft = Config.AiTrafficYieldAssistPreferLeft == true
local trafficYieldMaxTargetsPerPulse = math.max(1, math.floor(tonumber(Config.AiTrafficYieldAssistMaxTargetsPerPulse) or 4))
local trafficYieldResumeAfterMs = math.max(1000, math.floor(tonumber(Config.AiTrafficYieldAssistResumeAfterMs) or 7000))
local trafficYieldReapplyMs = math.max(250, math.floor(tonumber(Config.AiTrafficYieldAssistReapplyMs) or 900))
local trafficYieldResumeWander = Config.AiTrafficYieldAssistResumeWander == true
local trafficYieldCooldownMs = math.max(
  trafficYieldResumeAfterMs,
  math.floor(tonumber(Config.AiTrafficYieldAssistCooldownMs) or 5000)
)
local trafficYieldPushMinSpeedMps = math.max(0.0, tonumber(Config.AiTrafficYieldAssistPushMinSpeedMps) or 4.5)

local emergencyVehicleClassSet = { [18] = true }
if type(Config.WraithEmergencyVehicleClasses) == 'table' then
  for _, classId in ipairs(Config.WraithEmergencyVehicleClasses) do
    local normalized = tonumber(classId)
    if normalized ~= nil then
      emergencyVehicleClassSet[math.floor(normalized)] = true
    end
  end
end

local function dot2(ax, ay, bx, by)
  return ((tonumber(ax) or 0.0) * (tonumber(bx) or 0.0)) + ((tonumber(ay) or 0.0) * (tonumber(by) or 0.0))
end

local function isVehicleSirenActive(vehicle)
  if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then return false end
  local ok, result = pcall(function()
    return IsVehicleSirenOn(vehicle) or IsVehicleSirenAudioOn(vehicle) or IsVehicleSirenSoundOn(vehicle)
  end)
  return ok and (result == true or result == 1)
end

local function isEmergencyResponseVehicle(vehicle)
  if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then return false end
  local okHasSiren, hasSiren = pcall(function()
    return DoesVehicleHaveSiren(vehicle)
  end)
  if not okHasSiren or (hasSiren ~= true and hasSiren ~= 1) then
    return false
  end
  local classId = tonumber(GetVehicleClass(vehicle))
  if classId == nil then return false end
  return emergencyVehicleClassSet[math.floor(classId)] == true
end

local function shouldAffectTrafficVehicle(vehicle, playerVehicle, playerCoords, playerForward, playerRight, nowMs)
  if not vehicle or vehicle == 0 or vehicle == playerVehicle then return nil end
  if not DoesEntityExist(vehicle) then return nil end

  local driver = GetPedInVehicleSeat(vehicle, -1)
  if not driver or driver == 0 or not DoesEntityExist(driver) then return nil end
  if IsPedAPlayer(driver) then return nil end
  if IsPedDeadOrDying(driver, true) then return nil end
  if GetPedInVehicleSeat(vehicle, -1) ~= driver then return nil end

  local modelHash = GetEntityModel(vehicle)
  if not modelHash or modelHash == 0 then return nil end
  if not IsThisModelACar(modelHash) and not IsThisModelABike(modelHash) then
    return nil
  end
  if isEmergencyResponseVehicle(vehicle) then return nil end

  local existing = trafficYieldAssistStates[vehicle]
  if type(existing) == 'table' and nowMs < (tonumber(existing.cooldown_until_ms) or 0) then
    if existing.resumed == true then
      return nil
    end
    if nowMs < (tonumber(existing.next_reapply_ms) or 0) then
      return nil
    end
  end

  local coords = GetEntityCoords(vehicle)
  local zDelta = math.abs((tonumber(coords.z) or 0.0) - (tonumber(playerCoords.z) or 0.0))
  if zDelta > 10.0 then return nil end

  local relX = (tonumber(coords.x) or 0.0) - (tonumber(playerCoords.x) or 0.0)
  local relY = (tonumber(coords.y) or 0.0) - (tonumber(playerCoords.y) or 0.0)
  local relZ = (tonumber(coords.z) or 0.0) - (tonumber(playerCoords.z) or 0.0)
  local planarDistanceSq = (relX * relX) + (relY * relY)
  if planarDistanceSq < 9.0 or planarDistanceSq > (trafficYieldRadiusMeters * trafficYieldRadiusMeters) then
    return nil
  end

  local forwardDistance = dot2(relX, relY, playerForward.x, playerForward.y)
  if forwardDistance < 3.0 then return nil end

  local lateralDistance = dot2(relX, relY, playerRight.x, playerRight.y)
  if math.abs(lateralDistance) > trafficYieldLaneBandMeters then return nil end

  local targetForward = GetEntityForwardVector(vehicle)
  local headingAlignment = dot2(targetForward.x, targetForward.y, playerForward.x, playerForward.y)
  if headingAlignment < 0.15 then
    return nil
  end

  return {
    vehicle = vehicle,
    driver = driver,
    coords = coords,
    forward_distance = forwardDistance,
    lateral_distance = lateralDistance,
    speed_mps = tonumber(GetEntitySpeed(vehicle)) or 0.0,
    heading_alignment = headingAlignment,
    rel_z = relZ,
  }
end

local function applyTrafficYieldAssist(target, officerVehicleSpeedMps, nowMs)
  if type(target) ~= 'table' then return end
  local vehicle = target.vehicle
  local driver = target.driver
  if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then return end
  if not driver or driver == 0 or not DoesEntityExist(driver) then return end
  if GetPedInVehicleSeat(vehicle, -1) ~= driver then return end

  local currentCoords = GetEntityCoords(vehicle)
  local forwardVec = GetEntityForwardVector(vehicle)
  local rightVec = GetEntityRightVector(vehicle)
  local lateralDistance = tonumber(target.lateral_distance) or 0.0
  -- Force all yielding traffic to move right so left lanes clear for emergency vehicles.
  local sideSign = 1.0

  local targetSpeedMps = tonumber(target.speed_mps) or 0.0
  local isStoppedOrQueued = targetSpeedMps < 1.25
  local extraForward = math.min(8.0, math.max(0.0, targetSpeedMps * 0.8))
  if isStoppedOrQueued then
    -- Push the destination farther ahead so queued traffic clears intersections.
    extraForward = extraForward + 14.0
  end
  local sideOffsetMeters = math.max(trafficYieldSideOffsetMeters * 2.0, trafficYieldSideOffsetMeters + 4.0)
  sideOffsetMeters = math.min(math.max(sideOffsetMeters, math.abs(lateralDistance) + 4.0), trafficYieldLaneBandMeters + 6.0)
  local destX = (tonumber(currentCoords.x) or 0.0)
    + ((tonumber(forwardVec.x) or 0.0) * (trafficYieldForwardOffsetMeters + extraForward))
    + ((tonumber(rightVec.x) or 0.0) * (sideOffsetMeters * sideSign))
  local destY = (tonumber(currentCoords.y) or 0.0)
    + ((tonumber(forwardVec.y) or 0.0) * (trafficYieldForwardOffsetMeters + extraForward))
    + ((tonumber(rightVec.y) or 0.0) * (sideOffsetMeters * sideSign))
  local destZ = tonumber(currentCoords.z) or 0.0

  local driveSpeedMps = math.max(10.0, math.min(28.0, math.max(targetSpeedMps + 2.0, officerVehicleSpeedMps * 0.8)))

  pcall(function()
    NetworkRequestControlOfEntity(vehicle)
  end)

  pcall(function()
    SetDriveTaskDrivingStyle(driver, trafficYieldClearDrivingStyle)
    SetPedKeepTask(driver, true)
    TaskVehicleDriveToCoordLongrange(driver, vehicle, destX + 0.0, destY + 0.0, destZ + 0.0, driveSpeedMps + 0.0, trafficYieldClearDrivingStyle, 1.5)
  end)

  if trafficYieldPushMinSpeedMps > 0.0 then
    local currentSpeed = tonumber(GetEntitySpeed(vehicle)) or 0.0
    if currentSpeed < trafficYieldPushMinSpeedMps
      and (officerVehicleSpeedMps > (trafficYieldPushMinSpeedMps + 2.0) or isStoppedOrQueued)
    then
      local pushSpeed = math.max(trafficYieldPushMinSpeedMps + 2.5, math.min(driveSpeedMps, trafficYieldPushMinSpeedMps + 10.0))
      pcall(function()
        SetVehicleForwardSpeed(vehicle, pushSpeed + 0.0)
      end)
    end
  end

  trafficYieldAssistStates[vehicle] = {
    driver = driver,
    revert_at_ms = nowMs + trafficYieldResumeAfterMs,
    cooldown_until_ms = nowMs + trafficYieldCooldownMs,
    next_reapply_ms = nowMs + trafficYieldReapplyMs,
    resumed = false,
    resume_speed_mps = math.max(8.0, math.min(20.0, driveSpeedMps)),
  }
end

local function tickTrafficYieldRestore(nowMs)
  local hasActive = false
  for vehicle, entry in pairs(trafficYieldAssistStates) do
    local exists = (type(vehicle) == 'number' and vehicle ~= 0 and DoesEntityExist(vehicle))
    if not exists then
      if nowMs >= (tonumber(entry and entry.cooldown_until_ms) or 0) then
        trafficYieldAssistStates[vehicle] = nil
      else
        hasActive = true
      end
    else
      if type(entry) ~= 'table' then
        trafficYieldAssistStates[vehicle] = nil
      else
        if entry.resumed ~= true and nowMs >= (tonumber(entry.revert_at_ms) or 0) then
          local driver = entry.driver
          if trafficYieldResumeWander == true
            and driver and driver ~= 0 and DoesEntityExist(driver)
            and GetPedInVehicleSeat(vehicle, -1) == driver and not IsPedAPlayer(driver)
          then
            pcall(function()
              SetDriveTaskDrivingStyle(driver, trafficYieldDrivingStyle)
              SetPedKeepTask(driver, true)
              TaskVehicleDriveWander(driver, vehicle, (tonumber(entry.resume_speed_mps) or 12.0) + 0.0, trafficYieldDrivingStyle)
            end)
          end
          entry.resumed = true
        end

        if nowMs >= (tonumber(entry.cooldown_until_ms) or 0) then
          trafficYieldAssistStates[vehicle] = nil
        else
          hasActive = true
        end
      end
    end
  end
  return hasActive
end

local function loadPedModel(modelName)
  local modelHash = modelName
  if type(modelName) ~= 'number' then
    modelHash = GetHashKey(tostring(modelName or ''))
  end
  if not modelHash or modelHash == 0 or not IsModelInCdimage(modelHash) or not IsModelValid(modelHash) then
    return nil
  end
  RequestModel(modelHash)
  local waited = 0
  while not HasModelLoaded(modelHash) and waited < 5000 do
    Wait(25)
    waited = waited + 25
  end
  if not HasModelLoaded(modelHash) then return nil end
  return modelHash
end

local function resolveGroundZForPed(x, y, fallbackZ)
  local baseZ = tonumber(fallbackZ) or 0.0
  local probes = {
    baseZ + 1.0,
    baseZ + 4.0,
    baseZ + 10.0,
    baseZ + 25.0,
    baseZ + 50.0,
    baseZ + 100.0,
  }

  for _, probeZ in ipairs(probes) do
    local foundGround, groundZ = GetGroundZFor_3dCoord(x + 0.0, y + 0.0, probeZ + 0.0, false)
    if foundGround and type(groundZ) == 'number' then
      return groundZ
    end
  end

  return baseZ
end

local function requestPedSpawnCollision(x, y, z, timeoutMs)
  local px = (tonumber(x) or 0.0) + 0.0
  local py = (tonumber(y) or 0.0) + 0.0
  local pz = (tonumber(z) or 0.0) + 0.0
  local deadline = (tonumber(GetGameTimer() or 0) or 0) + math.max(250, math.floor(tonumber(timeoutMs) or 1500))
  repeat
    RequestCollisionAtCoord(px, py, pz)
    Wait(0)
  until (tonumber(GetGameTimer() or 0) or 0) >= deadline
end

local function placePedOnGroundProperly(entity, x, y, z, heading)
  if not entity or entity == 0 or not DoesEntityExist(entity) then
    return false, tonumber(z) or 0.0
  end

  local px = (tonumber(x) or 0.0) + 0.0
  local py = (tonumber(y) or 0.0) + 0.0
  local pz = (tonumber(z) or 0.0) + 0.0
  local h = (tonumber(heading) or 0.0) + 0.0

  SetEntityCoordsNoOffset(entity, px, py, pz + 1.0, false, false, false)
  SetEntityHeading(entity, h)
  requestPedSpawnCollision(px, py, pz, 1800)

  local deadline = (tonumber(GetGameTimer() or 0) or 0) + 2000
  while (tonumber(GetGameTimer() or 0) or 0) < deadline do
    if HasCollisionLoadedAroundEntity(entity) then break end
    RequestCollisionAtCoord(px, py, pz)
    Wait(0)
  end

  local placed = false
  for _ = 1, 3 do
    if type(PlaceEntityOnGroundProperly) == 'function' then
      local ok, result = pcall(function()
        return PlaceEntityOnGroundProperly(entity)
      end)
      placed = ok and (result == nil or result == true)
    end
    if not placed and type(SetPedOnGroundProperly) == 'function' then
      local ok, result = pcall(function()
        return SetPedOnGroundProperly(entity)
      end)
      placed = ok and (result == nil or result == true)
    end
    if placed then break end
    Wait(50)
  end

  local settledGroundZ = resolveGroundZForPed(px, py, pz)
  local entityCoords = GetEntityCoords(entity)
  local finalZ = tonumber(entityCoords and entityCoords.z) or settledGroundZ
  if (not placed) or finalZ < (settledGroundZ - 0.2) then
    finalZ = settledGroundZ + 0.08
    SetEntityCoordsNoOffset(entity, px, py, finalZ, false, false, false)
  end
  SetEntityHeading(entity, h)
  return placed, finalZ
end

local function spawnDocumentPed(pedConfig)
  if type(pedConfig) ~= 'table' or pedConfig.enabled == false then return end
  local coords = type(pedConfig.coords) == 'table' and pedConfig.coords or nil
  if not coords then return end
  local x = tonumber(coords.x) or 0.0
  local y = tonumber(coords.y) or 0.0
  local z = tonumber(coords.z) or 0.0
  local w = tonumber(coords.w) or 0.0
  requestPedSpawnCollision(x, y, z, 1800)
  local configuredZ = z + 0.0
  local spawnZ = configuredZ

  local modelHash = loadPedModel(pedConfig.model or '')
  if not modelHash then
    print(('[cad_bridge] Failed to load document ped model: %s'):format(tostring(pedConfig.model or '')))
    return
  end

  local entity = CreatePed(4, modelHash, x, y, spawnZ + 1.0, w, false, true)
  if not entity or entity == 0 or not DoesEntityExist(entity) then
    print(('[cad_bridge] Failed to create document ped for id=%s'):format(tostring(pedConfig.id or 'unknown')))
    SetModelAsNoLongerNeeded(modelHash)
    return
  end
  SetEntityAsMissionEntity(entity, true, true)

  local _, groundedZ = placePedOnGroundProperly(entity, x, y, spawnZ, w)
  if type(groundedZ) == 'number' then spawnZ = groundedZ end
  local minAllowedZ = configuredZ - 0.02
  if spawnZ < minAllowedZ then
    spawnZ = configuredZ
    SetEntityCoordsNoOffset(entity, x + 0.0, y + 0.0, spawnZ, false, false, false)
    SetEntityHeading(entity, w + 0.0)
  end

  SetEntityInvincible(entity, true)
  SetBlockingOfNonTemporaryEvents(entity, true)
  SetPedCanRagdoll(entity, false)
  SetPedCanPlayAmbientAnims(entity, false)
  SetPedCanPlayAmbientBaseAnims(entity, false)

  local scenario = trim(pedConfig.scenario or '')
  local forceStanding = pedConfig.force_standing == true
  local appliedScenario = false
  if scenario ~= '' and not forceStanding then
    TaskStartScenarioInPlace(entity, scenario, 0, true)
    Wait(75)
    local afterScenarioCoords = GetEntityCoords(entity)
    local afterScenarioZ = tonumber(afterScenarioCoords and afterScenarioCoords.z) or spawnZ
    if afterScenarioZ < minAllowedZ then
      SetEntityCoordsNoOffset(entity, x + 0.0, y + 0.0, spawnZ, false, false, false)
      SetEntityHeading(entity, w + 0.0)
    end
    appliedScenario = true
  end

  if not appliedScenario then
    ClearPedTasksImmediately(entity)
    TaskStandStill(entity, -1)
    SetEntityHeading(entity, w + 0.0)
  end
  FreezeEntityPosition(entity, true)

  SetModelAsNoLongerNeeded(modelHash)
  documentPeds[#documentPeds + 1] = {
    id = trim(pedConfig.id or ''),
    entity = entity,
    x = x,
    y = y,
    z = spawnZ,
    licenseLabel = trim(pedConfig.license_label or ''),
    registrationLabel = trim(pedConfig.registration_label or ''),
    allowsLicense = pedConfig.allows_license == true,
    allowsRegistration = pedConfig.allows_registration == true,
  }
end

local function deleteDocumentPeds()
  for i = 1, #documentPeds do
    local pedData = documentPeds[i]
    if type(pedData) == 'table' then
      local entity = pedData.entity
      if useOxTargetForDocuments and entity and entity ~= 0 then
        pcall(function()
          exports.ox_target:removeLocalEntity(entity)
        end)
      end
      if entity and entity ~= 0 and DoesEntityExist(entity) then
        DeletePed(entity)
      end
    end
  end
  documentPedTargetEntities = {}
  documentPeds = {}
end

local function clearDocumentPedBlips()
  for i = 1, #documentPedBlips do
    local blip = documentPedBlips[i]
    if blip and DoesBlipExist(blip) then
      RemoveBlip(blip)
    end
  end
  documentPedBlips = {}
end

local function createDocumentPedBlip(pedConfig)
  if type(pedConfig) ~= 'table' then return end
  if pedConfig.allows_registration ~= true and pedConfig.allows_license ~= true then return end
  local coords = type(pedConfig.coords) == 'table' and pedConfig.coords or nil
  if not coords then return end
  local x = tonumber(coords.x) or 0.0
  local y = tonumber(coords.y) or 0.0
  local z = tonumber(coords.z) or 0.0

  local blip = AddBlipForCoord(x, y, z)
  SetBlipSprite(blip, 525)
  SetBlipDisplay(blip, 4)
  SetBlipScale(blip, 0.8)
  SetBlipAsShortRange(blip, true)
  SetBlipColour(blip, 5)
  BeginTextCommandSetBlipName('STRING')
  AddTextComponentString('VicRoads')
  EndTextCommandSetBlipName(blip)
  documentPedBlips[#documentPedBlips + 1] = blip
end

local function registerDocumentPedTarget(pedData)
  if not useOxTargetForDocuments then return end
  if type(pedData) ~= 'table' then return end
  local entity = pedData.entity
  if not entity or entity == 0 then return end

  local options = {}
  if pedData.allowsLicense then
    options[#options + 1] = {
      name = ('cad_bridge_license_%s'):format(trim(pedData.id or tostring(entity))),
      icon = 'fa-solid fa-id-card',
      label = 'Driver License',
      distance = documentInteractionDistance,
      onSelect = function()
        local nowMs = tonumber(GetGameTimer() or 0) or 0
        if (nowMs - tonumber(state.lastDocumentInteractAt or 0)) < 750 then return end
        state.lastDocumentInteractAt = nowMs
        TriggerServerEvent('cad_bridge:requestDriverLicensePrompt', pedData.id)
      end,
    }
  end
  if pedData.allowsRegistration then
    options[#options + 1] = {
      name = ('cad_bridge_registration_%s'):format(trim(pedData.id or tostring(entity))),
      icon = 'fa-solid fa-car',
      label = 'Registration',
      distance = documentInteractionDistance,
      onSelect = function()
        local nowMs = tonumber(GetGameTimer() or 0) or 0
        if (nowMs - tonumber(state.lastDocumentInteractAt or 0)) < 750 then return end
        state.lastDocumentInteractAt = nowMs
        TriggerServerEvent('cad_bridge:requestVehicleRegistrationPrompt', pedData.id)
      end,
    }
  end
  if #options == 0 then return end

  local ok, err = pcall(function()
    exports.ox_target:addLocalEntity(entity, options)
  end)
  if not ok then
    print(('[cad_bridge] Failed to register ox_target options for document ped %s: %s'):format(
      tostring(pedData.id or entity), tostring(err)
    ))
    return
  end
  documentPedTargetEntities[#documentPedTargetEntities + 1] = entity
end

local function drawDocumentHelpText(label)
  BeginTextCommandDisplayHelp('STRING')
  AddTextComponentSubstringPlayerName(tostring(label or 'Press ~INPUT_CONTEXT~ to interact'))
  EndTextCommandDisplayHelp(0, false, false, -1)
end

CreateThread(function()
  Wait(1000)
  clearDocumentPedBlips()
  local interactionPeds = Config.DocumentInteractionPeds or {}
  if type(interactionPeds) ~= 'table' or #interactionPeds == 0 then
    interactionPeds = {
      {
        id = 'license',
        enabled = (Config.DriverLicensePed and Config.DriverLicensePed.enabled == true),
        model = Config.DriverLicensePed and Config.DriverLicensePed.model or '',
        coords = Config.DriverLicensePed and Config.DriverLicensePed.coords or nil,
        scenario = Config.DriverLicensePed and Config.DriverLicensePed.scenario or '',
        allows_license = true,
        allows_registration = false,
      },
      {
        id = 'registration',
        enabled = (Config.VehicleRegistrationPed and Config.VehicleRegistrationPed.enabled == true),
        model = Config.VehicleRegistrationPed and Config.VehicleRegistrationPed.model or '',
        coords = Config.VehicleRegistrationPed and Config.VehicleRegistrationPed.coords or nil,
        scenario = Config.VehicleRegistrationPed and Config.VehicleRegistrationPed.scenario or '',
        allows_license = false,
        allows_registration = true,
      },
    }
  end

  for _, pedConfig in ipairs(interactionPeds) do
    spawnDocumentPed(pedConfig)
    createDocumentPedBlip(pedConfig)
    if #documentPeds > 0 then
      registerDocumentPedTarget(documentPeds[#documentPeds])
    end
  end
end)

CreateThread(function()
  if useOxTargetForDocuments then
    return
  end

  while true do
    local waitMs = 500
    local playerPed = PlayerPedId()
    if playerPed and playerPed ~= 0 then
      local playerCoords = GetEntityCoords(playerPed)
      for _, pedData in ipairs(documentPeds) do
        local entity = pedData and pedData.entity or 0
        if entity ~= 0 and DoesEntityExist(entity) then
          local dx = (tonumber(playerCoords.x) or 0.0) - (tonumber(pedData.x) or 0.0)
          local dy = (tonumber(playerCoords.y) or 0.0) - (tonumber(pedData.y) or 0.0)
          local dz = (tonumber(playerCoords.z) or 0.0) - (tonumber(pedData.z) or 0.0)
          local distance = math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          if distance <= documentPromptDistance then
            waitMs = 0
            local promptText = ''
            if pedData.allowsLicense and pedData.allowsRegistration then
              promptText = 'Press ~INPUT_CONTEXT~ for licence quiz | Press ~INPUT_DETONATE~ for rego'
            elseif pedData.allowsLicense then
              promptText = pedData.licenseLabel ~= '' and pedData.licenseLabel or 'Press ~INPUT_CONTEXT~ for licence quiz'
            elseif pedData.allowsRegistration then
              promptText = pedData.registrationLabel ~= '' and pedData.registrationLabel or 'Press ~INPUT_CONTEXT~ for rego'
            else
              promptText = 'Document desk unavailable'
            end
            drawDocumentHelpText(promptText)

            if distance <= documentInteractionDistance and (IsControlJustPressed(0, 38) or IsControlJustPressed(0, 47)) then
              local nowMs = tonumber(GetGameTimer() or 0) or 0
              if (nowMs - tonumber(state.lastDocumentInteractAt or 0)) >= 1000 then
                state.lastDocumentInteractAt = nowMs
                local useLicense = IsControlJustPressed(0, 38)
                local useRegistration = IsControlJustPressed(0, 47)
                if pedData.allowsLicense and pedData.allowsRegistration then
                  if useRegistration then
                    TriggerServerEvent('cad_bridge:requestVehicleRegistrationPrompt', pedData.id)
                  else
                    TriggerServerEvent('cad_bridge:requestDriverLicensePrompt', pedData.id)
                  end
                elseif pedData.allowsLicense and useLicense then
                  TriggerServerEvent('cad_bridge:requestDriverLicensePrompt', pedData.id)
                elseif pedData.allowsRegistration and useLicense then
                  TriggerServerEvent('cad_bridge:requestVehicleRegistrationPrompt', pedData.id)
                end
              end
            end
          end
        end
      end
    end
    Wait(waitMs)
  end
end)

AddEventHandler('onResourceStop', function(resourceName)
  if resourceName ~= GetCurrentResourceName() then return end
  clearDocumentPedBlips()
  deleteDocumentPeds()
end)

CreateThread(function()
  if not trafficYieldAssistEnabled then
    return
  end

  while true do
    local nowMs = tonumber(GetGameTimer() or 0) or 0
    local activeStates = tickTrafficYieldRestore(nowMs)
    Wait(activeStates and 250 or 1000)
  end
end)

CreateThread(function()
  if not trafficYieldAssistEnabled then
    return
  end

  while true do
    local waitMs = 1000
    local playerPed = PlayerPedId()
    if playerPed and playerPed ~= 0 and IsPedInAnyVehicle(playerPed, false) then
      local playerVehicle = GetVehiclePedIsIn(playerPed, false)
      if playerVehicle and playerVehicle ~= 0 and GetPedInVehicleSeat(playerVehicle, -1) == playerPed then
        local officerSpeedMps = tonumber(GetEntitySpeed(playerVehicle)) or 0.0
        if isEmergencyResponseVehicle(playerVehicle) and isVehicleSirenActive(playerVehicle) and officerSpeedMps >= trafficYieldMinOfficerSpeedMps then
          waitMs = trafficYieldPollIntervalMs
          local playerCoords = GetEntityCoords(playerVehicle)
          local playerForward = GetEntityForwardVector(playerVehicle)
          local playerRight = GetEntityRightVector(playerVehicle)
          local nowMs = tonumber(GetGameTimer() or 0) or 0

          local candidates = {}
          local vehicles = GetGamePool('CVehicle') or {}
          for _, vehicle in ipairs(vehicles) do
            local target = shouldAffectTrafficVehicle(vehicle, playerVehicle, playerCoords, playerForward, playerRight, nowMs)
            if target then
              candidates[#candidates + 1] = target
            end
          end

          if #candidates > 1 then
            table.sort(candidates, function(a, b)
              local aForward = tonumber(a and a.forward_distance) or 999999.0
              local bForward = tonumber(b and b.forward_distance) or 999999.0
              if math.abs(aForward - bForward) > 0.001 then
                return aForward < bForward
              end
              local aLateral = math.abs(tonumber(a and a.lateral_distance) or 999999.0)
              local bLateral = math.abs(tonumber(b and b.lateral_distance) or 999999.0)
              return aLateral < bLateral
            end)
          end

          local applied = 0
          for i = 1, #candidates do
            applyTrafficYieldAssist(candidates[i], officerSpeedMps, nowMs)
            applied = applied + 1
            if applied >= trafficYieldMaxTargetsPerPulse then
              break
            end
          end
        end
      end
    end
    Wait(waitMs)
  end
end)

CreateThread(function()
  while true do
    Wait(math.max(250, tonumber(Config.HeartbeatIntervalMs) or 500))

    local ped = PlayerPedId()
    if ped and ped ~= 0 then
      local coords = GetEntityCoords(ped)
      local heading = GetEntityHeading(ped)
      local speed = GetEntitySpeed(ped)
      local streetHash, crossingHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
      local postal = type(util.getNearestPostal) == 'function' and util.getNearestPostal() or ''
      local street, crossing = '', ''
      if streetHash and streetHash ~= 0 then
        street = GetStreetNameFromHashKey(streetHash) or ''
      end
      if crossingHash and crossingHash ~= 0 then
        crossing = GetStreetNameFromHashKey(crossingHash) or ''
      end
      local vehicleSnapshot = type(util.getVehicleSnapshot) == 'function' and util.getVehicleSnapshot(ped) or {
        vehicle = '',
        license_plate = '',
        has_siren_enabled = false,
        icon = 6,
      }
      local weapon = type(util.getWeaponName) == 'function' and util.getWeaponName(ped) or ''
      local location = type(util.buildLocationText) == 'function'
        and util.buildLocationText(street, crossing, postal, coords)
        or tostring(street or '')
      TriggerServerEvent('cad_bridge:clientPosition', {
        x = coords.x,
        y = coords.y,
        z = coords.z,
        heading = heading,
        speed = speed,
        street = street,
        crossing = crossing,
        postal = postal,
        location = location,
        vehicle = vehicleSnapshot.vehicle,
        license_plate = vehicleSnapshot.license_plate,
        has_siren_enabled = vehicleSnapshot.has_siren_enabled,
        icon = vehicleSnapshot.icon,
        weapon = weapon,
      })
    end
  end
end)
