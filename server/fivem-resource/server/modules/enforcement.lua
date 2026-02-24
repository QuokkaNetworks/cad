if Config.EnableDocumentCommands == true then
  RegisterCommand(trim(Config.DriverLicenseCommand or 'cadlicense'), function(src, _args)
    openDriverLicensePromptForSource(src)
  end, false)

  RegisterCommand(trim(Config.VehicleRegistrationCommand or 'cadrego'), function(src, _args)
    openVehicleRegistrationPromptForSource(src)
  end, false)
end

local TRAFFIC_STOP_BRIDGE_BACKOFF_SCOPE = 'traffic_stops'

local function buildTrafficStopCommandPrefill(src, args)
  local s = tonumber(src) or 0
  local raw = trim(table.concat(args or {}, ' '))
  local pos = PlayerPositions[s]
  local defaults = {
    plate = trim(pos and pos.license_plate or ''),
    location = trim(pos and pos.location or ''),
    street = trim(pos and pos.street or ''),
    crossing = trim(pos and pos.crossing or ''),
    postal = trim(pos and pos.postal or ''),
    reason = '',
    outcome = '',
    notes = '',
  }

  if raw == '' then
    return defaults
  end

  if raw:find('|', 1, true) then
    local parts = splitByPipe(raw)
    local p1 = trim(parts[1] or '')
    local p2 = trim(parts[2] or '')
    local p3 = trim(parts[3] or '')
    local p4 = trim(parts[4] or '')

    if p2 ~= '' then
      if p1 ~= '' then defaults.plate = p1 end
      defaults.reason = p2
      defaults.outcome = p3
      defaults.notes = p4
      return defaults
    end

    -- If only one pipe-delimited part was supplied, treat it as a reason prefill.
    defaults.reason = p1
    defaults.outcome = p2
    defaults.notes = p3
    return defaults
  end

  local count = type(args) == 'table' and #args or 0
  if count >= 2 then
    defaults.plate = trim(args[1] or '') ~= '' and trim(args[1] or '') or defaults.plate
    defaults.reason = trim(table.concat(args, ' ', 2))
  else
    defaults.reason = raw
  end

  return defaults
end

local function submitTrafficStopFields(src, fields, sourceType)
  local s = tonumber(src) or 0
  if s <= 0 then return end

  local normalizedFields = type(fields) == 'table' and fields or {}
  local reason = trim(normalizedFields.reason or '')
  if reason == '' then
    notifyPlayer(s, 'Traffic stop reason is required.')
    return
  end

  if isBridgeBackoffActive(TRAFFIC_STOP_BRIDGE_BACKOFF_SCOPE) then
    notifyPlayer(s, 'CAD bridge is temporarily rate-limited for traffic stops. Try again in a few seconds.')
    return
  end

  local characterName = trim(getCharacterDisplayName(s) or '')
  local platformName = trim(GetPlayerName(s) or '')
  local pos = PlayerPositions[s]
  local payload = {
    source = s,
    identifiers = GetPlayerIdentifiers(s),
    player_name = characterName ~= '' and characterName or platformName,
    platform_name = platformName,
    character_name = characterName,
    source_type = trim(sourceType or 'trafficstop_command') ~= '' and trim(sourceType or 'trafficstop_command') or 'trafficstop_command',
    plate = trim(normalizedFields.plate or ''),
    location = trim(normalizedFields.location or ''),
    street = trim(normalizedFields.street or ''),
    crossing = trim(normalizedFields.crossing or ''),
    postal = trim(normalizedFields.postal or ''),
    reason = reason,
    outcome = trim(normalizedFields.outcome or ''),
    notes = trim(normalizedFields.notes or ''),
  }

  if type(pos) == 'table' then
    payload.position = {
      x = tonumber(pos.x) or 0.0,
      y = tonumber(pos.y) or 0.0,
      z = tonumber(pos.z) or 0.0,
    }
    payload.heading = tonumber(pos.heading) or 0.0
    payload.speed = tonumber(pos.speed) or 0.0
    if trim(payload.street) == '' then payload.street = tostring(pos.street or '') end
    if trim(payload.crossing) == '' then payload.crossing = tostring(pos.crossing or '') end
    if trim(payload.postal) == '' then payload.postal = tostring(pos.postal or '') end
    if trim(payload.location) == '' then payload.location = tostring(pos.location or '') end
    if trim(payload.plate) == '' then
      payload.plate = trim(pos.license_plate or '')
    end
  end

  request('POST', '/api/integration/fivem/traffic-stops', payload, function(status, body, responseHeaders)
    if status >= 200 and status < 300 then
      local stopId = '?'
      local okDecode, parsed = pcall(json.decode, body or '{}')
      if okDecode and type(parsed) == 'table' and type(parsed.stop) == 'table' and parsed.stop.id then
        stopId = tostring(parsed.stop.id)
      end
      local plateSuffix = trim(payload.plate) ~= '' and (' | Plate ' .. trim(payload.plate)) or ''
      notifyPlayer(s, ('Traffic stop logged in CAD (#%s)%s'):format(stopId, plateSuffix))
      return
    end

    if status == 429 then
      setBridgeBackoff(TRAFFIC_STOP_BRIDGE_BACKOFF_SCOPE, responseHeaders, 15000, 'traffic stop command')
    end

    local errMessage = ('Failed to log traffic stop (HTTP %s)'):format(tostring(status))
    local okDecode, parsed = pcall(json.decode, body or '{}')
    if okDecode and type(parsed) == 'table' and parsed.error then
      errMessage = errMessage .. ': ' .. tostring(parsed.error)
    end
    notifyPlayer(s, errMessage)
  end)
end

local function openTrafficStopPromptForSource(src, args, commandLabel)
  local s = tonumber(src) or 0
  if s <= 0 then return end

  local prefill = buildTrafficStopCommandPrefill(s, args or {})
  prefill.command = trim(commandLabel or 'trafficstop')
  prefill.source = 'trafficstop_command'

  TriggerClientEvent('cad_bridge:promptTrafficStop', s, prefill)
end

RegisterCommand('trafficstop', function(src, args)
  openTrafficStopPromptForSource(src, args, 'trafficstop')
end, false)

RegisterCommand('ts', function(src, args)
  openTrafficStopPromptForSource(src, args, 'ts')
end, false)

RegisterNetEvent('cad_bridge:submitTrafficStopPrompt', function(payload)
  local src = tonumber(source) or 0
  if src <= 0 then return end

  local data = type(payload) == 'table' and payload or {}
  submitTrafficStopFields(src, {
    plate = data.plate or data.license_plate,
    location = data.location,
    street = data.street,
    crossing = data.crossing,
    postal = data.postal,
    reason = data.reason,
    outcome = data.outcome,
    notes = data.notes,
  }, 'trafficstop_prompt')
end)

local DISCORD_JOB_ROLE_SYNC_BRIDGE_BACKOFF_SCOPE = 'discord_job_role_sync'
local lastDiscordJobRoleSyncAtMsBySource = {}
local lastDiscordJobRoleSyncSignatureBySource = {}

local function normalizeJobGradeValue(value)
  if type(value) == 'table' then
    value = value.level or value.grade or value.value or value.rank
  end
  local numeric = tonumber(value)
  if not numeric then return 0 end
  return math.max(0, math.floor(numeric))
end

local function extractJobNameAndGrade(jobData)
  if type(jobData) ~= 'table' then
    return '', 0
  end

  local jobName = trim(jobData.name or jobData.job or jobData.id or jobData.label or '')
  local jobGrade = normalizeJobGradeValue(jobData.grade)
  if jobData.grade == nil then
    if jobData.grade_level ~= nil then
      jobGrade = normalizeJobGradeValue(jobData.grade_level)
    elseif jobData.rank ~= nil then
      jobGrade = normalizeJobGradeValue(jobData.rank)
    end
  end

  return jobName, jobGrade
end

local function notifyDiscordJobRoleSyncForSource(sourceId, jobData, triggerName)
  local src = tonumber(sourceId) or 0
  if src <= 0 and type(jobData) == 'table' then
    src = tonumber(jobData.source or jobData.source_id or jobData.src or jobData.playerId or jobData.player_id) or 0
  end
  if src <= 0 then return end
  if not GetPlayerName(src) then return end
  if not hasBridgeConfig() then return end
  if isBridgeBackoffActive(DISCORD_JOB_ROLE_SYNC_BRIDGE_BACKOFF_SCOPE) then return end

  local citizenId = trim(getCitizenId(src) or '')
  if citizenId == '' then return end

  local jobName, jobGrade = extractJobNameAndGrade(jobData)
  local signature = table.concat({
    tostring(src),
    citizenId,
    trim(jobName):lower(),
    tostring(jobGrade),
    trim(triggerName or 'job_update'):lower(),
  }, '|')
  local now = nowMs()
  local lastAt = tonumber(lastDiscordJobRoleSyncAtMsBySource[src] or 0) or 0
  local lastSig = tostring(lastDiscordJobRoleSyncSignatureBySource[src] or '')
  if signature == lastSig and (now - lastAt) < 1500 then
    return
  end
  lastDiscordJobRoleSyncAtMsBySource[src] = now
  lastDiscordJobRoleSyncSignatureBySource[src] = signature

  local characterName = trim(getCharacterDisplayName(src) or '')
  local platformName = trim(GetPlayerName(src) or '')
  local payload = {
    source = src,
    identifiers = GetPlayerIdentifiers(src),
    citizenid = citizenId,
    player_name = characterName ~= '' and characterName or platformName,
    platform_name = platformName,
    character_name = characterName,
    job_name = jobName,
    job_grade = jobGrade,
    trigger = trim(triggerName or 'job_update'),
  }

  request('POST', '/api/integration/fivem/discord/job-role-sync', payload, function(status, body, responseHeaders)
    if status == 429 then
      setBridgeBackoff(DISCORD_JOB_ROLE_SYNC_BRIDGE_BACKOFF_SCOPE, responseHeaders, 10000, 'discord job role sync')
      return
    end
    if status == 0 then
      setBridgeBackoff(DISCORD_JOB_ROLE_SYNC_BRIDGE_BACKOFF_SCOPE, responseHeaders, 3000, 'discord job role sync transport')
      return
    end
    if status >= 500 then
      setBridgeBackoff(DISCORD_JOB_ROLE_SYNC_BRIDGE_BACKOFF_SCOPE, responseHeaders, 5000, 'discord job role sync server error')
      return
    end

    if status >= 400 then
      local okDecode, parsed = pcall(json.decode, body or '{}')
      local errSuffix = ''
      if okDecode and type(parsed) == 'table' and parsed.error then
        errSuffix = ': ' .. tostring(parsed.error)
      end
      print(('[cad_bridge] discord job role sync trigger failed (HTTP %s)%s'):format(tostring(status), errSuffix))
    end
  end)
end

RegisterNetEvent('cad_bridge:syncDiscordJobRoles', function(jobData, triggerName)
  notifyDiscordJobRoleSyncForSource(source, jobData, triggerName or 'manual_event')
end)

AddEventHandler('QBCore:Server:OnJobUpdate', function(jobData)
  notifyDiscordJobRoleSyncForSource(source, jobData, 'qbcore_job_update')
end)

AddEventHandler('qbx_core:server:onJobUpdate', function(jobData)
  notifyDiscordJobRoleSyncForSource(source, jobData, 'qbx_job_update')
end)

AddEventHandler('qbx_core:server:jobUpdated', function(jobData)
  notifyDiscordJobRoleSyncForSource(source, jobData, 'qbx_job_updated')
end)

local heartbeatInFlight = false
local heartbeatInFlightSinceMs = 0
local pollFineJobs = nil
local pollPrintJobs = nil
local pollJailJobs = nil
local lastFastEnforcementPollMs = 0

local function getServerPedPositionSnapshot(sourceId)
  local s = tonumber(sourceId) or 0
  if s <= 0 then return nil end
  local ped = GetPlayerPed(s)
  if not ped or ped <= 0 then return nil end
  local coords = GetEntityCoords(ped)
  if not coords then return nil end
  return {
    x = tonumber(coords.x) or 0.0,
    y = tonumber(coords.y) or 0.0,
    z = tonumber(coords.z) or 0.0,
    heading = tonumber(GetEntityHeading(ped)) or 0.0,
    speed = tonumber(GetEntitySpeed(ped)) or 0.0,
  }
end

local function triggerFastEnforcementPoll()
  local now = nowMs()
  if (now - lastFastEnforcementPollMs) < 800 then
    return
  end
  lastFastEnforcementPollMs = now
  if pollFineJobs then
    pollFineJobs()
  end
  if pollPrintJobs then
    pollPrintJobs()
  end
  if pollJailJobs then
    pollJailJobs()
  end
end

local function resetHeartbeatInFlight(reason)
  heartbeatInFlight = false
  heartbeatInFlightSinceMs = 0
  if reason and reason ~= '' then
    print(('[cad_bridge] heartbeat in-flight reset (%s)'):format(tostring(reason)))
  end
end

local function clearStuckHeartbeatIfNeeded()
  if not heartbeatInFlight then return false end
  local timeoutMs = math.max(10000, math.floor((tonumber(Config.HeartbeatIntervalMs) or 500) * 8))
  if heartbeatInFlightSinceMs <= 0 then
    heartbeatInFlightSinceMs = nowMs()
    return false
  end
  local elapsed = nowMs() - heartbeatInFlightSinceMs
  if elapsed < timeoutMs then
    return false
  end
  resetHeartbeatInFlight(('watchdog timeout after %sms'):format(math.floor(elapsed)))
  setBridgeBackoff('heartbeat', nil, 3000, 'heartbeat watchdog')
  return true
end

CreateThread(function()
  while true do
    Wait(math.max(250, tonumber(Config.HeartbeatIntervalMs) or 500))
    if not hasBridgeConfig() then
      goto continue
    end
    if heartbeatInFlight and not clearStuckHeartbeatIfNeeded() then
      goto continue
    end
    if isBridgeBackoffActive('heartbeat') then
      goto continue
    end

    local payloadPlayers = {}
    for _, src in ipairs(GetPlayers()) do
      local s = tonumber(src)
      if s then
        local identifiers = GetPlayerIdentifiers(s)
        if Config.PublishAllPlayers or hasTrackedIdentifier(identifiers) then
          local pos = PlayerPositions[s]
          local fallbackSnapshot = getServerPedPositionSnapshot(s)
          if fallbackSnapshot and (type(pos) ~= 'table' or ((tonumber(pos.x) or 0.0) == 0.0 and (tonumber(pos.y) or 0.0) == 0.0)) then
            if type(pos) ~= 'table' then pos = {} end
            pos.x = fallbackSnapshot.x
            pos.y = fallbackSnapshot.y
            pos.z = fallbackSnapshot.z
            pos.heading = fallbackSnapshot.heading
            pos.speed = fallbackSnapshot.speed
            PlayerPositions[s] = pos
          end
          if type(pos) ~= 'table' then
            pos = {
              x = 0.0,
              y = 0.0,
              z = 0.0,
              heading = 0.0,
              speed = 0.0,
              street = '',
              crossing = '',
              postal = '',
              location = '',
              vehicle = '',
              license_plate = '',
              has_siren_enabled = false,
              icon = 6,
              weapon = '',
            }
          end
          local platformName = trim(GetPlayerName(s) or '')
          local characterName = getCharacterDisplayName(s)
          local displayName = platformName ~= '' and platformName or characterName

          payloadPlayers[#payloadPlayers + 1] = {
            source = s,
            player_id = s,
            playerId = s,
            name = displayName,
            player_name = displayName,
            platform_name = platformName,
            character_name = characterName,
            identifiers = identifiers,
            citizenid = getCitizenId(s),
            position = {
              x = pos.x,
              y = pos.y,
              z = pos.z,
            },
            pos = {
              x = pos.x,
              y = pos.y,
              z = pos.z,
            },
            heading = pos.heading,
            speed = pos.speed,
            street = pos.street,
            crossing = pos.crossing,
            postal = pos.postal,
            location = pos.location,
            vehicle = pos.vehicle,
            license_plate = pos.license_plate,
            licensePlate = pos.license_plate,
            has_siren_enabled = pos.has_siren_enabled,
            hasSirenEnabled = pos.has_siren_enabled,
            icon = pos.icon,
            weapon = pos.weapon,
          }
        end
      end
    end

    heartbeatInFlight = true
    heartbeatInFlightSinceMs = nowMs()
    request('POST', '/api/integration/fivem/heartbeat', {
      players = payloadPlayers,
      timestamp = os.time(),
    }, function(status, _body, responseHeaders)
      resetHeartbeatInFlight('')
      if status == 429 then
        setBridgeBackoff('heartbeat', responseHeaders, 15000, 'heartbeat')
        return
      end
      if status == 0 then
        setBridgeBackoff('heartbeat', responseHeaders, 3000, 'heartbeat transport')
        print('[cad_bridge] heartbeat transport failed (status 0)')
        return
      end
      if status >= 400 then
        if status >= 500 then
          setBridgeBackoff('heartbeat', responseHeaders, 5000, 'heartbeat error')
        end
        print(('[cad_bridge] heartbeat failed with status %s'):format(tostring(status)))
        return
      end

      if status >= 200 and status < 300 then
        -- Nudge enforcement queues so record-created fines/jails apply quickly.
        triggerFastEnforcementPoll()
      end
    end)

    ::continue::
  end
end)

