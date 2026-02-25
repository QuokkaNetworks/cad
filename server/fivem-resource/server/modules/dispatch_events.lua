          plate = trim(payload.plate or ''),
          citizenid = trim(payload.citizenid or ''),
          expiry_at = trim(expiryAt or ''),
        }, true)
        notifyPlayer(s, ('Vehicle registration saved to CAD%s%s%s%s'):format(
          expiryAt ~= '' and ' | Expires: ' or '',
          expiryAt ~= '' and expiryAt or '',
          feeCharged and ' | Charged: ' or '',
          feeCharged and formatMoney(feeAmount) or ''
        ))
        emitVehicleRegistrationSubmitResult({
          ok = true,
          message = 'Vehicle registration saved.',
        })
        return
      end

      if status == 429 then
        setBridgeBackoff('registrations', responseHeaders, 15000, 'vehicle registration create')
      end

      local err = ('Failed to create CAD vehicle registration (HTTP %s)'):format(tostring(status))
      local ok, parsed = pcall(json.decode, body or '{}')
      local parsedError = ''
      if ok and type(parsed) == 'table' and parsed.error then
        parsedError = tostring(parsed.error)
        err = err .. ': ' .. parsedError
      end
      print('[cad_bridge] ' .. err)
      if feeCharged and feeAmount > 0 then
        local refunded, refundErr = refundDocumentFee(
          s,
          payload.citizenid,
          feeAccount,
          feeAmount,
          'CAD registration refund (save failed)'
        )
        if not refunded then
          print(('[cad_bridge] WARNING: registration fee refund failed for src %s amount %s: %s'):format(
            tostring(s),
            tostring(feeAmount),
            tostring(refundErr)
          ))
        end
      end
      if status == 409 then
        local existingExpiry = ''
        if ok and type(parsed) == 'table' then
          existingExpiry = trim(parsed.existing_expiry_at or '')
        end
        logDocumentFailure('registration-create-rejected', {
          reason = 'renewal_window_blocked',
          http_status = tonumber(status) or 0,
          existing_expiry_at = existingExpiry,
          payload = summarizeRegistrationPayloadForLog(payload),
        })
        if existingExpiry ~= '' then
          notifyPlayer(s, ('Registration renewal unavailable. You can renew when within 3 days of expiry (current expiry: %s).'):format(existingExpiry))
        else
          notifyPlayer(s, 'Registration renewal unavailable. You can renew when within 3 days of expiry.')
        end
        emitVehicleRegistrationSubmitResult({
          ok = false,
          error_code = 'renewal_window_blocked',
          message = existingExpiry ~= '' and ('Registration renewal unavailable. You can renew within 3 days of expiry (current expiry: %s).'):format(existingExpiry) or 'Registration renewal unavailable. You can renew within 3 days of expiry.',
        })
        return
      end

      if status == 403 then
        logDocumentFailure('registration-create-rejected', {
          reason = 'ownership_mismatch',
          http_status = tonumber(status) or 0,
          api_error = parsedError,
          payload = summarizeRegistrationPayloadForLog(payload),
        })
        local ownershipMessage = 'You are not the owner of this vehicle, so you cannot register it.'
        local parsedErrorLower = string.lower(trim(parsedError or ''))
        if parsedError ~= '' and (
          parsedErrorLower:find('do not own', 1, true)
          or parsedErrorLower:find('ownership', 1, true)
          or parsedErrorLower:find('owner', 1, true)
          or parsedErrorLower:find('cannot register', 1, true)
        ) then
          ownershipMessage = parsedError
        end
        notifyPlayer(s, ownershipMessage)
        emitVehicleRegistrationSubmitResult({
          ok = false,
          error_code = 'not_owner',
          message = ownershipMessage,
        })
        return
      end

      logDocumentFailure('registration-create-failed', {
        http_status = tonumber(status) or 0,
        api_error = parsedError,
        fee_charged = feeCharged == true,
        fee_amount = feeAmount,
        payload = summarizeRegistrationPayloadForLog(payload),
      })
      if parsedError ~= '' then
        notifyPlayer(s, ('Vehicle registration failed to save: %s'):format(parsedError))
      else
        notifyPlayer(s, 'Vehicle registration failed to save to CAD. Check server logs.')
      end
      emitVehicleRegistrationSubmitResult({
        ok = false,
        error_code = 'save_failed',
        message = parsedError ~= '' and ('Vehicle registration failed: %s'):format(parsedError) or 'Vehicle registration failed to save to CAD. Check server logs.',
      })
    end)
  end)
