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

local function triggerNotify(payload)
  if type(util.triggerCadOxNotify) == 'function' then
    return util.triggerCadOxNotify(payload)
  end
  return false
end

local function notifyEmergencyUiIssue(message)
  local text = tostring(message or 'Unable to open the 000 UI right now.')
  if triggerNotify({
    title = 'CAD Dispatch',
    description = text,
    type = 'warning',
  }) then
    return
  end
  print(('[cad_bridge] %s'):format(text))
end

local function setEmergencyUiVisible(isVisible, payload)
  local visible = isVisible == true
  state.emergencyUiOpen = visible

  if visible then
    state.emergencyUiAwaitingOpenAck = true
    state.emergencyUiOpenedAtMs = tonumber(GetGameTimer() or 0) or 0
    SetNuiFocus(true, true)
    Wait(10)
    SetNuiFocus(true, true)

    SendNUIMessage({
      action = 'cadBridge000:open',
      payload = payload or {},
    })
    Wait(10)
    SendNUIMessage({
      action = 'cadBridge000:open',
      payload = payload or {},
    })
  else
    state.emergencyUiAwaitingOpenAck = false
    state.emergencyUiOpenedAtMs = 0
    if type(ui.refreshCadBridgeNuiFocus) == 'function' then
      ui.refreshCadBridgeNuiFocus()
    else
      SetNuiFocus(false, false)
    end
    SendNUIMessage({
      action = 'cadBridge000:close',
      payload = {},
    })
  end
end

local function sanitizeEmergencyDepartments(departments)
  local out = {}
  if type(departments) ~= 'table' then return out end

  for _, dept in ipairs(departments) do
    local id = tonumber(dept.id)
    if id and id > 0 then
      out[#out + 1] = {
        id = math.floor(id),
        name = trim(dept.name or ('Department #' .. tostring(id))),
        short_name = trim(dept.short_name or ''),
        color = trim(dept.color or ''),
      }
    end
  end

  return out
end

local function closeEmergencyPopup()
  if not state.emergencyUiOpen then return end
  setEmergencyUiVisible(false, {})
end
ui.closeEmergencyPopup = closeEmergencyPopup

local function setTrafficStopUiVisible(isVisible, payload)
  local visible = isVisible == true
  state.trafficStopUiOpen = visible

  if visible then
    state.trafficStopUiAwaitingOpenAck = true
    state.trafficStopUiOpenedAtMs = tonumber(GetGameTimer() or 0) or 0
    SetNuiFocus(true, true)
    Wait(10)
    SetNuiFocus(true, true)

    SendNUIMessage({
      action = 'cadBridgeTrafficStop:open',
      payload = payload or {},
    })
    Wait(10)
    SendNUIMessage({
      action = 'cadBridgeTrafficStop:open',
      payload = payload or {},
    })
  else
    state.trafficStopUiAwaitingOpenAck = false
    state.trafficStopUiOpenedAtMs = 0
    if type(ui.refreshCadBridgeNuiFocus) == 'function' then
      ui.refreshCadBridgeNuiFocus()
    else
      SetNuiFocus(false, false)
    end
    SendNUIMessage({
      action = 'cadBridgeTrafficStop:close',
      payload = {},
    })
  end
end

local function closeTrafficStopPopup()
  if not state.trafficStopUiOpen then return end
  setTrafficStopUiVisible(false, {})
end
ui.closeTrafficStopPopup = closeTrafficStopPopup

local activePrintedDocumentJob = nil

local function drawPrintProgressText(x, y, scale, text, centered, r, g, b, a)
  SetTextFont(4)
  SetTextScale(scale, scale)
  SetTextColour(r or 255, g or 255, b or 255, a or 255)
  SetTextDropShadow()
  SetTextOutline()
  if centered then
    SetTextCentre(true)
  else
    SetTextCentre(false)
  end
  BeginTextCommandDisplayText('STRING')
  AddTextComponentSubstringPlayerName(tostring(text or ''))
  EndTextCommandDisplayText(x + 0.0, y + 0.0)
end