local autoAmbulanceCallStateBySource = {}
local autoAmbulanceDeathSnapshotBySource = {}
local lastAutoAmbulanceMissingResourceLogAtMs = 0
local lastAutoAmbulanceSnapshotLogAtMs = 0
local lastAutoAmbulanceNoParamedicsLogAtMs = 0
local AUTO_AMBULANCE_DEATH_STATE_STALE_MS = 30000

local function toBoolean(value)
  if value == true then return true end
  local numeric = tonumber(value)
  if numeric and numeric ~= 0 then return true end
  local text = trim(value):lower()
  return text == 'true' or text == 'yes'
end

local function parseWasabiDeadResult(value)
  if type(value) == 'table' then
    if value.isDead ~= nil then return toBoolean(value.isDead) end
    if value.dead ~= nil then return toBoolean(value.dead) end
    if value.value ~= nil then return toBoolean(value.value) end

    local status = trim(value.status or value.state or '')
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

local function isPlayerAliveByHealthFallback(sourceId)
  local s = tonumber(sourceId) or 0
  if s <= 0 then return false end
  local ped = GetPlayerPed(s)
  if not ped or ped <= 0 then return false end

  local health = tonumber(GetEntityHealth(ped)) or 0
  local fatallyInjured = false
  if type(IsPedFatallyInjured) == 'function' then
    local ok, result = pcall(function()
      return IsPedFatallyInjured(ped)
    end)
    fatallyInjured = ok and (result == true)
  end

  return health > 101 and not fatallyInjured
end

RegisterNetEvent('cad_bridge:autoAmbulanceDeathState', function(payload)
  local src = tonumber(source) or 0
  if src <= 0 then return end

  local deadValue = payload
  local deathEpisode = 0
  local clientHealth = nil
  local clientFatallyInjured = nil
  if type(payload) == 'table' then
    if payload.is_dead ~= nil then
      deadValue = payload.is_dead
    elseif payload.dead ~= nil then
      deadValue = payload.dead
    elseif payload.status ~= nil then
      deadValue = payload.status
    end

    deathEpisode = math.max(0, math.floor(tonumber(payload.death_episode) or 0))
    if payload.ped_health ~= nil then
      clientHealth = tonumber(payload.ped_health)
    end
    if payload.fatally_injured ~= nil then
      clientFatallyInjured = payload.fatally_injured == true or tonumber(payload.fatally_injured) == 1
    end
  end

  local parsedDead = parseWasabiDeadResult(deadValue)
  if parsedDead == true then
    local clientAlive = (clientHealth ~= nil) and ((clientHealth or 0) > 101) and (clientFatallyInjured ~= true)
    if clientAlive or isPlayerAliveByHealthFallback(src) then
      parsedDead = false
    end
  end
  autoAmbulanceDeathSnapshotBySource[src] = {
    is_dead = parsedDead,
    death_episode = deathEpisode,
    ped_health = clientHealth,
    fatally_injured = clientFatallyInjured == true,
    updated_ms = nowMs(),
  }

  if parsedDead ~= true then
    local state = autoAmbulanceCallStateBySource[src]
    if type(state) == 'table' then
      -- Player is alive again: clear one-shot dead tracking so next death can notify immediately.
      state.dead_reported = false
      state.last_call_ms = 0
      state.last_attempt_ms = 0
      state.call_submit_in_flight = false
      state.call_submit_started_ms = 0
    end
  end
end)

local function isPlayerDeadFromWasabi(sourceId)
  if GetResourceState('wasabi_ambulance') ~= 'started' then
    return false
  end
  local s = tonumber(sourceId) or 0
  if s <= 0 then return false end

  local snapshot = autoAmbulanceDeathSnapshotBySource[s]
  if type(snapshot) == 'table' then
    local updatedMs = tonumber(snapshot.updated_ms) or 0
    if updatedMs > 0 and (nowMs() - updatedMs) <= AUTO_AMBULANCE_DEATH_STATE_STALE_MS then
      return snapshot.is_dead == true
    end
  end

  local now = nowMs()
  if (now - lastAutoAmbulanceSnapshotLogAtMs) >= 60000 then
    lastAutoAmbulanceSnapshotLogAtMs = now
    print(('[cad_bridge] Auto ambulance death snapshot stale/missing for source %s; awaiting client update')
      :format(tostring(s)))
  end
  TriggerClientEvent('cad_bridge:requestAutoAmbulanceDeathState', s)
  return false
end

local function submitAutoAmbulanceCall(sourceId, onResult)
  local function finish(ok, status, body)
    if type(onResult) ~= 'function' then return end
    local cbOk, cbErr = pcall(onResult, ok == true, tonumber(status) or 0, body)
    if not cbOk then
      print(('[cad_bridge] Auto ambulance callback error for source %s: %s')
        :format(tostring(sourceId), tostring(cbErr)))
    end
  end

  local s = tonumber(sourceId) or 0
  if s <= 0 then
    finish(false, 0, 'invalid_source')
    return false
  end
  if not GetPlayerName(s) then
    finish(false, 0, 'player_not_found')
    return false
  end
  if isBridgeBackoffActive('calls') then
    finish(false, 429, 'calls_backoff_active')
    local now = nowMs()
    if (now - lastAutoAmbulanceSnapshotLogAtMs) >= 60000 then
      lastAutoAmbulanceSnapshotLogAtMs = now
      print('[cad_bridge] Auto ambulance call skipped: CAD call endpoint currently in backoff')
    end
    return false
  end

  local characterName = trim(getCharacterDisplayName(s) or '')
  local platformName = trim(GetPlayerName(s) or '')
  local callerName = characterName ~= '' and characterName or platformName
  if callerName == '' then
    callerName = ('Player #%s'):format(tostring(s))
  end

  local payload = {
    source = s,
    player_name = callerName,
    platform_name = platformName,
    identifiers = GetPlayerIdentifiers(s),
    title = 'Medical Emergency',
    message = 'Automatic alert: player down and requiring ambulance assistance.',
    priority = trim(Config.AutoAmbulanceCallPriority or '1'),
    job_code = '000',
    source_type = 'auto_medical_down',
    requested_department_layout_type = 'paramedics',
  }
  if payload.priority == '' then
    payload.priority = '1'
  end

  local pos = PlayerPositions[s]
  if type(pos) == 'table' then
    payload.position = {
      x = tonumber(pos.x) or 0.0,
      y = tonumber(pos.y) or 0.0,
      z = tonumber(pos.z) or 0.0,
    }
    payload.heading = tonumber(pos.heading) or 0.0
    payload.speed = tonumber(pos.speed) or 0.0
    payload.street = tostring(pos.street or '')
    payload.crossing = tostring(pos.crossing or '')
    payload.postal = tostring(pos.postal or '')
    payload.location = tostring(pos.location or '')
  end

  request('POST', '/api/integration/fivem/calls', payload, function(status, body, responseHeaders)
    if status >= 200 and status < 300 then
      local callId = '?'
      local ok, parsed = pcall(json.decode, body or '{}')
      if ok and type(parsed) == 'table' and type(parsed.call) == 'table' and parsed.call.id then
        callId = tostring(parsed.call.id)
      end
      print(('[cad_bridge] Auto ambulance call created for %s (#%s) as CAD call #%s')
        :format(callerName, tostring(s), callId))
      finish(true, status, body)
      return
    end

    if status == 429 then
      setBridgeBackoff('calls', responseHeaders, 15000, 'auto ambulance call')
    end

    if status == 409 then
      local okParsed, parsed = pcall(json.decode, body or '{}')
      local code = trim(okParsed and type(parsed) == 'table' and parsed.code or '')
      if code == 'no_paramedics_online' then
        local now = nowMs()
        if (now - lastAutoAmbulanceNoParamedicsLogAtMs) >= 60000 then
          lastAutoAmbulanceNoParamedicsLogAtMs = now
          print('[cad_bridge] Auto ambulance call skipped: no on-duty paramedic units online')
        end
        finish(false, status, body)
        return
      end
    end

    local err = ('Auto ambulance call failed (HTTP %s)'):format(tostring(status))
    local ok, parsed = pcall(json.decode, body or '{}')
    if ok and type(parsed) == 'table' and parsed.error then
      err = err .. ': ' .. tostring(parsed.error)
    end
    print('[cad_bridge] ' .. err)
    finish(false, status, body)
  end)

  return true
end

local autoAlarmZonePlayerStateBySource = {}
local autoAlarmZoneLastTriggerAtByZoneId = {}
local autoAlarmZoneInFlightByZoneId = {}
local lastAutoAlarmLogAtMs = 0
local alarmZoneBuilderBySource = {}
local alarmZoneConfigPollInFlight = false
local runtimeAutoAlarmZonesHasOverride = false
local runtimeAutoAlarmZonesLoaded = false
local runtimeAutoAlarmZones = nil

local function getActiveAutoAlarmZones()
  if runtimeAutoAlarmZonesLoaded == true and runtimeAutoAlarmZonesHasOverride == true then
    return type(runtimeAutoAlarmZones) == 'table' and runtimeAutoAlarmZones or {}
  end
  return type(Config.AutoAlarmZones) == 'table' and Config.AutoAlarmZones or {}
end

local function pollAutoAlarmZonesConfig()
  if not hasBridgeConfig() then
    return
  end
  if alarmZoneConfigPollInFlight or isBridgeBackoffActive('alarm_zone_config') then
    return
  end

  alarmZoneConfigPollInFlight = true
  request('GET', '/api/integration/fivem/alarm-zones', nil, function(status, body, responseHeaders)
    alarmZoneConfigPollInFlight = false
    if status == 429 then
      setBridgeBackoff('alarm_zone_config', responseHeaders, 10000, 'alarm zone config poll')
      return
    end
    if status == 0 then
      setBridgeBackoff('alarm_zone_config', responseHeaders, 3000, 'alarm zone config transport')
      return
    end
    if status ~= 200 then
      if status >= 500 then
        setBridgeBackoff('alarm_zone_config', responseHeaders, 5000, 'alarm zone config error')
      end
      return
    end

    local ok, parsed = pcall(json.decode, body or '{}')
    if not ok or type(parsed) ~= 'table' then
      return
    end
    runtimeAutoAlarmZonesLoaded = true
    runtimeAutoAlarmZonesHasOverride = parsed.has_override == true
    runtimeAutoAlarmZones = type(parsed.zones) == 'table' and parsed.zones or {}
  end)
end

local function pointInPolygon2d(px, py, points)
  if not px or not py or type(points) ~= 'table' or #points < 3 then
    return false
  end
  local inside = false
  local j = #points
  for i = 1, #points do
    local pi = points[i]
    local pj = points[j]
    local xi = tonumber(pi and pi.x)
    local yi = tonumber(pi and pi.y)
    local xj = tonumber(pj and pj.x)
    local yj = tonumber(pj and pj.y)
    if xi and yi and xj and yj then
      local intersectsBand = ((yi > py) ~= (yj > py))
      local dy = (yj - yi)
      if intersectsBand and math.abs(dy) > 0.000001 then
        local xAtY = ((xj - xi) * (py - yi) / dy) + xi
        if px < xAtY then
          inside = not inside
        end
      end
    end
    j = i
  end
  return inside
end

local function alarmZonePassesZFilter(pos, zone)
  local pz = tonumber(pos and pos.z)
  local minZ = tonumber(zone and zone.min_z)
  local maxZ = tonumber(zone and zone.max_z)
  if (not minZ and not maxZ) or not pz then
    return true
  end
  if minZ and pz < minZ then return false end
  if maxZ and pz > maxZ then return false end
  return true
end

local function getAlarmBuilderPosition(sourceId)
  local s = tonumber(sourceId) or 0
  if s <= 0 then return nil end
  local pos = PlayerPositions[s]
  if type(pos) ~= 'table' then
    pos = getServerPedPositionSnapshot(s)
  end
  if type(pos) ~= 'table' then return nil end
  local x = tonumber(pos.x)
  local y = tonumber(pos.y)
  local z = tonumber(pos.z)
  if not x or not y then return nil end
  return {
    x = x + 0.0,
    y = y + 0.0,
    z = (z and (z + 0.0)) or 0.0,
    location = trim(pos.location or ''),
    postal = trim(pos.postal or ''),
    street = trim(pos.street or ''),
    crossing = trim(pos.crossing or ''),
  }
end

local function alarmZoneBuilderNotify(sourceId, message)
  local s = tonumber(sourceId) or 0
  local text = tostring(message or '')
  if s > 0 and notifyPlayer then
    pcall(function()
      notifyPlayer(s, text)
    end)
  end
  if s > 0 then
    print(('[cad_bridge] alarm zone builder (src %s): %s'):format(tostring(s), text))
  else
    print(('[cad_bridge] alarm zone builder: %s'):format(text))
  end
end