end

RegisterNetEvent('cad_bridge:submit000', function(payload)
  local src = source
  if not src or src == 0 then return end

  local report, err = parseEmergencyPopupReport(payload)
  if not report then
    notifyPlayer(src, err or 'Invalid emergency form details.')
    return
  end

  submitEmergencyCall(src, report)
end)

RegisterNetEvent('cad_bridge:submitDriverLicense', function(payload)
  local src = source
  print(('[cad_bridge] >>> submitDriverLicense event received from src=%s'):format(tostring(src)))
  if not src or src == 0 then
    print('[cad_bridge] submitDriverLicense ABORTED: invalid source')
    return
  end
  logDocumentTrace('license-event-received', {
    source = tonumber(src) or 0,
    payload = summarizeLicensePayloadForLog(payload),
  }, true)

  local formData, err = parseDriverLicenseForm(payload)
  if not formData then
    print(('[cad_bridge] submitDriverLicense ABORTED: form validation failed: %s'):format(tostring(err)))
    logDocumentFailure('license-validate-failed', {
      source = tonumber(src) or 0,
      error = trim(err or 'invalid_form'),
      payload = summarizeLicensePayloadForLog(payload),
    })
    notifyPlayer(src, err or 'Invalid driver license details.')
    return
  end

  print(('[cad_bridge] submitDriverLicense: form valid, calling submitDriverLicense() for citizenid=%s'):format(trim(getCitizenId(src) or '')))
  submitDriverLicense(src, formData)
end)

RegisterNetEvent('cad_bridge:submitVehicleRegistration', function(payload)
  local src = source
  local requestId = trim(payload and payload.request_id or '')
  local normalizedPayload = type(payload) == 'table' and payload or {}
  print(('[cad_bridge] >>> submitVehicleRegistration event received from src=%s'):format(tostring(src)))
  if not src or src == 0 then
    print('[cad_bridge] submitVehicleRegistration ABORTED: invalid source')
    return
  end

  -- Allow phone/CAD registration UIs to omit owner_name and derive it from the active character.
  if trim(normalizedPayload.owner_name or normalizedPayload.character_name or '') == '' then
    local defaults = getCharacterDefaults(src)
    local resolvedOwnerName = trim(defaults.full_name or getCharacterDisplayName(src) or '')
    if resolvedOwnerName ~= '' then
      normalizedPayload.owner_name = resolvedOwnerName
      if trim(normalizedPayload.character_name or '') == '' then
        normalizedPayload.character_name = resolvedOwnerName
      end
    end
  end

  logDocumentTrace('registration-event-received', {
    source = tonumber(src) or 0,
    payload = summarizeRegistrationPayloadForLog(normalizedPayload),
  }, true)

  local formData, err = parseVehicleRegistrationForm(normalizedPayload)
  if not formData then
    logDocumentFailure('registration-validate-failed', {
      source = tonumber(src) or 0,
      error = trim(err or 'invalid_form'),
      payload = summarizeRegistrationPayloadForLog(normalizedPayload),
    })
    notifyPlayer(src, err or 'Invalid registration details.')
    local result = {
      ok = false,
      error_code = 'invalid_form',
      message = err or 'Invalid registration details.',
    }
    if requestId ~= '' then result.request_id = requestId end
    TriggerClientEvent('cad_bridge:vehicleRegistrationSubmitResult', src, result)
    return
  end

  submitVehicleRegistration(src, formData, { request_id = requestId })
end)