local function drawPrintedDocumentProgress(job)
  if type(job) ~= 'table' then return end
  local startMs = tonumber(job.started_at_ms) or tonumber(GetGameTimer() or 0) or 0
  local durationMs = math.max(1000, tonumber(job.duration_ms) or 5000)
  local title = trim(job.title or '')
  local subtype = trim(job.document_subtype or '')
  local subtitle = subtype ~= '' and subtype:gsub('_', ' ') or 'document'
  subtitle = subtitle:gsub('(%a)([%w]*)', function(first, rest)
    return string.upper(first) .. string.lower(rest)
  end)

  while activePrintedDocumentJob and tonumber(activePrintedDocumentJob.job_id or 0) == tonumber(job.job_id or 0) do
    Wait(0)
    local nowMs = tonumber(GetGameTimer() or 0) or 0
    local elapsed = math.max(0, nowMs - startMs)
    local progress = math.min(1.0, elapsed / durationMs)

    local x = 0.5
    local y = 0.89
    local width = 0.32
    local height = 0.016

    DrawRect(x, y - 0.02, width + 0.02, 0.075, 6, 10, 18, 205)
    DrawRect(x, y + 0.004, width, height, 26, 33, 47, 230)
    DrawRect(x - (width / 2) + ((width * progress) / 2), y + 0.004, width * progress, height, 0, 92, 214, 235)

    local pulseWidth = 0.03
    local pulseX = x - (width / 2) + (width * progress)
    if progress > 0 and progress < 1 then
      DrawRect(pulseX, y + 0.004, pulseWidth, height * 0.9, 255, 255, 255, 45)
    end

    drawPrintProgressText(x, y - 0.047, 0.33, 'Printing CAD Document', true, 255, 255, 255, 235)
    if title ~= '' then
      drawPrintProgressText(x, y - 0.028, 0.26, title, true, 226, 234, 247, 235)
    else
      drawPrintProgressText(x, y - 0.028, 0.26, ('Printed ' .. subtitle), true, 226, 234, 247, 235)
    end
    drawPrintProgressText(x, y + 0.026, 0.22, ('%s%% • %s'):format(tostring(math.floor(progress * 100)), subtitle), true, 200, 211, 228, 235)

    if progress >= 1.0 then
      break
    end
  end
end

RegisterNetEvent('cad_bridge:startPrintedDocumentJob', function(payload)
  local data = type(payload) == 'table' and payload or {}
  local jobId = tonumber(data.job_id or data.id or 0) or 0
  if jobId <= 0 then return end

  if activePrintedDocumentJob then
    TriggerServerEvent('cad_bridge:documentPrintJobResult', {
      job_id = jobId,
      ok = false,
      error = 'printer_busy',
    })
    return
  end

  activePrintedDocumentJob = {
    job_id = jobId,
    started_at_ms = tonumber(GetGameTimer() or 0) or 0,
    duration_ms = math.max(1000, tonumber(data.duration_ms) or 5000),
    title = trim(data.title or ''),
    description = trim(data.description or ''),
    document_subtype = trim(data.document_subtype or ''),
  }

  -- Printing uses the on-screen progress bar only (no ox_lib popup notifications).

  CreateThread(function()
    local job = activePrintedDocumentJob
    if not job or tonumber(job.job_id or 0) ~= jobId then return end

    drawPrintedDocumentProgress(job)

    if activePrintedDocumentJob and tonumber(activePrintedDocumentJob.job_id or 0) == jobId then
      activePrintedDocumentJob = nil
      TriggerServerEvent('cad_bridge:documentPrintJobResult', {
        job_id = jobId,
        ok = true,
      })
    end
  end)
end)

local function setPrintedDocumentUiVisible(isVisible, payload)
  local visible = isVisible == true
  state.printedDocumentUiOpen = visible

  if visible then
    SetNuiFocus(true, true)
    Wait(10)
    SetNuiFocus(true, true)
    SendNUIMessage({
      action = 'cadBridgePrintedDoc:open',
      payload = payload or {},
    })
    Wait(10)
    SendNUIMessage({
      action = 'cadBridgePrintedDoc:open',
      payload = payload or {},
    })
  else
    if type(ui.refreshCadBridgeNuiFocus) == 'function' then
      ui.refreshCadBridgeNuiFocus()
    else
      SetNuiFocus(false, false)
    end
    SendNUIMessage({
      action = 'cadBridgePrintedDoc:close',
      payload = {},
    })
  end