RegisterCommand('cadalarmzone', function(src, args)
  local s = tonumber(src) or 0
  if s <= 0 then
    print('[cad_bridge] /cadalarmzone must be run in-game.')
    return
  end

  local cmd = trim(args and args[1] or ''):lower()
  if cmd == '' or cmd == 'help' then
    alarmZoneBuilderNotify(s, 'Usage: /cadalarmzone pos | start | add | undo | clear | exportpoly <id> [label] | exportcircle <id> <radius> [label]')
    return
  end

  if cmd == 'pos' then
    local pos = getAlarmBuilderPosition(s)
    if not pos then
      alarmZoneBuilderNotify(s, 'No position available yet. Move a little and try again.')
      return
    end
    local pointJson = json.encode({
      x = tonumber(string.format('%.3f', pos.x)),
      y = tonumber(string.format('%.3f', pos.y)),
      z = tonumber(string.format('%.3f', pos.z)),
    })
    alarmZoneBuilderNotify(s, ('Current point JSON: %s'):format(tostring(pointJson)))
    return
  end

  if cmd == 'start' then
    alarmZoneBuilderBySource[s] = {
      points = {},
      started_at_ms = nowMs(),
    }
    alarmZoneBuilderNotify(s, 'Alarm polygon builder started. Use /cadalarmzone add to record points.')
    return
  end

  if cmd == 'clear' then
    alarmZoneBuilderBySource[s] = nil
    alarmZoneBuilderNotify(s, 'Alarm polygon builder cleared.')
    return
  end

  if cmd == 'add' then
    local pos = getAlarmBuilderPosition(s)
    if not pos then
      alarmZoneBuilderNotify(s, 'No position available yet. Move a little and try again.')
      return
    end
    local state = alarmZoneBuilderBySource[s]
    if type(state) ~= 'table' then
      state = { points = {}, started_at_ms = nowMs() }
      alarmZoneBuilderBySource[s] = state
    end
    state.points = type(state.points) == 'table' and state.points or {}
    state.points[#state.points + 1] = {
      x = tonumber(string.format('%.3f', pos.x)),
      y = tonumber(string.format('%.3f', pos.y)),
      z = tonumber(string.format('%.3f', pos.z)),
    }
    alarmZoneBuilderNotify(s, ('Added point %s (%.2f, %.2f, %.2f)'):format(#state.points, pos.x, pos.y, pos.z))
    return
  end

  if cmd == 'undo' then
    local state = alarmZoneBuilderBySource[s]
    local points = type(state) == 'table' and state.points or nil
    if type(points) ~= 'table' or #points == 0 then
      alarmZoneBuilderNotify(s, 'No points to remove.')
      return
    end
    table.remove(points, #points)
    alarmZoneBuilderNotify(s, ('Removed last point. %s point(s) remain.'):format(#points))
    return
  end

  if cmd == 'exportpoly' then
    local state = alarmZoneBuilderBySource[s]
    local points = type(state) == 'table' and state.points or nil
    if type(points) ~= 'table' or #points < 3 then
      alarmZoneBuilderNotify(s, 'Need at least 3 points. Use /cadalarmzone start then /cadalarmzone add.')
      return
    end
    local zoneId = trim(args and args[2] or '')
    if zoneId == '' then
      alarmZoneBuilderNotify(s, 'Usage: /cadalarmzone exportpoly <id> [label]')
      return
    end
    local label = trim(table.concat(args or {}, ' ', 3))
    local currentPos = getAlarmBuilderPosition(s)
    local zone = {
      id = zoneId,
      shape = 'polygon',
      label = label ~= '' and label or zoneId,
      location = label ~= '' and label or zoneId,
      priority = tostring(Config.AutoAlarmCallPriority or '2'),
      job_code = tostring(Config.AutoAlarmCallJobCode or 'ALARM'),
      min_z = currentPos and tonumber(string.format('%.3f', currentPos.z - 3.0)) or nil,
      max_z = currentPos and tonumber(string.format('%.3f', currentPos.z + 6.0)) or nil,
      points = points,
    }
    local out = json.encode(zone)
    alarmZoneBuilderNotify(s, ('Polygon zone JSON: %s'):format(tostring(out)))
    return
  end

  if cmd == 'exportcircle' then
    local zoneId = trim(args and args[2] or '')
    local radius = tonumber(args and args[3] or 0) or 0
    if zoneId == '' or radius <= 0 then
      alarmZoneBuilderNotify(s, 'Usage: /cadalarmzone exportcircle <id> <radius> [label]')
      return
    end
    local pos = getAlarmBuilderPosition(s)
    if not pos then
      alarmZoneBuilderNotify(s, 'No position available yet. Move a little and try again.')
      return
    end
    local label = trim(table.concat(args or {}, ' ', 4))
    local zone = {
      id = zoneId,
      shape = 'circle',
      label = label ~= '' and label or zoneId,
      location = label ~= '' and label or pos.location or zoneId,
      x = tonumber(string.format('%.3f', pos.x)),
      y = tonumber(string.format('%.3f', pos.y)),
      z = tonumber(string.format('%.3f', pos.z)),
      radius = tonumber(string.format('%.2f', radius)),
      postal = trim(pos.postal or ''),
      priority = tostring(Config.AutoAlarmCallPriority or '2'),
      job_code = tostring(Config.AutoAlarmCallJobCode or 'ALARM'),
    }
    local out = json.encode(zone)
    alarmZoneBuilderNotify(s, ('Circle zone JSON: %s'):format(tostring(out)))
    return
  end

  alarmZoneBuilderNotify(s, 'Unknown subcommand. Use /cadalarmzone help')
end, false)

local function isInsideAlarmZone(pos, zone)
  if type(pos) ~= 'table' or type(zone) ~= 'table' then return false end
  local px = tonumber(pos.x)
  local py = tonumber(pos.y)
  if not px or not py then return false end
  if not alarmZonePassesZFilter(pos, zone) then return false end

  local shape = trim(zone.shape or ''):lower()
  if shape == 'polygon' or (type(zone.points) == 'table' and #zone.points >= 3) then
    return pointInPolygon2d(px, py, zone.points)
  end

  local zx = tonumber(zone.x)
  local zy = tonumber(zone.y)
  local radius = tonumber(zone.radius) or 0.0
  if not zx or not zy or radius <= 0.0 then return false end
  local dx = px - zx
  local dy = py - zy
  return (dx * dx + dy * dy) <= (radius * radius)
end

local function formatAlarmZoneFallbackLocation(zone, pos)
  local label = trim(zone and (zone.location or zone.label or zone.id) or '')
  if label ~= '' then
    local postal = trim(zone and zone.postal or '')
    if postal ~= '' and not label:find('%(' .. postal .. '%)', 1, true) then
      return ('%s (%s)'):format(label, postal)
    end
    return label
  end
  if type(pos) ~= 'table' then return 'Unknown Location' end
  local x = tonumber(pos.x) or 0.0
  local y = tonumber(pos.y) or 0.0
  local z = tonumber(pos.z) or 0.0
  local postal = trim(pos.postal or '')
  local base = ('X:%.1f Y:%.1f Z:%.1f'):format(x, y, z)
  if postal ~= '' then
    return ('%s (%s)'):format(base, postal)
  end
  return base
end

local function submitAutoAlarmZoneCall(sourceId, zone, onResult)
  local function finish(ok, status, body)
    if type(onResult) ~= 'function' then return end
    local cbOk, cbErr = pcall(onResult, ok == true, tonumber(status) or 0, body)
    if not cbOk then
      print(('[cad_bridge] Auto alarm callback error for source %s: %s')
        :format(tostring(sourceId), tostring(cbErr)))
    end
  end

  local s = tonumber(sourceId) or 0
  if s <= 0 then
    finish(false, 0, 'invalid_source')
    return false
  end
  if not GetPlayerName(s) then
    finish(false, 0, 'player_not_found')
    return false
  end
  if not hasBridgeConfig() then
    finish(false, 0, 'bridge_not_configured')
    return false
  end
  if isBridgeBackoffActive('calls') then
    finish(false, 429, 'calls_backoff_active')
    return false
  end

  local pos = PlayerPositions[s]
  if type(pos) ~= 'table' then
    pos = getServerPedPositionSnapshot(s) or {}
  end

  local characterName = trim(getCharacterDisplayName(s) or '')
  local platformName = trim(GetPlayerName(s) or '')
  local callerName = characterName ~= '' and characterName or platformName
  if callerName == '' then
    callerName = ('Player #%s'):format(tostring(s))
  end

  local zoneLabel = trim(zone and (zone.label or zone.location or zone.id) or '')
  if zoneLabel == '' then zoneLabel = 'Unknown Alarm Location' end
  local location = trim(zone and zone.location or '')
  if location == '' then location = trim(pos and pos.location or '') end
  if location == '' then location = formatAlarmZoneFallbackLocation(zone, pos) end
  local zonePostal = trim(zone and zone.postal or '')
  if zonePostal ~= '' and location ~= '' and not location:find('%(' .. zonePostal .. '%)', 1, true) then
    location = ('%s (%s)'):format(location, zonePostal)
  end
  local title = trim(zone and zone.title or '')
  if title == '' then
    title = ('Automatic alarm triggered at %s'):format(zoneLabel)
  end
  local message = trim(zone and zone.message or '')
  if message == '' then
    message = ('Automatic alarm triggered at %s. Police attendance requested to investigate.'):format(zoneLabel)
  end

  local payload = {
    source = s,
    identifiers = GetPlayerIdentifiers(s),
    player_name = callerName,
    platform_name = platformName,
    character_name = characterName,
    title = title,
    message = message,
    priority = trim((zone and zone.priority) or Config.AutoAlarmCallPriority or '2'),
    job_code = trim((zone and zone.job_code) or Config.AutoAlarmCallJobCode or 'ALARM'),
    source_type = 'auto_alarm_zone',
    requested_department_layout_type = trim((zone and zone.requested_department_layout_type) or Config.AutoAlarmRequestedDepartmentLayoutType or 'law_enforcement'),
    location = location,
    street = trim(pos and pos.street or ''),
    crossing = trim(pos and pos.crossing or ''),
    postal = trim((zone and zone.postal) or (pos and pos.postal) or ''),
    alarm_zone_id = trim(zone and zone.id or ''),
    alarm_zone_label = zoneLabel,
  }
  local primaryDeptId = tonumber(zone and zone.department_id) or 0
  local backupDeptId = tonumber(zone and zone.backup_department_id) or 0
  if primaryDeptId > 0 then
    payload.primary_department_id = math.floor(primaryDeptId)
    payload.department_id = math.floor(primaryDeptId)
  end
  if backupDeptId > 0 then
    payload.backup_department_id = math.floor(backupDeptId)
  end
  if payload.priority == '' then payload.priority = '2' end
  if payload.job_code == '' then payload.job_code = 'ALARM' end
  if payload.requested_department_layout_type == '' then
    payload.requested_department_layout_type = 'law_enforcement'
  end

  if type(pos) == 'table' then
    payload.position = {
      x = tonumber(pos.x) or tonumber(zone and zone.x) or 0.0,
      y = tonumber(pos.y) or tonumber(zone and zone.y) or 0.0,
      z = tonumber(pos.z) or tonumber(zone and zone.z) or 0.0,
    }
    payload.heading = tonumber(pos.heading) or 0.0
    payload.speed = tonumber(pos.speed) or 0.0
  else
    payload.position = {
      x = tonumber(zone and zone.x) or 0.0,
      y = tonumber(zone and zone.y) or 0.0,
      z = tonumber(zone and zone.z) or 0.0,
    }
  end

  request('POST', '/api/integration/fivem/calls', payload, function(status, body, responseHeaders)
    if status >= 200 and status < 300 then
      local callId = '?'
      local okDecode, parsed = pcall(json.decode, body or '{}')
      if okDecode and type(parsed) == 'table' and type(parsed.call) == 'table' and parsed.call.id then
        callId = tostring(parsed.call.id)
      end
      print(('[cad_bridge] Auto alarm call created for zone %s (source #%s) as CAD call #%s')
        :format(zoneLabel, tostring(s), callId))
      finish(true, status, body)
      return
    end

    if status == 429 then
      setBridgeBackoff('calls', responseHeaders, 15000, 'auto alarm call')
    end

    local err = ('Auto alarm call failed (HTTP %s)'):format(tostring(status))
    local okDecode, parsed = pcall(json.decode, body or '{}')
    if okDecode and type(parsed) == 'table' and parsed.error then
      err = err .. ': ' .. tostring(parsed.error)
    end
    print('[cad_bridge] ' .. err)
    finish(false, status, body)
  end)

  return true
end

CreateThread(function()
  while true do
    Wait(math.max(500, tonumber(Config.AutoAlarmCallPollIntervalMs) or 1500))

    if Config.AutoAlarmCallEnabled ~= true then
      autoAlarmZonePlayerStateBySource = {}
      autoAlarmZoneInFlightByZoneId = {}
      goto continue
    end
    if not hasBridgeConfig() then
      goto continue
    end

    local zones = getActiveAutoAlarmZones()
    if #zones == 0 then
      goto continue
    end

    local now = nowMs()
    local onlineBySource = {}

    for _, src in ipairs(GetPlayers()) do
      local s = tonumber(src) or 0
      if s > 0 and GetPlayerName(s) then
        onlineBySource[s] = true
        local pos = PlayerPositions[s]
        if type(pos) ~= 'table' then
          pos = getServerPedPositionSnapshot(s)
        end

        local sourceState = autoAlarmZonePlayerStateBySource[s]
        if type(sourceState) ~= 'table' then
          sourceState = {}
          autoAlarmZonePlayerStateBySource[s] = sourceState
        end

        for i, zone in ipairs(zones) do
          if type(zone) == 'table' then
            local zoneKey = trim(zone.id or ('alarm_zone_' .. tostring(i)))
            if zoneKey == '' then zoneKey = 'alarm_zone_' .. tostring(i) end
            local zoneState = sourceState[zoneKey]
            if type(zoneState) ~= 'table' then
              zoneState = {
                inside = false,
                last_trigger_ms = 0,
              }
              sourceState[zoneKey] = zoneState
            end

            local inside = isInsideAlarmZone(pos, zone)
            if inside and zoneState.inside ~= true then
              zoneState.inside = true

              local perPlayerCooldownMs = math.max(
                1000,
                math.floor(tonumber(zone.per_player_cooldown_ms) or tonumber(Config.AutoAlarmPerPlayerCooldownMs) or 60000)
              )
              local zoneCooldownMs = math.max(
                1000,
                math.floor(tonumber(zone.cooldown_ms) or tonumber(Config.AutoAlarmZoneCooldownMs) or 180000)
              )
              local lastPlayerTriggerAt = tonumber(zoneState.last_trigger_ms or 0) or 0
              local lastZoneTriggerAt = tonumber(autoAlarmZoneLastTriggerAtByZoneId[zoneKey] or 0) or 0

              if (now - lastPlayerTriggerAt) >= perPlayerCooldownMs
                and (now - lastZoneTriggerAt) >= zoneCooldownMs
                and autoAlarmZoneInFlightByZoneId[zoneKey] ~= true
              then
                local zoneKeyForCallback = zoneKey
                local zoneCooldownMsForCallback = zoneCooldownMs
                autoAlarmZoneInFlightByZoneId[zoneKey] = true
                autoAlarmZoneLastTriggerAtByZoneId[zoneKey] = now
                zoneState.last_trigger_ms = now

                local dispatched = submitAutoAlarmZoneCall(s, zone, function(success, status)
                  autoAlarmZoneInFlightByZoneId[zoneKeyForCallback] = nil
                  if success ~= true then
                    -- Allow quicker retry after transient failure instead of waiting full zone cooldown.
                    local retryDelayMs = 5000
                    if tonumber(status) == 429 then
                      retryDelayMs = 15000
                    end
                    autoAlarmZoneLastTriggerAtByZoneId[zoneKeyForCallback] =
                      nowMs() - math.max(0, (zoneCooldownMsForCallback - retryDelayMs))
                  end
                end)

                if not dispatched then
                  autoAlarmZoneInFlightByZoneId[zoneKey] = nil
                  autoAlarmZoneLastTriggerAtByZoneId[zoneKey] = 0
                end
              end
            elseif not inside then
              zoneState.inside = false
            end
          end
        end
      end
    end

    for sourceId, _ in pairs(autoAlarmZonePlayerStateBySource) do
      if not onlineBySource[sourceId] then
        autoAlarmZonePlayerStateBySource[sourceId] = nil
      end
    end

    if (now - lastAutoAlarmLogAtMs) >= 300000 and #zones > 0 then
      lastAutoAlarmLogAtMs = now
      -- Low-frequency heartbeat for admin visibility that alarms are enabled.
      print(('[cad_bridge] Auto alarm zone monitoring active (%s zone%s)')
        :format(tostring(#zones), #zones == 1 and '' or 's'))
    end

    ::continue::
  end
end)

CreateThread(function()
  while true do
    Wait(math.max(1000, tonumber(Config.AutoAlarmConfigPollIntervalMs) or 5000))
    pollAutoAlarmZonesConfig()
  end
end)

CreateThread(function()
  while true do
    Wait(math.max(1000, tonumber(Config.AutoAmbulanceCallPollIntervalMs) or 2500))
    if Config.AutoAmbulanceCallEnabled ~= true then
      for sourceId, state in pairs(autoAmbulanceCallStateBySource) do
        if GetPlayerName(sourceId) then
          if type(state) == 'table' then
            state.dead_reported = false
            state.call_submit_in_flight = false
            state.call_submit_started_ms = 0
          end
        else
          autoAmbulanceCallStateBySource[sourceId] = nil
        end
        autoAmbulanceDeathSnapshotBySource[sourceId] = nil
      end
      goto continue
    end
    if not hasBridgeConfig() then
      goto continue
    end

    local wasabiState = GetResourceState('wasabi_ambulance')
    if wasabiState ~= 'started' then
      local now = nowMs()
      if (now - lastAutoAmbulanceMissingResourceLogAtMs) >= 60000 then
        lastAutoAmbulanceMissingResourceLogAtMs = now
        print(('[cad_bridge] Auto ambulance calls paused: wasabi_ambulance state=%s'):format(tostring(wasabiState)))
      end
      for sourceId, state in pairs(autoAmbulanceCallStateBySource) do
        if GetPlayerName(sourceId) then
          if type(state) == 'table' then
            state.dead_reported = false
            state.call_submit_in_flight = false
            state.call_submit_started_ms = 0
          end
        else
          autoAmbulanceCallStateBySource[sourceId] = nil
        end
        autoAmbulanceDeathSnapshotBySource[sourceId] = nil
      end
      goto continue
    end

    local cooldownMs = math.max(10000, tonumber(Config.AutoAmbulanceCallCooldownMs) or 180000)
    local now = nowMs()
    local onlineBySource = {}

    for _, src in ipairs(GetPlayers()) do
      local s = tonumber(src) or 0
      if s > 0 and GetPlayerName(s) then
        onlineBySource[s] = true
        local state = autoAmbulanceCallStateBySource[s]
        if type(state) ~= 'table' then
          state = {
            dead_reported = false,
            last_call_ms = 0,
            last_attempt_ms = 0,
            call_submit_in_flight = false,
            call_submit_started_ms = 0,
            last_notified_death_episode = 0,
          }
          autoAmbulanceCallStateBySource[s] = state
        end

        local deathSnapshot = autoAmbulanceDeathSnapshotBySource[s]
        local snapshotDeathEpisode = math.max(0, math.floor(tonumber(deathSnapshot and deathSnapshot.death_episode) or 0))
        local lastNotifiedEpisode = math.max(0, math.floor(tonumber(state.last_notified_death_episode) or 0))
        local hasFreshDeathEpisode = snapshotDeathEpisode > 0 and snapshotDeathEpisode > lastNotifiedEpisode

        local isDead = isPlayerDeadFromWasabi(s)
        if isDead and isPlayerAliveByHealthFallback(s) then
          isDead = false
          autoAmbulanceDeathSnapshotBySource[s] = {
            is_dead = false,
            death_episode = snapshotDeathEpisode,
            updated_ms = nowMs(),
          }
        end
        if isDead then
          if hasFreshDeathEpisode then
            -- New death cycle detected from client; allow a fresh auto-call immediately.
            state.dead_reported = false
            state.last_call_ms = 0
            state.last_attempt_ms = 0
          end

          if state.call_submit_in_flight == true then
            local startedAt = tonumber(state.call_submit_started_ms) or 0
            if startedAt > 0 and (now - startedAt) > 20000 then
              state.call_submit_in_flight = false
              state.call_submit_started_ms = 0
            end
          end

          if state.dead_reported ~= true and state.call_submit_in_flight ~= true then
            local retryIntervalMs = math.max(3000, tonumber(Config.AutoAmbulanceCallPollIntervalMs) or 2500)
            local lastAttemptMs = tonumber(state.last_attempt_ms) or 0
            if (now - lastAttemptMs) >= retryIntervalMs then
              local lastCallMs = tonumber(state.last_call_ms) or 0
              state.last_attempt_ms = now
              local allowByCooldown = (now - lastCallMs) >= cooldownMs
              if hasFreshDeathEpisode or allowByCooldown then
                state.call_submit_in_flight = true
                state.call_submit_started_ms = now
                local episodeForDispatch = snapshotDeathEpisode
                local dispatched = submitAutoAmbulanceCall(s, function(success)
                  local current = autoAmbulanceCallStateBySource[s]
                  if type(current) ~= 'table' then return end
                  current.call_submit_in_flight = false
                  current.call_submit_started_ms = 0
                  if success == true then
                    current.last_call_ms = nowMs()
                    if episodeForDispatch > 0 then
                      current.last_notified_death_episode = math.max(
                        math.max(0, math.floor(tonumber(current.last_notified_death_episode) or 0)),
                        episodeForDispatch
                      )
                    end
                    if isPlayerDeadFromWasabi(s) then
                      current.dead_reported = true
                    end
                  end
                end)
                if not dispatched then
                  state.call_submit_in_flight = false
                  state.call_submit_started_ms = 0
                end
              else
                state.dead_reported = true
              end
            end
          end
        else
          state.dead_reported = false
          state.last_call_ms = 0
          state.last_attempt_ms = 0
          state.call_submit_in_flight = false
          state.call_submit_started_ms = 0
        end
      end
    end

    for sourceId, _ in pairs(autoAmbulanceCallStateBySource) do
      if not onlineBySource[sourceId] then
        autoAmbulanceCallStateBySource[sourceId] = nil
        autoAmbulanceDeathSnapshotBySource[sourceId] = nil
      end
    end

    ::continue::
  end
end)

local function shellEscape(value)
  value = tostring(value or '')
  if value:find('%s') then
    return '"' .. value:gsub('"', '\\"') .. '"'
  end
  return value
end

local function commandExists(commandName)
  commandName = tostring(commandName or ''):gsub('^/', ''):lower()
  if commandName == '' then return false end

  local ok, commands = pcall(GetRegisteredCommands)
  if not ok or type(commands) ~= 'table' then
    -- If the runtime cannot provide command metadata, do not hard-fail here.
    return true
  end

  for _, entry in ipairs(commands) do
    local name = ''
    if type(entry) == 'table' then
      name = tostring(entry.name or '')
    elseif type(entry) == 'string' then
      name = entry
    end
    if name:gsub('^/', ''):lower() == commandName then
      return true
    end
  end
  return false
end

local function normalizeCitizenId(citizenId)
  return trim(citizenId):lower()
end

local function findPlayerByCitizenId(citizenId)
  local target = normalizeCitizenId(citizenId)
  if target == '' then return nil end

  for _, src in ipairs(GetPlayers()) do
    local s = tonumber(src)
    if s and normalizeCitizenId(getCitizenId(s)) == target then
      return s
    end
  end
  return nil
end

local function findPlayerByIdentifier(prefix, value)
  local target = trim(value):lower()
  if target == '' then return nil end
  local expectedPrefix = tostring(prefix or ''):lower() .. ':'

  for _, src in ipairs(GetPlayers()) do
    local s = tonumber(src)
    if s then
      for _, identifier in ipairs(GetPlayerIdentifiers(s)) do
        local id = tostring(identifier or ''):lower()
        if id == (expectedPrefix .. target) then
          return s
        end
      end
    end
  end
  return nil
end

local function resolvePlayerSourceForJob(job)
  local sourceId = tonumber(job.game_id or job.source or 0)
  if sourceId and sourceId > 0 and GetPlayerName(sourceId) then
    return sourceId
  end

  local byCitizen = findPlayerByCitizenId(job.citizen_id)
  if byCitizen then return byCitizen end

  local byDiscord = findPlayerByIdentifier('discord', job.discord_id)
  if byDiscord then return byDiscord end

  local steamKey = trim(job.steam_id or ''):lower()
  if steamKey:sub(1, 8) == 'discord:' then
    local byDiscordSteam = findPlayerByIdentifier('discord', steamKey:sub(9))
    if byDiscordSteam then return byDiscordSteam end
  elseif steamKey:sub(1, 6) == 'steam:' then
    local bySteamPrefixed = findPlayerByIdentifier('steam', steamKey:sub(7))
    if bySteamPrefixed then return bySteamPrefixed end
  elseif steamKey:sub(1, 8) == 'license:' then
    local byLicense = findPlayerByIdentifier('license', steamKey:sub(9))
    if byLicense then return byLicense end
  elseif steamKey:sub(1, 9) == 'license2:' then
    local byLicense2 = findPlayerByIdentifier('license2', steamKey:sub(10))
    if byLicense2 then return byLicense2 end
  elseif steamKey ~= '' then
    local bySteam = findPlayerByIdentifier('steam', steamKey)
    if bySteam then return bySteam end
  end

  return nil
end

local function resolveFineSource(job, citizenId)
  local sourceId = tonumber(job.game_id or job.source or 0)
  local normalizedCitizen = normalizeCitizenId(citizenId)
  if sourceId and sourceId > 0 and GetPlayerName(sourceId) then
    if normalizedCitizen == '' or normalizeCitizenId(getCitizenId(sourceId)) == normalizedCitizen then
      return sourceId
    end
  end

  local byCitizen = findPlayerByCitizenId(citizenId)
  if byCitizen then return byCitizen end

  local discordId = trim(job.discord_id or '')
  if discordId ~= '' then
    local byDiscord = findPlayerByIdentifier('discord', discordId)
    if byDiscord then return byDiscord end
  end

  local steamKey = trim(job.steam_id or ''):lower()
  if steamKey:sub(1, 8) == 'discord:' then
    local byDiscord = findPlayerByIdentifier('discord', steamKey:sub(9))
    if byDiscord then return byDiscord end
  elseif steamKey:sub(1, 6) == 'steam:' then
    local bySteamPrefixed = findPlayerByIdentifier('steam', steamKey:sub(7))
    if bySteamPrefixed then return bySteamPrefixed end
  elseif steamKey:sub(1, 8) == 'license:' then
    local byLicense = findPlayerByIdentifier('license', steamKey:sub(9))
    if byLicense then return byLicense end
  elseif steamKey:sub(1, 9) == 'license2:' then
    local byLicense2 = findPlayerByIdentifier('license2', steamKey:sub(10))
    if byLicense2 then return byLicense2 end
  elseif steamKey ~= '' then
    local bySteam = findPlayerByIdentifier('steam', steamKey)
    if bySteam then return bySteam end
  end

  -- Fallback: use the license identifier from the QBX database (populated
  -- by the CAD server when it looks up the player's citizenid in QBX).
  local licenseKey = trim(job.license or ''):lower()
  if licenseKey ~= '' then
    -- Strip the 'license:' prefix if present.
    local rawLicense = licenseKey:match('^license:(.+)') or licenseKey
    local byLicense = findPlayerByIdentifier('license', rawLicense)
    if byLicense then return byLicense end
  end

  return nil
end

local function toMoneyNumber(value)
  local n = tonumber(value)
  if not n then return nil end
  if n ~= n then return nil end
  return n
end

local function getPlayerMoneyBalance(player, account)
  if type(player) ~= 'table' then return nil end
  local playerData = player.PlayerData
  if type(playerData) ~= 'table' then return nil end
  local money = playerData.money
  if type(money) ~= 'table' then return nil end
  return toMoneyNumber(money[account])
end

local function getQbxMoneyBalance(sourceId, player, account)
  if GetResourceState('qbx_core') == 'started' and sourceId and sourceId > 0 then
    local ok, amount = pcall(function()
      return exports.qbx_core:GetMoney(sourceId, account)
    end)
    if ok then
      local normalized = toMoneyNumber(amount)
      if normalized ~= nil then
        return normalized
      end
    end
  end
  return getPlayerMoneyBalance(player, account)
end

local function hasExpectedDeduction(beforeBalance, afterBalance, amount)
  local before = toMoneyNumber(beforeBalance)
  local after = toMoneyNumber(afterBalance)
  if not before or not after then return nil end
  local expected = before - (tonumber(amount) or 0)
  return after <= (expected + 0.01)
end

local function verifyDeductionWithRetries(readBalance, beforeBalance, amount, retries, delayMs)
  local attempts = math.max(0, math.floor(tonumber(retries) or 0))
  local waitMs = math.max(0, math.floor(tonumber(delayMs) or 0))

  local afterBalance = readBalance()
  local deducted = hasExpectedDeduction(beforeBalance, afterBalance, amount)
  if deducted ~= false then
    return deducted, afterBalance
  end

  for _ = 1, attempts do
    if waitMs > 0 then
      Wait(waitMs)
    end
    afterBalance = readBalance()
    deducted = hasExpectedDeduction(beforeBalance, afterBalance, amount)
    if deducted ~= false then
      return deducted, afterBalance
    end
  end

  return deducted, afterBalance
end

local function applyJobSyncAuto(sourceId, jobName, jobGrade)
  if GetResourceState('qbx_core') == 'started' then
    local ok, xPlayer = pcall(function()
      return exports.qbx_core:GetPlayer(sourceId)
    end)
    if ok and xPlayer then
      if xPlayer.Functions and type(xPlayer.Functions.SetJob) == 'function' then
        local setOk, err = pcall(function()
          xPlayer.Functions.SetJob(jobName, jobGrade)
        end)
        if setOk then return true, '' end
        return false, ('qbx_core SetJob failed: %s'):format(tostring(err))
      end
      if type(xPlayer.SetJob) == 'function' then
        local setOk, err = pcall(function()
          xPlayer:SetJob(jobName, jobGrade)
        end)
        if setOk then return true, '' end
        return false, ('qbx_core SetJob failed: %s'):format(tostring(err))
      end
      return false, 'qbx_core player object has no SetJob method'
    end
  end

  if GetResourceState('qb-core') == 'started' then
    local ok, core = pcall(function()
      return exports['qb-core']:GetCoreObject()
    end)
    if ok and core and core.Functions and core.Functions.GetPlayer then
      local player = core.Functions.GetPlayer(sourceId)
      if player and player.Functions and type(player.Functions.SetJob) == 'function' then
        local setOk, err = pcall(function()
          player.Functions.SetJob(jobName, jobGrade)
        end)
        if setOk then return true, '' end
        return false, ('qb-core SetJob failed: %s'):format(tostring(err))
      end
      return false, 'qb-core player object has no SetJob method'
    end
  end

  return false, 'No supported framework for auto job sync (qbx_core/qb-core)'
end

local function applyJobSync(job)
  if Config.JobSyncAdapter == 'none' then
    return false, 'Job sync adapter disabled (Config.JobSyncAdapter=none)', false
  end

  local jobName = trim(job.job_name or '')
  if jobName == '' then
    return false, 'Job name is empty', false
  end
  local jobGrade = math.max(0, math.floor(tonumber(job.job_grade) or 0))
  local sourceId = resolvePlayerSourceForJob(job)

  if not sourceId then
    return false, 'Target player is no longer online', true
  end

  if Config.JobSyncAdapter == 'command' then
    local cmdTemplate = tostring(Config.JobSyncCommandTemplate or '')
    if cmdTemplate == '' then
      return false, 'Job sync command template is empty', false
    end

    local commandName = cmdTemplate:match('^%s*([^%s]+)') or ''
    if commandName == '' then
      return false, 'Job sync command template has no command name', false
    end
    if not commandExists(commandName) then
      return false, ('Job sync command not registered: %s'):format(commandName), false
    end

    local cmd = cmdTemplate
    cmd = cmd:gsub('{source}', shellEscape(sourceId))
    cmd = cmd:gsub('{citizenid}', shellEscape(job.citizen_id or ''))
    cmd = cmd:gsub('{job}', shellEscape(jobName))
    cmd = cmd:gsub('{grade}', shellEscape(jobGrade))
    ExecuteCommand(cmd)
    return true, '', false
  end

  if Config.JobSyncAdapter == 'auto' then
    local ok, err = applyJobSyncAuto(sourceId, jobName, jobGrade)
    return ok, err or '', false
  end

  return false, ('Unknown job sync adapter: %s'):format(tostring(Config.JobSyncAdapter)), false
end

local jobPollInFlight = false
CreateThread(function()
  while true do
    Wait(math.max(2000, tonumber(Config.JobSyncPollIntervalMs) or 5000))
    if Config.JobSyncAdapter == 'none' then
      goto continue
    end
    if not hasBridgeConfig() then
      goto continue
    end
    if jobPollInFlight or isBridgeBackoffActive('job_poll') then
      goto continue
    end

    jobPollInFlight = true
    request('GET', '/api/integration/fivem/job-jobs?limit=25', nil, function(status, body, responseHeaders)
      jobPollInFlight = false
      if status == 429 then
        setBridgeBackoff('job_poll', responseHeaders, 10000, 'job poll')
        return
      end
      if status ~= 200 then
        return
      end

      local ok, jobs = pcall(json.decode, body)
      if not ok or type(jobs) ~= 'table' then
        return
      end

      for _, job in ipairs(jobs) do
        local success, err, transient = applyJobSync(job)
        if success then
          request('POST', ('/api/integration/fivem/job-jobs/%s/sent'):format(tostring(job.id)), {}, function() end)
        elseif transient then
          -- Keep pending so it can be retried automatically when player is available.
        else
          request('POST', ('/api/integration/fivem/job-jobs/%s/failed'):format(tostring(job.id)), {
            error = err or 'Job sync adapter failed',
          }, function() end)
        end
      end
    end)

    ::continue::
  end
end)

local function applyRouteJob(job)
  local citizenId = trim(job.citizen_id or '')
  local sourceId = resolveFineSource(job, citizenId)
  if not sourceId then
    return false, 'Target character is not currently online', true
  end

  local action = trim(job.action or 'set'):lower()
  local clearWaypoint = job.clear_waypoint == true or tonumber(job.clear_waypoint or 0) == 1 or action == 'clear'
  local payload = {
    id = tostring(job.id or ''),
    call_id = tonumber(job.call_id) or 0,
    action = action ~= '' and action or 'set',
    clear_waypoint = clearWaypoint,
    call_title = tostring(job.call_title or ''),
    location = tostring(job.location or ''),
    postal = tostring(job.postal or ''),
    route_type = tostring(job.route_type or ''),
    route_label = tostring(job.route_label or ''),
    suppress_notify = job.suppress_notify == true or tonumber(job.suppress_notify or 0) == 1,
    primary_unit_id = tonumber(job.primary_unit_id) or 0,
    primary_callsign = tostring(job.primary_callsign or ''),
  }

  if not clearWaypoint then
    local x = tonumber(job.position_x)
    local y = tonumber(job.position_y)
    local z = tonumber(job.position_z)
    if x and y then
      payload.position = {
        x = x,
        y = y,
        z = z or 0.0,
      }
    end
  end

  TriggerClientEvent('cad_bridge:setCallRoute', sourceId, payload)
  return true, '', false
end

local routePollInFlight = false
CreateThread(function()
  while true do
    Wait(math.max(2000, tonumber(Config.RoutePollIntervalMs) or 5000))
    if not hasBridgeConfig() then
      goto continue
    end
    if routePollInFlight or isBridgeBackoffActive('route_poll') then
      goto continue
    end

    routePollInFlight = true
    request('GET', '/api/integration/fivem/route-jobs?limit=25', nil, function(status, body, responseHeaders)
      routePollInFlight = false
      if status == 429 then
        setBridgeBackoff('route_poll', responseHeaders, 10000, 'route poll')
        return
      end
      if status ~= 200 then
        return
      end

      local ok, jobs = pcall(json.decode, body)
      if not ok or type(jobs) ~= 'table' then
        return
      end

      for _, job in ipairs(jobs) do
        local success, err, transient = applyRouteJob(job)
        if success then
          request('POST', ('/api/integration/fivem/route-jobs/%s/sent'):format(tostring(job.id)), {}, function() end)
        elseif transient then
          -- Keep pending and retry when the target character is online.
        else
          request('POST', ('/api/integration/fivem/route-jobs/%s/failed'):format(tostring(job.id)), {
            error = err or 'Route delivery failed',
          }, function() end)
        end
      end
    end)

    ::continue::
  end
end)

local function clearActiveCallPromptForSource(sourceId, promptId)
  local s = tonumber(sourceId) or 0
  if s <= 0 then return end
  local existing = activeCallPromptBySource[s]
  if type(existing) ~= 'table' then return end
  if promptId and trim(existing.id or '') ~= trim(promptId) then
    return
  end
  activeCallPromptBySource[s] = nil
end

local function applyCallPromptJob(job)
  local citizenId = trim(job.citizen_id or '')
  local sourceId = resolveFineSource(job, citizenId)
  if not sourceId then
    return false, 'Target unit is not currently online', true
  end

  local payload = {
    id = tostring(job.id or ''),
    call_id = tonumber(job.call_id) or 0,
    title = tostring(job.title or job.call_title or ''),
    priority = tostring(job.priority or ''),
    location = tostring(job.location or ''),
    postal = tostring(job.postal or ''),
    distance_meters = tonumber(job.distance_meters) or 0,
    department_id = tonumber(job.department_id) or 0,
    department_name = tostring(job.department_name or ''),
    department_short_name = tostring(job.department_short_name or ''),
    expires_in_ms = math.max(6000, tonumber(Config.ClosestCallPromptTimeoutMs) or 15000),
  }

  activeCallPromptBySource[sourceId] = {
    id = payload.id,
    call_id = payload.call_id,
    source = sourceId,
    game_id = tostring(job.game_id or ''),
    citizen_id = citizenId,
    offered_at = nowMs(),
  }

  TriggerClientEvent('cad_bridge:showClosestCallPrompt', sourceId, payload)
  return true, '', false
end

RegisterNetEvent('cad_bridge:closestCallPromptDecision', function(data)
  local src = tonumber(source) or 0
  if src <= 0 then return end
  local activePrompt = activeCallPromptBySource[src]
  if type(activePrompt) ~= 'table' then return end

  local payload = type(data) == 'table' and data or {}
  local promptId = trim(payload.id or payload.prompt_id or '')
  if promptId == '' then
    promptId = trim(activePrompt.id or '')
  end
  if promptId == '' then return end

  if trim(activePrompt.id or '') ~= '' and trim(activePrompt.id or '') ~= promptId then
    return
  end

  local action = trim(payload.action or payload.decision or ''):lower()
  if action ~= 'accept' and action ~= 'decline' then
    action = 'decline'
  end
  local reason = trim(payload.reason or '')

  clearActiveCallPromptForSource(src, promptId)
  request('POST', ('/api/integration/fivem/call-prompts/%s/%s'):format(urlEncode(promptId), action), {
    game_id = tostring(src),
    citizen_id = getCitizenId(src),
    reason = reason,
  }, function(status, body, _responseHeaders)
    if status >= 200 and status < 300 then
      return
    end
    if tonumber(status) == 404 then
      return
    end

    local parsedError = ''
    local ok, parsed = pcall(json.decode, body or '{}')
    if ok and type(parsed) == 'table' then
      parsedError = trim(parsed.error or '')
    end

    local err = parsedError ~= '' and parsedError or ('HTTP ' .. tostring(status))
    notifyAlert(src, 'CAD Dispatch', ('Call prompt %s failed: %s'):format(action, err), 'warning')
  end)
end)

local callPromptPollInFlight = false
CreateThread(function()
  while true do
    Wait(math.max(1500, tonumber(Config.ClosestCallPromptPollIntervalMs) or 2500))
    if not hasBridgeConfig() then
      goto continue
    end
    if callPromptPollInFlight or isBridgeBackoffActive('call_prompt_poll') then
      goto continue
    end

    callPromptPollInFlight = true
    request('GET', '/api/integration/fivem/call-prompts?limit=25', nil, function(status, body, responseHeaders)
      callPromptPollInFlight = false
      if status == 429 then
        setBridgeBackoff('call_prompt_poll', responseHeaders, 10000, 'call prompt poll')
        return
      end
      if status ~= 200 then
        return
      end

      local ok, jobs = pcall(json.decode, body)
      if not ok or type(jobs) ~= 'table' then
        return
      end

      for _, job in ipairs(jobs) do
        local success, err, transient = applyCallPromptJob(job)
        if success then
          request('POST', ('/api/integration/fivem/call-prompts/%s/sent'):format(urlEncode(tostring(job.id))), {}, function() end)
        elseif transient then
          -- Keep pending and retry when target unit is online.
        else
          request('POST', ('/api/integration/fivem/call-prompts/%s/decline'):format(urlEncode(tostring(job.id))), {
            reason = err or 'Prompt delivery failed',
            game_id = tostring(job.game_id or ''),
            citizen_id = tostring(job.citizen_id or ''),
          }, function() end)
        end
      end
    end)

    ::continue::
  end
end)

local function applyFine(job)
  if Config.FineAdapter == 'none' then
    return false, 'Fine adapter disabled (Config.FineAdapter=none)', false
  end

  local citizenId = trim(job.citizen_id or '')
  local amount = tonumber(job.amount) or 0
  local reason = trim(job.reason or '')
  local account = trim(job.account or 'bank'):lower()
  if citizenId == '' then
    return false, 'Fine citizen_id is empty', false
  end
  if amount <= 0 then
    return false, 'Fine amount must be greater than 0', false
  end

  local function notifyFineApplied(sourceId)
    local message = ('You have been fined $%s'):format(tostring(math.floor(amount)))
    if reason ~= '' then
      message = message .. (' (%s)'):format(reason)
    end
    TriggerClientEvent('cad_bridge:notifyFine', sourceId, {
      title = 'CAD Fine Issued',
      description = message,
      amount = tonumber(amount) or 0,
      reason = reason,
    })
  end

  if Config.FineAdapter == 'auto' then
    local sourceId = resolveFineSource(job, citizenId)
    if not sourceId then
      return false, 'Target character is not currently online', true
    end

    if GetResourceState('qbx_core') == 'started' then
      local ok, xPlayer = pcall(function()
        return exports.qbx_core:GetPlayer(sourceId)
      end)
      if ok and xPlayer then
        local fineReason = reason ~= '' and reason or 'CAD fine'
        local beforeBalance = getQbxMoneyBalance(sourceId, xPlayer, account)
        local attemptedAdapters = {}
        local attemptErrors = {}
        local balanceVerifyRetries = 3
        local balanceVerifyDelayMs = 150
        local function recordAttempt(label, err)
          attemptedAdapters[#attemptedAdapters + 1] = label
          if err and err ~= '' then
            attemptErrors[#attemptErrors + 1] = ('%s -> %s'):format(label, err)
          end
        end

        local function getAfterBalance()
          local refreshed = xPlayer
          local refreshedOk, refreshedPlayer = pcall(function()
            return exports.qbx_core:GetPlayer(sourceId)
          end)
          if refreshedOk and refreshedPlayer then
            refreshed = refreshedPlayer
          end
          return getQbxMoneyBalance(sourceId, refreshed, account)
        end

        local function tryAdapter(label, fn)
          local callOk, result = pcall(fn)
          if not callOk then
            recordAttempt(label, ('error: %s'):format(tostring(result)))
            return false
          end

          if result == false then
            recordAttempt(label, 'returned false')
            return false
          end

          local deducted = nil
          if beforeBalance ~= nil then
            deducted = select(1, verifyDeductionWithRetries(
              getAfterBalance,
              beforeBalance,
              amount,
              balanceVerifyRetries,
              balanceVerifyDelayMs
            ))
          end

          if deducted == true then
            recordAttempt(label)
            return true
          end

          if result == true then
            -- Some QBX implementations return true before balance replication catches up.
            if deducted == false then
              recordAttempt(label, 'returned true but balance check did not reflect deduction yet')
            else
              recordAttempt(label)
            end
            return true
          end

          -- Some framework adapters do not return a status; accept on no-error when balance cannot be verified.
          if deducted == false then
            recordAttempt(label, ('no deduction verified (result=%s)'):format(tostring(result)))
            return false
          end
          recordAttempt(label)
          return true
        end

        local adapters = {
          {
            label = 'qbx export RemoveMoney(source, account, amount, reason)',
            fn = function()
              return exports.qbx_core:RemoveMoney(sourceId, account, amount, fineReason)
            end,
          },
          {
            label = 'qbx export RemoveMoney(source, account, amount)',
            fn = function()
              return exports.qbx_core:RemoveMoney(sourceId, account, amount)
            end,
          },
        }

        if citizenId ~= '' then
          adapters[#adapters + 1] = {
            label = 'qbx export RemoveMoney(citizenid, account, amount, reason)',
            fn = function()
              return exports.qbx_core:RemoveMoney(citizenId, account, amount, fineReason)
            end,
          }
          adapters[#adapters + 1] = {
            label = 'qbx export RemoveMoney(citizenid, account, amount)',
            fn = function()
              return exports.qbx_core:RemoveMoney(citizenId, account, amount)
            end,
          }
        end

        if xPlayer.Functions and type(xPlayer.Functions.RemoveMoney) == 'function' then
          adapters[#adapters + 1] = {
            label = 'xPlayer.Functions.RemoveMoney(account, amount, reason)',
            fn = function()
              return xPlayer.Functions.RemoveMoney(account, amount, fineReason)
            end,
          }
          adapters[#adapters + 1] = {
            label = 'xPlayer.Functions.RemoveMoney(account, amount)',
            fn = function()
              return xPlayer.Functions.RemoveMoney(account, amount)
            end,
          }
          adapters[#adapters + 1] = {
            label = 'xPlayer.Functions.RemoveMoney(amount, account, reason)',
            fn = function()
              return xPlayer.Functions.RemoveMoney(amount, account, fineReason)
            end,
          }
        end

        if type(xPlayer.RemoveMoney) == 'function' then
          adapters[#adapters + 1] = {
            label = 'xPlayer:RemoveMoney(account, amount, reason)',
            fn = function()
              return xPlayer:RemoveMoney(account, amount, fineReason)
            end,
          }
          adapters[#adapters + 1] = {
            label = 'xPlayer:RemoveMoney(account, amount)',
            fn = function()
              return xPlayer:RemoveMoney(account, amount)
            end,
          }
          adapters[#adapters + 1] = {
            label = 'xPlayer.RemoveMoney(xPlayer, account, amount, reason)',
            fn = function()
              return xPlayer.RemoveMoney(xPlayer, account, amount, fineReason)
            end,
          }
        end

        for _, adapter in ipairs(adapters) do
          if tryAdapter(adapter.label, adapter.fn) then
            notifyFineApplied(sourceId)
            return true, '', false
          end
        end

        local err = 'qbx_core RemoveMoney failed'
        if #attemptErrors > 0 then
          err = err .. ': ' .. attemptErrors[#attemptErrors]
        end
        if #attemptedAdapters > 0 then
          err = err .. (' (attempted: %s)'):format(table.concat(attemptedAdapters, ', '))
        end
        return false, err, false
      end
    end

    if GetResourceState('qb-core') == 'started' then
      local ok, core = pcall(function()
        return exports['qb-core']:GetCoreObject()
      end)
      if ok and core and core.Functions and core.Functions.GetPlayer then
        local player = core.Functions.GetPlayer(sourceId)
        if player and player.Functions and type(player.Functions.RemoveMoney) == 'function' then
          local beforeBalance = getPlayerMoneyBalance(player, account)
          local success, removed = pcall(function()
            return player.Functions.RemoveMoney(account, amount, reason ~= '' and reason or 'CAD fine')
          end)
          if not success then
            return false, ('qb-core RemoveMoney failed: %s'):format(tostring(removed)), false
          end
          if removed == false then
            return false, 'qb-core rejected fine removal', false
          end

          local deducted = nil
          if beforeBalance ~= nil then
            deducted = select(1, verifyDeductionWithRetries(
              function()
                return getPlayerMoneyBalance(player, account)
              end,
              beforeBalance,
              amount,
              3,
              150
            ))
          end

          if removed == nil and deducted ~= true then
            return false, 'qb-core RemoveMoney returned no status and deduction could not be verified', false
          end
          if removed == true and deducted == false then
            print(('[cad_bridge] qb-core RemoveMoney reported success but balance verification did not update immediately (source=%s, account=%s, amount=%s)'):format(
              tostring(sourceId),
              tostring(account),
              tostring(amount)
            ))
          end
          notifyFineApplied(sourceId)
          return true, '', false
        end
        return false, 'qb-core player object has no RemoveMoney method', false
      end
    end

    return false, 'No supported framework for auto fine adapter (qbx_core/qb-core)', false
  end

  if Config.FineAdapter == 'command' then
    local cmdTemplate = tostring(Config.FineCommandTemplate or '')
    if cmdTemplate == '' then
      return false, 'Fine command template is empty', false
    end

    local commandName = cmdTemplate:match('^%s*([^%s]+)') or ''
    if commandName == '' then
      return false, 'Fine command template has no command name', false
    end
    if not commandExists(commandName) then
      return false, ('Fine command not registered: %s'):format(commandName), false
    end
    local sourceId = resolveFineSource(job, citizenId)
    if not sourceId then
      return false, 'Target character is not currently online for command fine', true
    end
    local cmd = cmdTemplate
    cmd = cmd:gsub('{source}', shellEscape(sourceId or 0))
    cmd = cmd:gsub('{citizenid}', shellEscape(citizenId))
    cmd = cmd:gsub('{amount}', shellEscape(amount))
    cmd = cmd:gsub('{reason}', shellEscape(reason))

    ExecuteCommand(cmd)
    if sourceId then
      notifyFineApplied(sourceId)
    end
    return true, '', false
  end

  return false, ('Unknown fine adapter: %s'):format(tostring(Config.FineAdapter)), false
end

local finePollInFlight = false
pollFineJobs = function()
  if not hasBridgeConfig() then
    return
  end
  if finePollInFlight or isBridgeBackoffActive('fine_poll') then
    return
  end

  finePollInFlight = true
  request('GET', '/api/integration/fivem/fine-jobs?limit=25', nil, function(status, body, responseHeaders)
    finePollInFlight = false
    if status == 429 then
      setBridgeBackoff('fine_poll', responseHeaders, 10000, 'fine poll')
      return
    end
    if status ~= 200 then
      return
    end

    local ok, jobs = pcall(json.decode, body)
    if not ok or type(jobs) ~= 'table' then
      return
    end

    for _, job in ipairs(jobs) do
      local success, err, transient = applyFine(job)
      if success then
        request('POST', ('/api/integration/fivem/fine-jobs/%s/sent'):format(tostring(job.id)), {}, function() end)
      elseif transient then
        -- Keep pending and retry when the target character is online.
      else
        request('POST', ('/api/integration/fivem/fine-jobs/%s/failed'):format(tostring(job.id)), {
          error = err or 'Fine adapter failed',
        }, function() end)
      end
    end
  end)
end

CreateThread(function()
  while true do
    Wait(math.max(2000, tonumber(Config.FinePollIntervalMs) or 7000))
    pollFineJobs()
  end
end)

local jailInventorySnapshotsBySource = {}

local function cloneInventoryValue(value, depth)
  if type(value) ~= 'table' then return value end
  local nextDepth = (tonumber(depth) or 0) + 1
  if nextDepth > 8 then return {} end
  local out = {}
  for key, nested in pairs(value) do
    local nestedType = type(nested)
    if nestedType ~= 'function' and nestedType ~= 'userdata' and nestedType ~= 'thread' then
      out[key] = cloneInventoryValue(nested, nextDepth)
    end
  end
  return out
end

local function isJailInventoryManagementEnabled()
  if type(Config) ~= 'table' then return true end
  local enabled = Config.CadBridgeJailManageInventory
  if enabled == nil then return true end
  return enabled == true
end

local function getQbxPlayerForInventory(sourceId)
  if GetResourceState('qbx_core') ~= 'started' then return nil end
  local ok, player = pcall(function()
    return exports.qbx_core:GetPlayer(sourceId)
  end)
  if ok and player then return player end
  return nil
end

local function getQbPlayerForInventory(sourceId)
  if GetResourceState('qb-core') ~= 'started' then return nil end
  local ok, core = pcall(function()
    return exports['qb-core']:GetCoreObject()
  end)
  if not ok or not core or not core.Functions or type(core.Functions.GetPlayer) ~= 'function' then
    return nil
  end
  local player = core.Functions.GetPlayer(sourceId)
  if player then return player end
  return nil
end

local function normalizeInventorySnapshotItems(rawItems)
  local out = {}
  if type(rawItems) ~= 'table' then return out end
  for key, item in pairs(rawItems) do
    if type(item) == 'table' then
      local name = trim(item.name or item.item or item.id or item.slotName or '')
      local amount = math.max(0, math.floor(tonumber(item.amount or item.count or item.qty or 0) or 0))
      if name ~= '' and amount > 0 then
        local slot = tonumber(item.slot or item.slotId or key)
        local normalizedItem = {
          name = name,
          amount = amount,
          slot = slot and math.max(1, math.floor(slot)) or nil,
          info = type(item.info) == 'table' and cloneInventoryValue(item.info) or nil,
          metadata = type(item.metadata) == 'table' and cloneInventoryValue(item.metadata) or nil,
        }
        out[#out + 1] = normalizedItem
      end
    end
  end
  table.sort(out, function(a, b)
    local aSlot = tonumber(a and a.slot) or 99999
    local bSlot = tonumber(b and b.slot) or 99999
    if aSlot ~= bSlot then return aSlot < bSlot end
    return trim(a and a.name or '') < trim(b and b.name or '')
  end)
  return out
end

local function getSnapshotItemsFromPlayerData(player)
  if type(player) ~= 'table' then return nil end
  local playerData = type(player.PlayerData) == 'table' and player.PlayerData or nil
  if type(playerData) ~= 'table' then return nil end
  if type(playerData.items) ~= 'table' then return {} end
  return normalizeInventorySnapshotItems(playerData.items)
end

local function getSnapshotItemsFromOxInventory(sourceId)
  if GetResourceState('ox_inventory') ~= 'started' then return nil end

  local okItems, items = pcall(function()
    return exports.ox_inventory:GetInventoryItems(sourceId)
  end)
  if okItems and type(items) == 'table' then
    return normalizeInventorySnapshotItems(items)
  end

  local okInv, inv = pcall(function()
    return exports.ox_inventory:GetInventory(sourceId)
  end)
  if okInv and type(inv) == 'table' then
    if type(inv.items) == 'table' then
      return normalizeInventorySnapshotItems(inv.items)
    end
    return normalizeInventorySnapshotItems(inv)
  end

  return nil
end

local function clearInventoryForJail(sourceId, playerObject)
  if type(Config) == 'table' and type(Config.CadBridgeJailInventoryClear) == 'function' then
    local ok, result, err = pcall(function()
      return Config.CadBridgeJailInventoryClear(sourceId)
    end)
    if ok and result ~= false then return true, '' end
    return false, trim(err or (not ok and result) or 'Custom inventory clear callback failed')
  end

  if type(playerObject) == 'table' then
    if type(playerObject.Functions) == 'table' and type(playerObject.Functions.ClearInventory) == 'function' then
      local ok, result = pcall(function()
        return playerObject.Functions.ClearInventory()
      end)
      if ok and result ~= false then return true, '' end
    end
    if type(playerObject.ClearInventory) == 'function' then
      local ok, result = pcall(function()
        return playerObject:ClearInventory()
      end)
      if ok and result ~= false then return true, '' end
    end
  end

  local exportAttempts = {
    {
      resource = 'ox_inventory',
      fn = function()
        return exports.ox_inventory:ClearInventory(sourceId)
      end,
    },
    {
      resource = 'qb-inventory',
      fn = function()
        return exports['qb-inventory']:ClearInventory(sourceId)
      end,
    },
    {
      resource = 'ps-inventory',
      fn = function()
        return exports['ps-inventory']:ClearInventory(sourceId)
      end,
    },
    {
      resource = 'lj-inventory',
      fn = function()
        return exports['lj-inventory']:ClearInventory(sourceId)
      end,
    },
  }

  for _, attempt in ipairs(exportAttempts) do
    if GetResourceState(attempt.resource) == 'started' then
      local ok, result = pcall(attempt.fn)
      if ok and result ~= false then return true, '' end
    end
  end

  return false, 'No supported inventory clear adapter available'
end

local function getJailInventoryAddMetadata(item)
  if type(item) ~= 'table' then return {} end
  if type(item.metadata) == 'table' then return cloneInventoryValue(item.metadata) end
  if type(item.info) == 'table' then return cloneInventoryValue(item.info) end
  return {}
end

local function addInventoryItemForJailRestore(sourceId, item, playerObject)
  if type(item) ~= 'table' then return false, 'invalid_item' end
  local name = trim(item.name or '')
  local amount = math.max(0, math.floor(tonumber(item.amount or 0) or 0))
  if name == '' or amount <= 0 then return false, 'invalid_item_payload' end
  local slot = tonumber(item.slot)
  local metadata = getJailInventoryAddMetadata(item)

  if type(playerObject) == 'table' then
    if type(playerObject.Functions) == 'table' and type(playerObject.Functions.AddItem) == 'function' then
      local attempts = {
        function() return playerObject.Functions.AddItem(name, amount, slot and math.floor(slot) or false, metadata) end,
        function() return playerObject.Functions.AddItem(name, amount, false, metadata) end,
        function() return playerObject.Functions.AddItem(name, amount, metadata, slot and math.floor(slot) or false) end,
        function() return playerObject.Functions.AddItem(name, amount) end,
      }
      for _, fn in ipairs(attempts) do
        local ok, result = pcall(fn)
        if ok and result ~= false then return true, '' end
      end
    end

    if type(playerObject.AddItem) == 'function' then
      local attempts = {
        function() return playerObject:AddItem(name, amount, slot and math.floor(slot) or false, metadata) end,
        function() return playerObject:AddItem(name, amount, metadata) end,
      }
      for _, fn in ipairs(attempts) do
        local ok, result = pcall(fn)
        if ok and result ~= false then return true, '' end
      end
    end
  end

  if GetResourceState('ox_inventory') == 'started' then
    local ok, result = pcall(function()
      return exports.ox_inventory:AddItem(sourceId, name, amount, metadata, slot and math.floor(slot) or nil)
    end)
    if ok and result ~= false then return true, '' end
  end

  local exportAddAttempts = {
    {
      resource = 'qb-inventory',
      fn = function()
        return exports['qb-inventory']:AddItem(sourceId, name, amount, slot and math.floor(slot) or false, metadata)
      end,
    },
    {
      resource = 'ps-inventory',
      fn = function()
        return exports['ps-inventory']:AddItem(sourceId, name, amount, slot and math.floor(slot) or false, metadata)
      end,
    },
    {
      resource = 'lj-inventory',
      fn = function()
        return exports['lj-inventory']:AddItem(sourceId, name, amount, slot and math.floor(slot) or false, metadata)
      end,
    },
  }

  for _, attempt in ipairs(exportAddAttempts) do
    if GetResourceState(attempt.resource) == 'started' then
      local ok, result = pcall(attempt.fn)
      if ok and result ~= false then return true, '' end
    end
  end

  return false, ('No supported inventory restore adapter for item %s'):format(name)
end

local activeDocumentPrintJobsById = {}
local activeDocumentPrintJobIdBySource = {}

local function choosePrintedDocumentItemName(job)
  local subtype = trim(job and (job.document_subtype or job.subtype) or ''):lower()
  if subtype == 'ticket' then
    local configured = trim(Config and Config.CadBridgePrintedTicketItemName or '')
    if configured ~= '' then return configured end
  end
  if subtype == 'written_warning' or subtype == 'warning' then
    local configured = trim(Config and Config.CadBridgePrintedWarningItemName or '')
    if configured ~= '' then return configured end
  end

  local fallback = trim(Config and Config.CadBridgePrintedTicketItemName or '')
  if fallback ~= '' then return fallback end
  return 'paper'
end

local function buildPrintedDocumentMetadata(job)
  local metadata = {}
  if type(job) == 'table' and type(job.metadata) == 'table' then
    for key, value in pairs(job.metadata) do
      metadata[key] = value
    end
  end

  local title = trim(job and job.title or '')
  local description = trim(job and job.description or '')
  local subtype = trim(job and (job.document_subtype or job.subtype) or ''):lower()
  local niceSubtype = subtype ~= '' and subtype:gsub('_', ' ') or 'document'
  niceSubtype = niceSubtype:gsub('(%a)([%w]*)', function(first, rest)
    return string.upper(first) .. string.lower(rest)
  end)

  metadata.document_type = trim(job and job.document_type or '') ~= '' and trim(job.document_type) or 'cad_document'
  metadata.document_subtype = subtype ~= '' and subtype or 'document'
  metadata.cad_print_job_id = tonumber(job and job.id or 0) or 0
  metadata.title = title
  metadata.description = description
  metadata.label = title ~= '' and title or ('Printed ' .. niceSubtype)
  metadata.printed_at = os.date('!%Y-%m-%dT%H:%M:%SZ')

  local summaryParts = {}
  if title ~= '' then summaryParts[#summaryParts + 1] = title end
  if description ~= '' then summaryParts[#summaryParts + 1] = description end
  metadata.info = metadata.info or (table.concat(summaryParts, ' | '):sub(1, 220))

  return metadata
end

local function getPrintedDocumentItemNames()
  local out = {}
  local seen = {}

  local function push(raw)
    local value = trim(raw or '')
    if value == '' then return end
    local key = value:lower()
    if seen[key] then return end
    seen[key] = true
    out[#out + 1] = value
  end

  push(Config and Config.CadBridgePrintedTicketItemName or '')
  push(Config and Config.CadBridgePrintedWarningItemName or '')
  if #out == 0 then
    push('paper')
  end

  return out
end

local function extractPrintedDocumentMetadataFromItem(item)
  if type(item) ~= 'table' then return nil, '', '' end

  local itemName = trim(item.name or item.item or item.slotName or '')
  local itemLabel = trim(item.label or item.displayName or '')
  local metadata = nil

  if type(item.metadata) == 'table' then metadata = item.metadata end
  if type(item.info) == 'table' and type(metadata) ~= 'table' then metadata = item.info end

  if type(item.item) == 'table' then
    local nested = item.item
    if itemName == '' then itemName = trim(nested.name or nested.item or '') end
    if itemLabel == '' then itemLabel = trim(nested.label or '') end
    if type(nested.metadata) == 'table' and type(metadata) ~= 'table' then metadata = nested.metadata end
    if type(nested.info) == 'table' and type(metadata) ~= 'table' then metadata = nested.info end
  end

  if type(item.slot) == 'table' then
    local slotData = item.slot
    if itemName == '' then itemName = trim(slotData.name or slotData.item or '') end
    if itemLabel == '' then itemLabel = trim(slotData.label or '') end
    if type(slotData.metadata) == 'table' and type(metadata) ~= 'table' then metadata = slotData.metadata end
    if type(slotData.info) == 'table' and type(metadata) ~= 'table' then metadata = slotData.info end
  end

  if type(metadata) ~= 'table' then return nil, itemName, itemLabel end
  return metadata, itemName, itemLabel
end

local function openPrintedDocumentForSource(sourceId, itemPayload, fallbackItemName, sourceLabel)
  local src = tonumber(sourceId) or 0
  if src <= 0 then return false end

  local metadata, itemName, itemLabel = extractPrintedDocumentMetadataFromItem(itemPayload)
  if type(metadata) ~= 'table' then
    return false
  end

  local docType = trim(metadata.document_type or '')
  local docSubtype = trim(metadata.document_subtype or '')
  local hasDocMarker = docType ~= '' or docSubtype ~= '' or tonumber(metadata.cad_print_job_id or 0)
  if not hasDocMarker then
    local title = trim(metadata.title or '')
    local description = trim(metadata.description or metadata.info or '')
    if title == '' and description == '' then
      return false
    end
  end

  local payload = {
    item_name = trim(itemName) ~= '' and trim(itemName) or trim(fallbackItemName or ''),
    item_label = itemLabel,
    source = trim(sourceLabel or 'server_useable_item'),
    metadata = cloneInventoryValue(metadata),
  }

  TriggerClientEvent('cad_bridge:showPrintedDocument', src, payload)
  return true
end

local function registerQbxPrintedDocumentUsable(itemName)
  if GetResourceState('qbx_core') ~= 'started' then
    return false, 'qbx_core_not_started'
  end

  local callback = function(sourceId, item)
    local opened = openPrintedDocumentForSource(sourceId, item, itemName, 'qbx_useable_item')
    if not opened then
      notifyAlert(tonumber(sourceId) or 0, 'CAD Document', 'This item is not a readable CAD printed document.', 'warning')
    end
  end

  local attempts = { 'CreateUseableItem', 'CreateUsableItem' }
  for _, fnName in ipairs(attempts) do
    local ok, result = pcall(function()
      local fn = exports.qbx_core and exports.qbx_core[fnName]
      if type(fn) ~= 'function' then return nil end
      return fn(itemName, callback)
    end)
    if ok and result ~= false then
      return true, ''
    end
  end

  return false, 'qbx_useable_registration_unavailable'
end

local function registerQbPrintedDocumentUsable(itemName)
  if GetResourceState('qb-core') ~= 'started' then
    return false, 'qb_core_not_started'
  end

  local okCore, core = pcall(function()
    return exports['qb-core']:GetCoreObject()
  end)
  if not okCore or not core or type(core.Functions) ~= 'table' then
    return false, 'qb_core_unavailable'
  end

  local createFn = core.Functions.CreateUseableItem or core.Functions.CreateUsableItem
  if type(createFn) ~= 'function' then
    return false, 'qb_core_create_useable_missing'
  end

  local okRegister, registerErr = pcall(function()
    createFn(itemName, function(sourceId, item)
      local opened = openPrintedDocumentForSource(sourceId, item, itemName, 'qb_useable_item')
      if not opened then
        notifyAlert(tonumber(sourceId) or 0, 'CAD Document', 'This item is not a readable CAD printed document.', 'warning')
      end
    end)
  end)
  if okRegister then
    return true, ''
  end
  return false, tostring(registerErr or 'qb_useable_registration_failed')
end

local function registerPrintedDocumentUsableItems()
  local itemNames = getPrintedDocumentItemNames()
  for _, itemName in ipairs(itemNames) do
    local qbxOk = false
    if GetResourceState('qbx_core') == 'started' then
      qbxOk = registerQbxPrintedDocumentUsable(itemName)
    end
    if not qbxOk and GetResourceState('qb-core') == 'started' then
      registerQbPrintedDocumentUsable(itemName)
    end
  end
end

AddEventHandler('onResourceStart', function(resourceName)
  if resourceName ~= GetCurrentResourceName()
    and resourceName ~= 'qbx_core'
    and resourceName ~= 'qb-core' then
    return
  end

  CreateThread(function()
    Wait(1000)
    registerPrintedDocumentUsableItems()
  end)
end)

CreateThread(function()
  Wait(1500)
  registerPrintedDocumentUsableItems()
end)

local function markPrintJobFailedRemote(jobId, err)
  request('POST', ('/api/integration/fivem/print-jobs/%s/failed'):format(tostring(jobId)), {
    error = err or 'Print job failed',
  }, function() end)
end

local function markPrintJobSentRemote(jobId)
  request('POST', ('/api/integration/fivem/print-jobs/%s/sent'):format(tostring(jobId)), {}, function() end)
end

local function clearActiveDocumentPrintJob(jobId, sourceId)
  local resolvedJobId = tonumber(jobId) or 0
  local resolvedSourceId = tonumber(sourceId) or 0

  if resolvedJobId > 0 then
    local existing = activeDocumentPrintJobsById[resolvedJobId]
    if existing and resolvedSourceId <= 0 then
      resolvedSourceId = tonumber(existing.source_id) or 0
    end
    activeDocumentPrintJobsById[resolvedJobId] = nil
  end

  if resolvedSourceId > 0 and tonumber(activeDocumentPrintJobIdBySource[resolvedSourceId]) == resolvedJobId then
    activeDocumentPrintJobIdBySource[resolvedSourceId] = nil
  end
end

local function startPrintedDocumentJob(job)
  local jobId = tonumber(job and job.id or 0) or 0
  if jobId <= 0 then return false, 'invalid_print_job', false end
  if activeDocumentPrintJobsById[jobId] then
    return false, 'print_already_active', true
  end

  local sourceId = resolvePlayerSourceForJob(job)
  if not sourceId or sourceId <= 0 then
    return false, 'Target character is not currently online for print delivery', true
  end
  if not GetPlayerName(sourceId) then
    return false, 'Target player not available for print delivery', true
  end

  local busyJobId = tonumber(activeDocumentPrintJobIdBySource[sourceId]) or 0
  if busyJobId > 0 and activeDocumentPrintJobsById[busyJobId] then
    return false, 'printer_busy', true
  end

  local minMs = math.max(5000, math.floor(tonumber(Config and Config.CadBridgePrintedDocumentProgressMinMs or 5000) or 5000))
  local maxMs = math.max(minMs, math.floor(tonumber(Config and Config.CadBridgePrintedDocumentProgressMaxMs or 10000) or 10000))
  local durationMs = minMs
  if maxMs > minMs then
    durationMs = math.random(minMs, maxMs)
  end

  local state = {
    job_id = jobId,
    source_id = sourceId,
    job = job,
    started_at_ms = nowMs(),
    duration_ms = durationMs,
  }
  activeDocumentPrintJobsById[jobId] = state
  activeDocumentPrintJobIdBySource[sourceId] = jobId

  TriggerClientEvent('cad_bridge:startPrintedDocumentJob', sourceId, {
    job_id = jobId,
    duration_ms = durationMs,
    title = trim(job.title or ''),
    description = trim(job.description or ''),
    document_subtype = trim(job.document_subtype or ''),
  })

  CreateThread(function()
    Wait(durationMs + 15000)
    local active = activeDocumentPrintJobsById[jobId]
    if not active then return end
    clearActiveDocumentPrintJob(jobId, active.source_id)
    markPrintJobFailedRemote(jobId, 'Client print confirmation timed out')
    print(('[cad_bridge] printed document job %s timed out for source %s'):format(tostring(jobId), tostring(sourceId)))
  end)

  return true, '', false
end

RegisterNetEvent('cad_bridge:documentPrintJobResult', function(payload)
  local src = tonumber(source) or 0
  if src <= 0 then return end

  local data = type(payload) == 'table' and payload or {}
  local jobId = tonumber(data.job_id or data.id or 0) or 0
  if jobId <= 0 then return end

  local active = activeDocumentPrintJobsById[jobId]
  if type(active) ~= 'table' then return end
  if tonumber(active.source_id or 0) ~= src then return end

  local ok = data.ok == true or tonumber(data.ok or 0) == 1
  local errText = trim(data.error or '')
  local job = active.job or {}

  clearActiveDocumentPrintJob(jobId, src)

  if not ok then
    markPrintJobFailedRemote(jobId, errText ~= '' and errText or 'Client cancelled print')
    if errText ~= '' then
      print(('[cad_bridge] printed document job %s cancelled by source %s: %s'):format(tostring(jobId), tostring(src), tostring(errText)))
    else
      print(('[cad_bridge] printed document job %s cancelled by source %s'):format(tostring(jobId), tostring(src)))
    end
    return
  end

  local playerObject = getQbxPlayerForInventory(src)
  if not playerObject then playerObject = getQbPlayerForInventory(src) end

  local itemName = choosePrintedDocumentItemName(job)
  local itemMetadata = buildPrintedDocumentMetadata(job)
  local addOk, addErr = addInventoryItemForJailRestore(src, {
    name = itemName,
    amount = 1,
    metadata = itemMetadata,
  }, playerObject)

  if not addOk then
    markPrintJobFailedRemote(jobId, addErr or 'Inventory add failed')
    print(('[cad_bridge] printed document job %s inventory add failed for source %s: %s'):format(
      tostring(jobId),
      tostring(src),
      tostring(addErr or 'Inventory add failed')
    ))
    return
  end

  markPrintJobSentRemote(jobId)
end)

local function captureAndClearJailInventory(sourceId, citizenId, context)
  if not isJailInventoryManagementEnabled() then
    return true, 'disabled'
  end
  local s = tonumber(sourceId) or 0
  if s <= 0 then return false, 'invalid_source' end

  local existing = jailInventorySnapshotsBySource[s]
  if type(existing) == 'table' and existing.restored ~= true then
    return true, 'already_captured'
  end

  if type(Config) == 'table' and type(Config.CadBridgeJailInventoryCaptureAndClear) == 'function' then
    local ok, snapshot, err = pcall(function()
      return Config.CadBridgeJailInventoryCaptureAndClear(s, trim(citizenId or ''), context or {})
    end)
    if not ok then
      return false, ('Custom inventory capture/clear callback failed: %s'):format(tostring(snapshot))
    end
    if snapshot == false then
      return false, trim(err or 'Custom inventory capture/clear callback returned false')
    end
    local normalizedSnapshot = normalizeInventorySnapshotItems(type(snapshot) == 'table' and snapshot or {})
    jailInventorySnapshotsBySource[s] = {
      source_id = s,
      citizen_id = trim(citizenId or ''),
      items = normalizedSnapshot,
      captured_at_ms = nowMs(),
      restored = false,
      adapter = 'custom',
    }
    return true, ''
  end

  local playerObject = getQbxPlayerForInventory(s)
  if not playerObject then
    playerObject = getQbPlayerForInventory(s)
  end

  local snapshotItems = getSnapshotItemsFromPlayerData(playerObject)
  local adapterLabel = playerObject and 'framework_player' or ''
  if snapshotItems == nil then
    snapshotItems = getSnapshotItemsFromOxInventory(s)
    if snapshotItems ~= nil then
      adapterLabel = 'ox_inventory'
    end
  end
  if snapshotItems == nil then
    return false, 'No supported inventory snapshot adapter available'
  end

  local cleared, clearErr = clearInventoryForJail(s, playerObject)
  if not cleared then
    return false, clearErr or 'Inventory clear failed'
  end

  jailInventorySnapshotsBySource[s] = {
    source_id = s,
    citizen_id = trim(citizenId or ''),
    items = snapshotItems,
    captured_at_ms = nowMs(),
    restored = false,
    adapter = adapterLabel,
  }
  return true, ''
end

local function restoreJailInventoryForSource(sourceId, citizenId, context)
  if not isJailInventoryManagementEnabled() then
    return true, 'disabled'
  end
  local s = tonumber(sourceId) or 0
  if s <= 0 then return false, 'invalid_source' end

  local snapshot = jailInventorySnapshotsBySource[s]
  if type(snapshot) ~= 'table' then
    return false, 'no_snapshot'
  end

  local expectedCitizen = trim(citizenId or '')
  local storedCitizen = trim(snapshot.citizen_id or '')
  if expectedCitizen ~= '' and storedCitizen ~= '' then
    local normalizedExpected = type(normalizeCitizenId) == 'function' and normalizeCitizenId(expectedCitizen) or expectedCitizen:lower()
    local normalizedStored = type(normalizeCitizenId) == 'function' and normalizeCitizenId(storedCitizen) or storedCitizen:lower()
    if normalizedExpected ~= normalizedStored then
      return false, 'citizen_mismatch'
    end
  end

  if type(Config) == 'table' and type(Config.CadBridgeJailInventoryRestore) == 'function' then
    local ok, result, err = pcall(function()
      return Config.CadBridgeJailInventoryRestore(s, storedCitizen, cloneInventoryValue(snapshot.items), context or {})
    end)
    if not ok then
      return false, ('Custom inventory restore callback failed: %s'):format(tostring(result))
    end
    if result == false then
      return false, trim(err or 'Custom inventory restore callback returned false')
    end
    jailInventorySnapshotsBySource[s] = nil
    return true, ''
  end

  local playerObject = getQbxPlayerForInventory(s)
  if not playerObject then
    playerObject = getQbPlayerForInventory(s)
  end

  local _clearedBeforeRestore = clearInventoryForJail(s, playerObject)
  local restoreErrors = {}
  local restoredCount = 0
  for _, item in ipairs(type(snapshot.items) == 'table' and snapshot.items or {}) do
    local ok, err = addInventoryItemForJailRestore(s, item, playerObject)
    if ok then
      restoredCount = restoredCount + 1
    else
      restoreErrors[#restoreErrors + 1] = tostring(err or ('failed:' .. tostring(item.name or '?')))
    end
  end

  if #restoreErrors > 0 then
    return false, ('restore_failed (%s restored, %s errors): %s')
      :format(tostring(restoredCount), tostring(#restoreErrors), table.concat(restoreErrors, '; '))
  end

  jailInventorySnapshotsBySource[s] = nil
  return true, ''
end

RegisterNetEvent('cad_bridge:jailInventoryRestoreRequest', function(payload)
  local src = tonumber(source) or 0
  if src <= 0 then return end

  local currentCitizen = trim(getCitizenId(src) or '')
  local requestedCitizen = trim(type(payload) == 'table' and (payload.citizen_id or payload.citizenId) or '')
  local citizenForRestore = currentCitizen ~= '' and currentCitizen or requestedCitizen

  local ok, err = restoreJailInventoryForSource(src, citizenForRestore, type(payload) == 'table' and payload or {})
  if not ok then
    if err ~= 'no_snapshot' and err ~= 'disabled' then
      print(('[cad_bridge] Jail inventory restore failed for source %s (cid=%s): %s')
        :format(tostring(src), tostring(citizenForRestore), tostring(err)))
      notifyAlert(src, 'CAD Jail', 'Inventory could not be restored automatically. Contact staff.', 'warning')
    end
    return
  end

  notifyAlert(src, 'CAD Jail', 'Your inventory has been restored.', 'success')
end)

AddEventHandler('playerDropped', function(_reason)
  local src = tonumber(source) or 0
  if src > 0 then
    jailInventorySnapshotsBySource[src] = nil
  end
end)

local function applyJail(job)
  local adapter = trim(Config.JailAdapter or 'wasabi'):lower()
  if adapter == '' then adapter = 'wasabi' end
  if adapter == 'xtprison' then
    adapter = 'xt-prison'
  end
  if adapter == 'none' then
    return false, 'Jail adapter disabled (Config.JailAdapter=none)', false
  end

  local citizenId = trim(job.citizen_id or '')
  local minutes = math.max(0, math.floor(tonumber(job.jail_minutes or job.minutes or 0) or 0))
  local reason = trim(job.reason or '')
  if citizenId == '' then
    return false, 'Jail citizen_id is empty', false
  end
  if minutes <= 0 then
    return false, 'Jail minutes must be greater than 0', false
  end

  local sourceId = resolveFineSource(job, citizenId)
  if not sourceId then
    return false, 'Target character is not currently online', true
  end

  if adapter == 'cad-bridge' or adapter == 'cad_bridge' or adapter == 'cad' then
    local releasePoints = type(Config.CadBridgeJailReleasePoints) == 'table' and Config.CadBridgeJailReleasePoints or {}
    local spawnPoints = {}
    if type(Config.CadBridgeJailSpawnPoints) == 'table' and #Config.CadBridgeJailSpawnPoints > 0 then
      spawnPoints = Config.CadBridgeJailSpawnPoints
    elseif type(Config.Spawns) == 'table' and #Config.Spawns > 0 then
      spawnPoints = Config.Spawns
    end

    local inventoryOk, inventoryErr = captureAndClearJailInventory(sourceId, citizenId, {
      citizen_id = citizenId,
      jail_minutes = minutes,
      reason = reason,
      job_id = tonumber(job and job.id) or 0,
    })
    if not inventoryOk and trim(inventoryErr or '') ~= '' then
      print(('[cad_bridge] Jail inventory capture/clear failed for source %s (cid=%s): %s')
        :format(tostring(sourceId), tostring(citizenId), tostring(inventoryErr)))
    end

    TriggerClientEvent('cad_bridge:jailSentenceStart', sourceId, {
      minutes = minutes,
      reason = reason,
      citizen_id = citizenId,
      release_points = releasePoints,
      spawn_points = spawnPoints,
      issued_at = os.time(),
    })

    local message = ('You have been sentenced to %s minute(s)'):format(tostring(minutes))
    if reason ~= '' then
      message = message .. (' | %s'):format(reason)
    end
    notifyAlert(sourceId, 'CAD Sentence', message, 'error')
    return true, '', false
  end

  if adapter == 'xt-prison' then
    if GetResourceState('xt-prison') ~= 'started' then
      return false, 'xt-prison is not started', false
    end

    if type(lib) ~= 'table' or type(lib.callback) ~= 'table' or type(lib.callback.await) ~= 'function' then
      return false, 'ox_lib lib.callback.await is unavailable for xt-prison adapter', false
    end

    local callbackOk, callbackResult = pcall(function()
      return lib.callback.await('xt-prison:client:enterJail', sourceId, minutes)
    end)
    if not callbackOk then
      return false, ('xt-prison callback failed: %s'):format(tostring(callbackResult)), false
    end
    if not callbackResult then
      return false, ('xt-prison callback returned %s'):format(tostring(callbackResult)), false
    end

    lib.notify(sourceId, {
      title = 'Sent Player to Jail'
    })
    return true, '', false
  end

  if adapter == 'wasabi' then
    if GetResourceState('wasabi_police') ~= 'started' then
      return false, 'wasabi_police is not started', false
    end

    local attempts = {}
    local function recordAttempt(label, ok, err)
      if ok then
        attempts[#attempts + 1] = ('%s -> ok'):format(label)
      else
        attempts[#attempts + 1] = ('%s -> %s'):format(label, tostring(err or 'failed'))
      end
      return ok
    end

    -- For exports: only treat an explicit true return as success.
    -- wasabi_police exports return true on success; nil means the export
    -- ran but did nothing (wrong signature, wrong version, etc.).
    local function invokeExport(label, fn)
      local ok, result = pcall(fn)
      if not ok then
        return recordAttempt(label, false, result)
      end
      if result ~= true then
        return recordAttempt(label, false, result == false and 'returned false' or 'returned nil')
      end
      return recordAttempt(label, true)
    end

    -- For server/client events: Lua events never return a value, so we
    -- fire the event and treat a clean pcall as success. Only reached
    -- when all export variants have already failed.
    local function invokeEvent(label, fn)
      local ok, err = pcall(fn)
      if not ok then
        return recordAttempt(label, false, err)
      end
      return recordAttempt(label, true)
    end

    local invoked = false

    -- Try wasabi export variants first as these do not rely on event "source" context.
    local exportAttempts = {
      {
        label = 'exports.wasabi_police:sendToJail(source, minutes, reason)',
        fn = function()
          return exports.wasabi_police:sendToJail(sourceId, minutes, reason)
        end,
      },
      {
        label = 'exports.wasabi_police:sendToJail(source, minutes)',
        fn = function()
          return exports.wasabi_police:sendToJail(sourceId, minutes)
        end,
      },
      {
        label = 'exports.wasabi_police:SendToJail(source, minutes, reason)',
        fn = function()
          return exports.wasabi_police:SendToJail(sourceId, minutes, reason)
        end,
      },
      {
        label = 'exports.wasabi_police:SendToJail(source, minutes)',
        fn = function()
          return exports.wasabi_police:SendToJail(sourceId, minutes)
        end,
      },
    }

    for _, adapterTry in ipairs(exportAttempts) do
      if invokeExport(adapterTry.label, adapterTry.fn) then
        invoked = true
        break
      end
    end

    if not invoked then
      local eventAttempts = {
        {
          label = 'TriggerEvent wasabi_police:server:sendToJail(source, minutes)',
          fn = function()
            TriggerEvent('wasabi_police:server:sendToJail', sourceId, minutes)
          end,
        },
        {
          label = 'TriggerEvent wasabi_police:server:sendToJail(source, minutes, reason)',
          fn = function()
            TriggerEvent('wasabi_police:server:sendToJail', sourceId, minutes, reason)
          end,
        },
        {
          label = 'TriggerEvent wasabi_police:qbPrisonJail(source, minutes)',
          fn = function()
            TriggerEvent('wasabi_police:qbPrisonJail', sourceId, minutes)
          end,
        },
        {
          label = 'TriggerClientEvent wasabi_police:jailPlayer(source, minutes)',
          fn = function()
            TriggerClientEvent('wasabi_police:jailPlayer', sourceId, minutes)
          end,
        },
        {
          label = 'TriggerClientEvent wasabi_police:jailPlayer(source, minutes, reason)',
          fn = function()
            TriggerClientEvent('wasabi_police:jailPlayer', sourceId, minutes, reason)
          end,
        },
        {
          label = 'TriggerEvent wasabi_police:sendToJail(source, minutes)',
          fn = function()
            TriggerEvent('wasabi_police:sendToJail', sourceId, minutes)
          end,
        },
        {
          label = 'TriggerEvent wasabi_police:sendToJail(source, minutes, reason)',
          fn = function()
            TriggerEvent('wasabi_police:sendToJail', sourceId, minutes, reason)
          end,
        },
      }

      for _, eventTry in ipairs(eventAttempts) do
        if invokeEvent(eventTry.label, eventTry.fn) then
          invoked = true
          break
        end
      end
    end
    if not invoked then
      return false, table.concat(attempts, ' | '), false
    end

    local message = ('You have been sentenced to %s minute(s)'):format(tostring(minutes))
    if reason ~= '' then
      message = message .. (' | %s'):format(reason)
    end
    notifyAlert(sourceId, 'CAD Sentence', message, 'error')
    return true, '', false
  end

  if adapter == 'command' then
    local cmdTemplate = tostring(Config.JailCommandTemplate or '')
    if cmdTemplate == '' then
      return false, 'Jail command template is empty', false
    end

    local commandName = cmdTemplate:match('^%s*([^%s]+)') or ''
    if commandName == '' then
      return false, 'Jail command template has no command name', false
    end
    if not commandExists(commandName) then
      return false, ('Jail command not registered: %s'):format(commandName), false
    end

    local cmd = cmdTemplate
    cmd = cmd:gsub('{source}', shellEscape(sourceId))
    cmd = cmd:gsub('{citizenid}', shellEscape(citizenId))
    cmd = cmd:gsub('{minutes}', shellEscape(minutes))
    cmd = cmd:gsub('{reason}', shellEscape(reason))
    ExecuteCommand(cmd)

    local message = ('You have been sentenced to %s minute(s)'):format(tostring(minutes))
    if reason ~= '' then
      message = message .. (' | %s'):format(reason)
    end
    notifyAlert(sourceId, 'CAD Sentence', message, 'error')
    return true, '', false
  end

  return false, ('Unknown jail adapter: %s'):format(tostring(adapter)), false
end

local printJobPollInFlight = false
pollPrintJobs = function()
  if not hasBridgeConfig() then
    return
  end
  if printJobPollInFlight or isBridgeBackoffActive('print_job_poll') then
    return
  end

  printJobPollInFlight = true
  request('GET', '/api/integration/fivem/print-jobs?limit=25', nil, function(status, body, responseHeaders)
    printJobPollInFlight = false
    if status == 429 then
      setBridgeBackoff('print_job_poll', responseHeaders, 5000, 'print job poll')
      return
    end
    if status ~= 200 then
      return
    end

    local ok, jobs = pcall(json.decode, body)
    if not ok or type(jobs) ~= 'table' then
      return
    end

    for _, job in ipairs(jobs) do
      CreateThread(function()
        local success, err, transient = startPrintedDocumentJob(job)
        if success then
          return
        end
        if transient then
          return
        end
        markPrintJobFailedRemote(job.id, err or 'Print delivery failed')
      end)
    end
  end)
end

CreateThread(function()
  while true do
    Wait(math.max(500, tonumber(Config.PrintDocumentPollIntervalMs) or 2000))
    pollPrintJobs()
  end
end)

local jailPollInFlight = false
pollJailJobs = function()
  if not hasBridgeConfig() then
    return
  end
  if jailPollInFlight or isBridgeBackoffActive('jail_poll') then
    return
  end

  jailPollInFlight = true
  request('GET', '/api/integration/fivem/jail-jobs?limit=25', nil, function(status, body, responseHeaders)
    jailPollInFlight = false
    if status == 429 then
      setBridgeBackoff('jail_poll', responseHeaders, 10000, 'jail poll')
      return
    end
    if status ~= 200 then
      return
    end

    local ok, jobs = pcall(json.decode, body)
    if not ok or type(jobs) ~= 'table' then
      return
    end

    for _, job in ipairs(jobs) do
      -- Spawn a thread so lib.callback.await can yield (PerformHttpRequest callbacks are non-yieldable).
      CreateThread(function()
        local success, err, transient = applyJail(job)
        if success then
          request('POST', ('/api/integration/fivem/jail-jobs/%s/sent'):format(tostring(job.id)), {}, function() end)
        elseif transient then
          -- Keep pending and retry when the target character is online.
        else
          request('POST', ('/api/integration/fivem/jail-jobs/%s/failed'):format(tostring(job.id)), {
            error = err or 'Jail adapter failed',
          }, function() end)
        end
      end)
    end
  end)
end

CreateThread(function()
  while true do
    Wait(math.max(2000, Config.JailPollIntervalMs or 7000))
    pollJailJobs()
  end
end)

local wraithLookupCooldownBySource = {}
local wraithEmergencyPlateCacheByPlate = {}

local function normalizePlateKey(value)
  return trim(value):upper():gsub('[^A-Z0-9]', '')
end

local function isEmergencyPlatePrefix(plateKey)
  local normalizedPlate = normalizePlateKey(plateKey)
  if normalizedPlate == '' then return false end
  local prefixes = type(Config.WraithEmergencyPlatePrefixes) == 'table' and Config.WraithEmergencyPlatePrefixes or {}
  for _, rawPrefix in ipairs(prefixes) do
    local prefix = normalizePlateKey(rawPrefix)
    if prefix ~= '' and normalizedPlate:sub(1, #prefix) == prefix then
      return true
    end
  end
  return false
end

local function isConfiguredEmergencyVehicleClass(classId)
  local classNum = tonumber(classId)
  if not classNum then return false end
  local classes = type(Config.WraithEmergencyVehicleClasses) == 'table' and Config.WraithEmergencyVehicleClasses or { 18 }
  for _, rawClass in ipairs(classes) do
    if tonumber(rawClass) == classNum then
      return true
    end
  end
  return false
end

local function isEmergencyVehicleEntity(vehicle)
  if not vehicle or vehicle == 0 then return false end
  if type(DoesEntityExist) == 'function' and not DoesEntityExist(vehicle) then return false end

  local model = 0
  if type(GetEntityModel) == 'function' then
    local okModel, value = pcall(GetEntityModel, vehicle)
    if okModel and tonumber(value) then
      model = tonumber(value) or 0
    end
  end

  if model ~= 0 and type(IsThisModelAPoliceVehicle) == 'function' then
    local okPolice, isPolice = pcall(IsThisModelAPoliceVehicle, model)
    if okPolice and isPolice == true then
      return true
    end
  end

  if type(GetVehicleClass) == 'function' then
    local okClass, classId = pcall(GetVehicleClass, vehicle)
    if okClass and isConfiguredEmergencyVehicleClass(classId) then
      return true
    end
  end

  if model ~= 0 and type(GetVehicleClassFromName) == 'function' then
    local okClassFromName, classId = pcall(GetVehicleClassFromName, model)
    if okClassFromName and isConfiguredEmergencyVehicleClass(classId) then
      return true
    end
  end

  return false
end

local function isEmergencyVehiclePlateInWorld(plateKey)
  local normalizedPlate = normalizePlateKey(plateKey)
  if normalizedPlate == '' then return false end

  local now = nowMs()
  local cached = wraithEmergencyPlateCacheByPlate[normalizedPlate]
  if type(cached) == 'table' and (tonumber(cached.expires_at_ms) or 0) > now then
    return cached.is_emergency == true
  end

  local matchedVehicles = 0
  local foundEmergency = false
  local foundNonEmergency = false

  if type(GetAllVehicles) == 'function' and type(GetVehicleNumberPlateText) == 'function' then
    local okVehicles, vehicles = pcall(GetAllVehicles)
    if okVehicles and type(vehicles) == 'table' then
      for _, vehicle in ipairs(vehicles) do
        if vehicle and vehicle ~= 0 then
          local okPlate, vehiclePlate = pcall(GetVehicleNumberPlateText, vehicle)
          if okPlate then
            local vehiclePlateKey = normalizePlateKey(vehiclePlate)
            if vehiclePlateKey ~= '' and vehiclePlateKey == normalizedPlate then
              matchedVehicles = matchedVehicles + 1
              if isEmergencyVehicleEntity(vehicle) then
                foundEmergency = true
              else
                foundNonEmergency = true
              end
              if foundEmergency and foundNonEmergency then
                break
              end
            end
          end
        end
      end
    end
  end

  local isEmergency = matchedVehicles > 0 and foundEmergency and not foundNonEmergency
  wraithEmergencyPlateCacheByPlate[normalizedPlate] = {
    is_emergency = isEmergency,
    expires_at_ms = now + 2000,
  }
  return isEmergency
end

local function shouldIgnoreWraithPlateLookup(plateKey)
  if Config.WraithIgnoreEmergencyVehicles ~= true then
    return false
  end
  if isEmergencyPlatePrefix(plateKey) then
    return true
  end
  if isEmergencyVehiclePlateInWorld(plateKey) then
    return true
  end
  return false
end

local function valueHasSeatbeltKeyword(value)
  local text = trim(value):lower()
  if text == '' then return false end
  if text:find('seatbelt', 1, true) then return true end
  if text:find('seat belt', 1, true) then return true end
  if text:find('unbuckled', 1, true) then return true end
  if text:find('without seatbelt', 1, true) then return true end
  if text:find('no seatbelt', 1, true) then return true end
  return false
end

local function tableHasSeatbeltKeyword(value)
  if type(value) ~= 'table' then return false end
  for _, nested in pairs(value) do
    if type(nested) == 'table' then
      if tableHasSeatbeltKeyword(nested) then
        return true
      end
    elseif valueHasSeatbeltKeyword(nested) then
      return true
    end
  end
  return false
end

local function payloadIndicatesSeatbeltAlert(payload)
  if type(payload) ~= 'table' then return false end

  local directCandidates = {
    payload.alert_type,
    payload.alertType,
    payload.type,
    payload.reason,
    payload.violation,
    payload.violation_type,
    payload.violationType,
    payload.offense,
    payload.offence,
    payload.status,
    payload.message,
    payload.description,
  }
  for _, candidate in ipairs(directCandidates) do
    if valueHasSeatbeltKeyword(candidate) then
      return true
    end
  end

  local nestedCandidates = {
    payload.flags,
    payload.alert_flags,
    payload.violations,
    payload.alerts,
    payload.reasons,
  }
  for _, candidate in ipairs(nestedCandidates) do
    if tableHasSeatbeltKeyword(candidate) then
      return true
    end
  end

  return false
end

local function payloadIndicatesEmergencyVehicle(payload)
  if type(payload) ~= 'table' then return false end

  local booleanCandidates = {
    payload.is_emergency,
    payload.isEmergency,
    payload.emergency_vehicle,
    payload.emergencyVehicle,
  }
  for _, candidate in ipairs(booleanCandidates) do
    if candidate == true then
      return true
    end
    local numeric = tonumber(candidate)
    if numeric and numeric ~= 0 then
      return true
    end
    local text = trim(candidate):lower()
    if text == 'true' or text == 'yes' then
      return true
    end
  end

  local classCandidates = {
    payload.vehicle_class,
    payload.vehicleClass,
    payload.class_id,
    payload.classId,
    payload.class,
  }
  for _, candidate in ipairs(classCandidates) do
    if isConfiguredEmergencyVehicleClass(candidate) then
      return true
    end
  end

  local plateCandidates = {
    payload.plate,
    payload.license_plate,
    payload.licensePlate,
  }
  for _, candidate in ipairs(plateCandidates) do
    if isEmergencyPlatePrefix(candidate) then
      return true
    end
  end

  return false
end

local function normalizeVehicleCodeToken(value)
  return trim(value):lower():gsub('[^a-z0-9]', '')
end

local function isIgnoredSeatbeltVehicleCode(code)
  local normalized = normalizeVehicleCodeToken(code)
  if normalized == '' then return false end

  local configured = type(Config.WraithSeatbeltIgnoredVehicleCodes) == 'table'
    and Config.WraithSeatbeltIgnoredVehicleCodes
    or { 'sprinter19', 'sprinter19b', 'pumpertanker', 'hinorescue', 'scaniahp' }
  for _, raw in ipairs(configured) do
    if normalizeVehicleCodeToken(raw) == normalized then
      return true
    end
  end
  return false
end

local function payloadHasIgnoredSeatbeltVehicleCode(payload)
  if type(payload) ~= 'table' then return false end

  local configured = type(Config.WraithSeatbeltIgnoredVehicleCodes) == 'table'
    and Config.WraithSeatbeltIgnoredVehicleCodes
    or { 'sprinter19', 'sprinter19b', 'pumpertanker', 'hinorescue', 'scaniahp' }

  local candidates = {
    payload.vehicle_model,
    payload.vehicleModel,
    payload.model,
    payload.vehicle,
    payload.display_name,
    payload.displayName,
    payload.message,
    payload.description,
  }

  for _, candidate in ipairs(candidates) do
    local normalized = normalizeVehicleCodeToken(candidate)
    if normalized == '' then
      goto continue
    end

    if isIgnoredSeatbeltVehicleCode(normalized) then
      return true
    end

    for _, raw in ipairs(configured) do
      local ignoredCode = normalizeVehicleCodeToken(raw)
      if ignoredCode ~= '' and normalized:find(ignoredCode, 1, true) then
        return true
      end
    end

    ::continue::
  end

  return false
end

local function shouldIgnoreWraithSeatbeltAlert(plateKey, payload)
  if Config.WraithIgnoreEmergencySeatbeltAlerts ~= true then
    return false
  end
  if not payloadIndicatesSeatbeltAlert(payload) then
    return false
  end
  if payloadHasIgnoredSeatbeltVehicleCode(payload) then
    return true
  end
  if payloadIndicatesEmergencyVehicle(payload) then
    return true
  end
  if isEmergencyPlatePrefix(plateKey) then
    return true
  end
  if isEmergencyVehiclePlateInWorld(plateKey) then
    return true
  end
  return false
end

local function shouldThrottleWraithLookup(source, plateKey)
  local src = tonumber(source) or 0
  if src <= 0 or plateKey == '' then return true end
  local cooldownMs = math.max(250, math.floor(tonumber(Config.WraithLookupCooldownMs) or 8000))
  local now = nowMs()
  local cache = wraithLookupCooldownBySource[src]
  if type(cache) ~= 'table' then
    cache = {}
    wraithLookupCooldownBySource[src] = cache
  end

  local blockedUntil = tonumber(cache[plateKey] or 0) or 0
  if blockedUntil > now then
    return true
  end

  cache[plateKey] = now + cooldownMs
  return false
end

local function lookupWraithPlateStatus(source, camera, plateRaw)
  if Config.WraithCadLookupEnabled ~= true then return end
  if not hasBridgeConfig() then return end
  if isBridgeBackoffActive('wraith_plate_lookup') then return end

  local src = tonumber(source) or 0
  if src <= 0 then return end
  if not GetPlayerName(src) then return end

  local plateKey = normalizePlateKey(plateRaw)
  if plateKey == '' then return end
  if shouldIgnoreWraithPlateLookup(plateKey) then return end
  if shouldThrottleWraithLookup(src, plateKey) then return end

  request('GET', '/api/integration/fivem/plate-status/' .. urlEncode(plateKey), nil, function(status, body, responseHeaders)
    if status == 429 then
      setBridgeBackoff('wraith_plate_lookup', responseHeaders, 5000, 'wraith plate lookup')
      return
    end
    if status ~= 200 then
      return
    end

    local ok, payload = pcall(json.decode, body or '{}')
    if not ok or type(payload) ~= 'table' then
      return
    end
    if payload.alert ~= true then
      return
    end
    if shouldIgnoreWraithSeatbeltAlert(plateKey, payload) then
      return
    end

    local cam = trim(camera):lower()
    local camLabel = cam == 'rear' and 'Rear LPR' or 'Front LPR'
    local plate = trim(payload.plate or plateKey)
    local statusText = trim(payload.message or '')
    local model = trim(payload.vehicle_model or '')
    local owner = trim(payload.owner_name or '')
    local boloFlags = {}
    if type(payload.bolo_flags) == 'table' then
      for _, rawFlag in ipairs(payload.bolo_flags) do
        local normalized = trim(rawFlag):lower()
        if normalized ~= '' then
          local pretty = normalized:gsub('_', ' ')
          pretty = pretty:gsub('(%a)([%w_]*)', function(first, rest)
            return string.upper(first) .. string.lower(rest)
          end)
          boloFlags[#boloFlags + 1] = pretty
        end
      end
    end

    local details = {}
    if statusText ~= '' then details[#details + 1] = statusText end
    if model ~= '' then details[#details + 1] = model end
    if owner ~= '' then details[#details + 1] = owner end
    local statusHasBolo = statusText:lower():find('bolo', 1, true) ~= nil
    if payload.bolo_alert == true then
      if #boloFlags > 0 and not statusHasBolo then
        details[#details + 1] = 'BOLO: ' .. table.concat(boloFlags, ', ')
      elseif #boloFlags == 0 and not statusHasBolo then
        details[#details + 1] = 'BOLO match'
      end
    end

    local message = ('%s hit: %s'):format(camLabel, plate)
    if #details > 0 then
      message = message .. ' | ' .. table.concat(details, ' | ')
    end

    local severity = (payload.registration_status == 'unregistered' and payload.bolo_alert ~= true) and 'warning' or 'error'
    notifyAlert(src, 'CAD Plate Alert', message, severity)
  end)
end

RegisterNetEvent('wk:onPlateScanned', function(camera, plate, _index)
  local src = source
  if not src or src == 0 then return end
  lookupWraithPlateStatus(src, camera, plate)
end)

RegisterNetEvent('wk:onPlateLocked', function(camera, plate, _index)
  local src = source
  if not src or src == 0 then return end
  lookupWraithPlateStatus(src, camera, plate)
end)

AddEventHandler('playerDropped', function()
  local src = source
  wraithLookupCooldownBySource[src] = nil
  wraithEmergencyPlateCacheByPlate = {}
  autoAmbulanceCallStateBySource[src] = nil
  activeCallPromptBySource[src] = nil
  lastDiscordJobRoleSyncAtMsBySource[src] = nil
  lastDiscordJobRoleSyncSignatureBySource[src] = nil
end)