RegisterNetEvent('cad_bridge:requestShowId', function(targetSource)
  local src = source
  if not src or src == 0 then return end

  local defaults = getCharacterDefaults(src)
  local citizenId = trim(defaults.citizenid or getCitizenId(src) or '')
  if citizenId == '' then
    notifyPlayer(src, 'Unable to determine your active character (citizenid).')
    return
  end

  local function getPlayerCoords(sourceId)
    local s = tonumber(sourceId) or 0
    if s <= 0 then return nil end

    local ped = GetPlayerPed(s)
    if ped and ped > 0 then
      local coords = GetEntityCoords(ped)
      if coords then
        return {
          x = tonumber(coords.x) or 0.0,
          y = tonumber(coords.y) or 0.0,
          z = tonumber(coords.z) or 0.0,
        }
      end
    end

    local cached = PlayerPositions[s]
    if type(cached) == 'table' then
      return {
        x = tonumber(cached.x) or 0.0,
        y = tonumber(cached.y) or 0.0,
        z = tonumber(cached.z) or 0.0,
      }
    end
    return nil
  end

  local function findNearbyPlayers(originSource, radius)
    local nearby = {}
    local seen = {}
    local origin = getPlayerCoords(originSource)
    if not origin then return nearby, seen end

    local maxDistance = tonumber(radius) or tonumber(Config.ShowIdTargetDistance or 4.0) or 4.0
    if maxDistance < 1.0 then maxDistance = 1.0 end

    for _, player in ipairs(GetPlayers()) do
      local candidate = tonumber(player) or 0
      if candidate > 0 and candidate ~= originSource and GetPlayerName(candidate) then
        local targetCoords = getPlayerCoords(candidate)
        if targetCoords then
          local dx = targetCoords.x - origin.x
          local dy = targetCoords.y - origin.y
          local dz = targetCoords.z - origin.z
          local distance = math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          if distance <= maxDistance then
            seen[candidate] = true
            nearby[#nearby + 1] = candidate
          end
        end
      end
    end

    return nearby, seen
  end

  local nearbyDistance = tonumber(Config.ShowIdNearbyDistance or Config.ShowIdTargetDistance or 4.0) or 4.0
  local viewerTargets, viewerTargetSet = findNearbyPlayers(src, nearbyDistance)
  local target = tonumber(targetSource) or 0
  if target > 0 and target ~= src and GetPlayerName(target) and not viewerTargetSet[target] then
    viewerTargetSet[target] = true
    viewerTargets[#viewerTargets + 1] = target
  end

  request('GET', '/api/integration/fivem/licenses/' .. urlEncode(citizenId), nil, function(status, body)
    if status == 404 then
      notifyPlayer(src, 'No licence record found in CAD. Use /cadlicense first.')
      return
    end

    if status < 200 or status >= 300 then
      notifyPlayer(src, ('Unable to fetch licence from CAD (HTTP %s).'):format(tostring(status)))
      return
    end

    local ok, parsed = pcall(json.decode, body or '{}')
    if not ok or type(parsed) ~= 'table' or type(parsed.license) ~= 'table' then
      notifyPlayer(src, 'CAD returned an invalid licence response.')
      return
    end

    local license = parsed.license
    local fullName = trim(license.full_name or defaults.full_name or getCharacterDisplayName(src) or '')

    -- Resolve mugshot URL to a full URL for fetching the image server-side.
    local rawMugshot = trim(license.mugshot_url or '')
    local mugshotFullUrl = rawMugshot
    if rawMugshot ~= '' and rawMugshot:sub(1, 1) == '/' then
      mugshotFullUrl = getCadUrl(rawMugshot)
    end

    local payload = {
      full_name = fullName,
      date_of_birth = trim(license.date_of_birth or defaults.date_of_birth or ''),
      gender = trim(license.gender or defaults.gender or ''),
      license_number = trim(license.license_number or ''),
      license_classes = normalizeList(license.license_classes or {}, true),
      conditions = normalizeList(license.conditions or {}, false),