end

local function closePrintedDocumentPopup()
  if not state.printedDocumentUiOpen then return end
  setPrintedDocumentUiVisible(false, {})
end
ui.closePrintedDocumentPopup = closePrintedDocumentPopup

local function cloneTable(value)
  if type(value) ~= 'table' then return value end
  local out = {}
  for k, v in pairs(value) do
    out[k] = cloneTable(v)
  end
  return out
end

local function normalizePrintedDocumentPayload(rawPayload)
  local payload = type(rawPayload) == 'table' and rawPayload or {}
  local metadata = {}
  if type(payload.metadata) == 'table' then
    metadata = cloneTable(payload.metadata)
  elseif type(payload.info) == 'table' then
    metadata = cloneTable(payload.info)
  end

  local function copyIfMissing(key, value)
    if metadata[key] == nil and value ~= nil then
      metadata[key] = value
    end
  end

  copyIfMissing('item_name', payload.item_name)
  copyIfMissing('item_label', payload.item_label)
  copyIfMissing('document_type', payload.document_type)
  copyIfMissing('document_subtype', payload.document_subtype or payload.subtype)
  copyIfMissing('title', payload.title)
  copyIfMissing('description', payload.description)

  return {
    metadata = metadata,
    item_name = trim(payload.item_name or metadata.item_name or ''),
    item_label = trim(payload.item_label or metadata.item_label or metadata.label or ''),
    source = trim(payload.source or 'inventory_use'),
  }
end

local function openPrintedDocumentViewer(rawPayload)
  local normalized = normalizePrintedDocumentPayload(rawPayload)
  local metadata = normalized.metadata or {}
  local title = trim(metadata.title or metadata.label or '')
  local subtype = trim(metadata.document_subtype or '')
  local description = trim(metadata.description or metadata.info or '')
  if title == '' and subtype == '' and description == '' then
    triggerNotify({
      title = 'CAD Document',
      description = 'This item does not contain readable printed document metadata.',
      type = 'warning',
    })
    return
  end

  if type(ui.closeAllModals) == 'function' then
    ui.closeAllModals()
  else
    if state.emergencyUiOpen and type(ui.closeEmergencyPopup) == 'function' then ui.closeEmergencyPopup() end
    if state.trafficStopUiOpen and type(ui.closeTrafficStopPopup) == 'function' then ui.closeTrafficStopPopup() end
    if state.jailReleaseUiOpen and type(ui.closeJailReleasePopup) == 'function' then ui.closeJailReleasePopup() end
    if state.driverLicenseUiOpen and type(ui.closeDriverLicensePopup) == 'function' then ui.closeDriverLicensePopup() end
    if state.vehicleRegistrationUiOpen and type(ui.closeVehicleRegistrationPopup) == 'function' then ui.closeVehicleRegistrationPopup() end
  end

  if state.idCardUiOpen then
    state.idCardUiOpen = false
    SendNUIMessage({
      action = 'cadBridgeIdCard:hide',
      payload = {},
    })
  end

  setPrintedDocumentUiVisible(true, normalized)
end

RegisterNetEvent('cad_bridge:showPrintedDocument', function(payload)
  openPrintedDocumentViewer(type(payload) == 'table' and payload or {})
end)

local function extractOxPrintedDocumentMetadata(eventName, item, inventory, slot, data)
  local meta = nil
  local itemName = ''
  local itemLabel = ''

  if type(item) == 'table' then
    itemName = trim(item.name or item.item or itemName)
    itemLabel = trim(item.label or itemLabel)
    if type(item.metadata) == 'table' then meta = item.metadata end
    if type(item.info) == 'table' and type(meta) ~= 'table' then meta = item.info end
  elseif type(item) == 'string' then
    itemName = trim(item)
  end

  if type(slot) == 'table' then
    itemName = itemName ~= '' and itemName or trim(slot.name or slot.item or '')
    itemLabel = itemLabel ~= '' and itemLabel or trim(slot.label or '')
    if type(slot.metadata) == 'table' and type(meta) ~= 'table' then meta = slot.metadata end
    if type(slot.info) == 'table' and type(meta) ~= 'table' then meta = slot.info end
  end

  if type(data) == 'table' then
    if type(data.metadata) == 'table' and type(meta) ~= 'table' then meta = data.metadata end
    if type(meta) ~= 'table' then
      local hasLikelyDocFields = data.document_type ~= nil or data.document_subtype ~= nil or data.title ~= nil or data.description ~= nil
      if hasLikelyDocFields then
        meta = data
      end
    end
  end

  if type(meta) ~= 'table' then return nil end
  return {
    item_name = itemName,
    item_label = itemLabel,
    metadata = meta,
    source = 'ox_inventory:' .. trim(eventName or 'use'),
  }
end

local lastPrintedDocumentUseKey = ''
local lastPrintedDocumentUseAtMs = 0

local function buildPrintedDocUseDebounceKey(payload)
  local metadata = type(payload) == 'table' and type(payload.metadata) == 'table' and payload.metadata or {}
  local keyParts = {
    trim(payload and payload.item_name or ''),
    tostring(tonumber(metadata.cad_print_job_id) or 0),
    trim(metadata.document_subtype or ''),
    trim(metadata.title or metadata.label or ''),
  }
  return table.concat(keyParts, '|')
end

local function shouldSuppressPrintedDocOpen(payload)
  local now = tonumber(GetGameTimer() or 0) or 0
  local key = buildPrintedDocUseDebounceKey(payload)
  if key ~= '' and key == lastPrintedDocumentUseKey and (now - tonumber(lastPrintedDocumentUseAtMs or 0)) <= 600 then
    return true
  end
  lastPrintedDocumentUseKey = key
  lastPrintedDocumentUseAtMs = now
  return false
end

local function handleOxPrintedDocumentUseExport(eventName, item, inventory, slot, data)
  local normalizedEvent = trim(eventName or ''):lower()
  if normalizedEvent == 'buying' then
    return true
  end

  local payload = extractOxPrintedDocumentMetadata(eventName, item, inventory, slot, data)
  if not payload then
    return true
  end

  if normalizedEvent == 'usingitem' or normalizedEvent == 'useditem' or normalizedEvent == 'useitem' or normalizedEvent == '' then
    if not shouldSuppressPrintedDocOpen(payload) then
      openPrintedDocumentViewer(payload)
    end
  end

  return true
end

exports('usePrintedCadDocument', handleOxPrintedDocumentUseExport)
exports('usePrintedTicketDocument', handleOxPrintedDocumentUseExport)
exports('usePrintedWarningDocument', handleOxPrintedDocumentUseExport)

local function openTrafficStopPrompt(payload)
  if not state.trafficStopUiReady then
    local attempts = 0
    while not state.trafficStopUiReady and attempts < 20 do
      attempts = attempts + 1
      Wait(50)
    end
  end

  if not state.trafficStopUiReady then
    notifyEmergencyUiIssue('Traffic stop UI may not be fully loaded. If nothing appears, restart cad_bridge.')
  end

  if type(ui.closeAllModals) == 'function' then
    ui.closeAllModals()
  else
    if state.emergencyUiOpen and type(ui.closeEmergencyPopup) == 'function' then ui.closeEmergencyPopup() end
    if state.driverLicenseUiOpen and type(ui.closeDriverLicensePopup) == 'function' then ui.closeDriverLicensePopup() end
    if state.vehicleRegistrationUiOpen and type(ui.closeVehicleRegistrationPopup) == 'function' then ui.closeVehicleRegistrationPopup() end
  end

  local defaults = type(payload) == 'table' and payload or {}
  local out = {
    plate = trim(defaults.plate or ''),
    location = trim(defaults.location or ''),
    street = trim(defaults.street or ''),
    crossing = trim(defaults.crossing or ''),
    postal = trim(defaults.postal or ''),
    reason = trim(defaults.reason or ''),
    outcome = trim(defaults.outcome or ''),
    notes = trim(defaults.notes or ''),
    max_plate_length = 16,
    max_location_length = 160,
    max_reason_length = 120,
    max_outcome_length = 80,
    max_notes_length = 500,
  }

  setTrafficStopUiVisible(true, out)

  CreateThread(function()
    Wait(2000)
    if state.trafficStopUiOpen and state.trafficStopUiAwaitingOpenAck then
      SendNUIMessage({
        action = 'cadBridgeTrafficStop:open',
        payload = out,
      })
    end
  end)
end

local function openEmergencyPopup(departments)
  if not state.emergencyUiReady then
    local attempts = 0
    while not state.emergencyUiReady and attempts < 20 do
      attempts = attempts + 1
      Wait(50)
    end
  end

  if not state.emergencyUiReady then
    notifyEmergencyUiIssue('000 UI may not be fully loaded. If nothing appears, restart cad_bridge.')
  end

  if state.driverLicenseUiOpen and type(ui.closeDriverLicensePopup) == 'function' then
    ui.closeDriverLicensePopup()
  end
  if state.vehicleRegistrationUiOpen and type(ui.closeVehicleRegistrationPopup) == 'function' then
    ui.closeVehicleRegistrationPopup()
  end

  local payload = {
    departments = sanitizeEmergencyDepartments(departments),
    max_title_length = 80,
    max_details_length = 600,
  }

  setEmergencyUiVisible(true, payload)

  CreateThread(function()
    Wait(2000)
    if state.emergencyUiOpen and state.emergencyUiAwaitingOpenAck then
      SendNUIMessage({
        action = 'cadBridge000:open',
        payload = payload,
      })
    end
  end)
end
ui.openEmergencyPopup = openEmergencyPopup

local function closeShownIdCard()
  if not state.idCardUiOpen then return end
  state.idCardUiOpen = false
  SendNUIMessage({
    action = 'cadBridgeIdCard:hide',
    payload = {},
  })
end

local function openShownIdCard(payload)
  state.idCardUiOpen = true
  SendNUIMessage({
    action = 'cadBridgeIdCard:show',
    payload = payload or {},
  })
end

RegisterNUICallback('cadBridge000Ready', function(_data, cb)
  state.emergencyUiReady = true
  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridge000Opened', function(_data, cb)
  state.emergencyUiAwaitingOpenAck = false
  state.emergencyUiOpenedAtMs = 0
  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridge000Submit', function(data, cb)
  local title = trim(data and data.title or '')
  local details = trim(data and data.details or '')
  local departmentsAvailable = tonumber(data and data.departments_available or 0) or 0
  local requestedDepartmentIds = {}
  if type(util.normalizeDepartmentIdList) == 'function' then
    requestedDepartmentIds = util.normalizeDepartmentIdList(data and data.requested_department_ids or {})
  end

  if title == '' then
    if cb then cb({ ok = false, error = 'title_required' }) end
    return
  end
  if details == '' then
    if cb then cb({ ok = false, error = 'details_required' }) end
    return
  end
  if departmentsAvailable > 0 and (type(requestedDepartmentIds) ~= 'table' or #requestedDepartmentIds == 0) then
    if cb then cb({ ok = false, error = 'departments_required' }) end
    return
  end

  if #title > 80 then title = title:sub(1, 80) end
  if #details > 600 then details = details:sub(1, 600) end

  closeEmergencyPopup()
  TriggerServerEvent('cad_bridge:submit000', {
    title = title,
    details = details,
    requested_department_ids = requestedDepartmentIds,
    departments_available = departmentsAvailable,
  })

  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridge000Cancel', function(_data, cb)
  closeEmergencyPopup()
  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridgeTrafficStopReady', function(_data, cb)
  state.trafficStopUiReady = true
  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridgeTrafficStopOpened', function(_data, cb)
  state.trafficStopUiAwaitingOpenAck = false
  state.trafficStopUiOpenedAtMs = 0
  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridgeTrafficStopSubmit', function(data, cb)
  local plate = trim(data and data.plate or '')
  local location = trim(data and data.location or '')
  local street = trim(data and data.street or '')
  local crossing = trim(data and data.crossing or '')
  local postal = trim(data and data.postal or '')
  local reason = trim(data and data.reason or '')
  local outcome = trim(data and data.outcome or '')
  local notes = trim(data and data.notes or '')

  if reason == '' then
    if cb then cb({ ok = false, error = 'reason_required' }) end
    return
  end

  if #plate > 16 then plate = plate:sub(1, 16) end
  if #location > 160 then location = location:sub(1, 160) end
  if #reason > 120 then reason = reason:sub(1, 120) end
  if #outcome > 80 then outcome = outcome:sub(1, 80) end
  if #notes > 500 then notes = notes:sub(1, 500) end

  closeTrafficStopPopup()
  TriggerServerEvent('cad_bridge:submitTrafficStopPrompt', {
    plate = plate,
    location = location,
    street = street,
    crossing = crossing,
    postal = postal,
    reason = reason,
    outcome = outcome,
    notes = notes,
  })

  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridgeTrafficStopCancel', function(_data, cb)
  closeTrafficStopPopup()
  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridgeIdCardClose', function(_data, cb)
  closeShownIdCard()
  if cb then cb({ ok = true }) end
end)

RegisterNUICallback('cadBridgePrintedDocClose', function(_data, cb)
  closePrintedDocumentPopup()
  if cb then cb({ ok = true }) end
end)

RegisterNetEvent('cad_bridge:prompt000', function(departments)
  openEmergencyPopup(departments)
end)

RegisterNetEvent('cad_bridge:promptTrafficStop', function(payload)
  openTrafficStopPrompt(type(payload) == 'table' and payload or {})
end)

RegisterNetEvent('cad_bridge:showIdCard', function(payload)
  openShownIdCard(payload or {})
end)

RegisterNetEvent('cad_bridge:hideIdCard', function()
  closeShownIdCard()
end)

RegisterNetEvent('cad_bridge:hidePrintedDocument', function()
  closePrintedDocumentPopup()
end)

local SHOW_ID_COMMAND = trim(Config.ShowIdCommand or 'showid')
if SHOW_ID_COMMAND == '' then SHOW_ID_COMMAND = 'showid' end
local SHOW_ID_KEY = trim(Config.ShowIdKey or 'PAGEDOWN')
if SHOW_ID_KEY == '' then SHOW_ID_KEY = 'PAGEDOWN' end
local SHOW_ID_MAX_DISTANCE = tonumber(Config.ShowIdTargetDistance or 4.0) or 4.0

local function findFacingPlayerServerId(maxDistance)
  local ped = PlayerPedId()
  if not ped or ped == 0 then return 0 end

  local origin = GetEntityCoords(ped)
  local forward = GetEntityForwardVector(ped)
  local localPlayer = PlayerId()
  local distanceLimit = tonumber(maxDistance) or 4.0
  if distanceLimit < 1.0 then distanceLimit = 1.0 end

  local bestServerId = 0
  local bestScore = 0.0
  for _, player in ipairs(GetActivePlayers()) do
    if player ~= localPlayer then
      local targetPed = GetPlayerPed(player)
      if targetPed and targetPed ~= 0 then
        local targetCoords = GetEntityCoords(targetPed)
        local dx = targetCoords.x - origin.x
        local dy = targetCoords.y - origin.y
        local dz = targetCoords.z - origin.z
        local distance = math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
        if distance > 0.001 and distance <= distanceLimit then
          local invDistance = 1.0 / distance
          local dot = (forward.x * dx * invDistance) + (forward.y * dy * invDistance) + (forward.z * dz * invDistance)
          if dot >= 0.35 then
            local score = dot + (1.0 - (distance / distanceLimit))
            if score > bestScore then
              bestScore = score
              bestServerId = GetPlayerServerId(player)
            end
          end
        end
      end
    end
  end

  return tonumber(bestServerId) or 0
end

local function requestShowIdCard()
  local targetSource = findFacingPlayerServerId(SHOW_ID_MAX_DISTANCE)
  TriggerServerEvent('cad_bridge:requestShowId', targetSource)
end

RegisterCommand(SHOW_ID_COMMAND, function()
  requestShowIdCard()
end, false)

RegisterCommand('cadbridgecloseid', function()
  closeShownIdCard()
end, false)

RegisterCommand('cadbridgeidtoggle', function()
  if state.idCardUiOpen then
    closeShownIdCard()
    return
  end
  requestShowIdCard()
end, false)

RegisterKeyMapping('cadbridgeidtoggle', 'Show or hide your ID card', 'keyboard', SHOW_ID_KEY)

RegisterCommand('test000ui', function()
  openEmergencyPopup({
    { id = 1, name = 'Police Department', short_name = 'LSPD', color = '#3b82f6' },
    { id = 2, name = 'Fire Department', short_name = 'LSFD', color = '#ef4444' },
    { id = 3, name = 'Emergency Medical Services', short_name = 'EMS', color = '#10b981' },
  })
end, false)

local function dumpOutfit()
  local ped = PlayerPedId()

  print('----- OUTFIT DUMP START -----')

  print('clothing = {')
  for comp = 0, 11 do
    local drawable = GetPedDrawableVariation(ped, comp)
    local texture = GetPedTextureVariation(ped, comp)
    print(string.format('  { component = %d, drawable = %d, texture = %d },', comp, drawable, texture))
  end
  print('},')

  print('props = {')
  for prop = 0, 7 do
    local drawable = GetPedPropIndex(ped, prop)
    if drawable ~= -1 then
      local texture = GetPedPropTextureIndex(ped, prop)
      print(string.format('  { component = %d, drawable = %d, texture = %d },', prop, drawable, texture))
    end
  end
  print('}')

  print('----- OUTFIT DUMP END -----')
end

RegisterCommand('dumpfit', function()
  dumpOutfit()
end, false)

AddEventHandler('onResourceStop', function(resourceName)
  if resourceName ~= GetCurrentResourceName() then return end
  if state.idCardUiOpen then
    closeShownIdCard()
  end
  if type(ui.closeAllModals) == 'function' then
    ui.closeAllModals()
  elseif state.emergencyUiOpen then
    closeEmergencyPopup()
  end
  SetNuiFocus(false, false)
end)

CreateThread(function()
  while true do
    local hasModalOpen = false
    if type(ui.hasAnyCadBridgeModalOpen) == 'function' then
      hasModalOpen = ui.hasAnyCadBridgeModalOpen()
    end

    if hasModalOpen then
      Wait(0)

      if IsControlJustPressed(0, 200) or IsControlJustPressed(0, 202) or IsControlJustPressed(0, 177) then
        if type(ui.closeAllModals) == 'function' then
          ui.closeAllModals()
        else
          closeEmergencyPopup()
          if type(ui.closeTrafficStopPopup) == 'function' then ui.closeTrafficStopPopup() end
          if type(ui.closePrintedDocumentPopup) == 'function' then ui.closePrintedDocumentPopup() end
          if type(ui.closeDriverLicensePopup) == 'function' then ui.closeDriverLicensePopup() end
          if type(ui.closeVehicleRegistrationPopup) == 'function' then ui.closeVehicleRegistrationPopup() end
        end
      end

      if state.emergencyUiAwaitingOpenAck and (tonumber(state.emergencyUiOpenedAtMs or 0) > 0) then
        local nowMs = tonumber(GetGameTimer() or 0) or 0
        if (nowMs - tonumber(state.emergencyUiOpenedAtMs or 0)) > 2500 then
          closeEmergencyPopup()
          notifyEmergencyUiIssue('000 UI failed to initialize. Focus was released.')
        end
      end

      if state.trafficStopUiAwaitingOpenAck and (tonumber(state.trafficStopUiOpenedAtMs or 0) > 0) then
        local nowMs2 = tonumber(GetGameTimer() or 0) or 0
        if (nowMs2 - tonumber(state.trafficStopUiOpenedAtMs or 0)) > 2500 then
          closeTrafficStopPopup()
          notifyEmergencyUiIssue('Traffic stop UI failed to initialize. Focus was released.')
        end
      end
    else
      Wait(250)
    end
  end
end)
