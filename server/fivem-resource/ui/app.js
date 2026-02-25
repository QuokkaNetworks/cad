var overlay = document.getElementById("overlay");
var form = document.getElementById("emergencyForm");
var closeBtn = document.getElementById("closeBtn");
var cancelBtn = document.getElementById("cancelBtn");
var submitBtn = document.getElementById("submitBtn");
var titleInput = document.getElementById("titleInput");
var detailsInput = document.getElementById("detailsInput");
var titleCounter = document.getElementById("titleCounter");
var detailsCounter = document.getElementById("detailsCounter");
var titleError = document.getElementById("titleError");
var detailsError = document.getElementById("detailsError");
var departmentsEmpty = document.getElementById("departmentsEmpty");
var departmentsList = document.getElementById("departmentsList");
var departmentsError = document.getElementById("departmentsError");

var trafficStopOverlay = document.getElementById("trafficStopOverlay");
var trafficStopForm = document.getElementById("trafficStopForm");
var trafficStopCloseBtn = document.getElementById("trafficStopCloseBtn");
var trafficStopCancelBtn = document.getElementById("trafficStopCancelBtn");
var trafficStopSubmitBtn = document.getElementById("trafficStopSubmitBtn");
var trafficStopPlateInput = document.getElementById("trafficStopPlateInput");
var trafficStopLocationInput = document.getElementById("trafficStopLocationInput");
var trafficStopReasonInput = document.getElementById("trafficStopReasonInput");
var trafficStopOutcomeInput = document.getElementById("trafficStopOutcomeInput");
var trafficStopNotesInput = document.getElementById("trafficStopNotesInput");
var trafficStopPlateCounter = document.getElementById("trafficStopPlateCounter");
var trafficStopLocationCounter = document.getElementById("trafficStopLocationCounter");
var trafficStopReasonCounter = document.getElementById("trafficStopReasonCounter");
var trafficStopOutcomeCounter = document.getElementById("trafficStopOutcomeCounter");
var trafficStopNotesCounter = document.getElementById("trafficStopNotesCounter");
var trafficStopReasonError = document.getElementById("trafficStopReasonError");

var jailReleaseOverlay = document.getElementById("jailReleaseOverlay");
var jailReleaseForm = document.getElementById("jailReleaseForm");
var jailReleaseCloseBtn = document.getElementById("jailReleaseCloseBtn");
var jailReleaseCancelBtn = document.getElementById("jailReleaseCancelBtn");
var jailReleaseSubmitBtn = document.getElementById("jailReleaseSubmitBtn");
var jailReleaseSentenceInput = document.getElementById("jailReleaseSentenceInput");
var jailReleaseSelect = document.getElementById("jailReleaseSelect");
var jailReleaseSelectError = document.getElementById("jailReleaseSelectError");
var jailReleaseReasonField = document.getElementById("jailReleaseReasonField");
var jailReleaseReasonText = document.getElementById("jailReleaseReasonText");

var printedDocOverlay = document.getElementById("printedDocOverlay");
var printedDocPopup = printedDocOverlay ? printedDocOverlay.querySelector(".printed-doc-popup") : null;
var printedDocCloseBtn = document.getElementById("printedDocCloseBtn");
var printedDocCancelBtn = document.getElementById("printedDocCancelBtn");
var printedDocZoomOutBtn = document.getElementById("printedDocZoomOutBtn");
var printedDocZoomResetBtn = document.getElementById("printedDocZoomResetBtn");
var printedDocZoomInBtn = document.getElementById("printedDocZoomInBtn");
var printedDocZoomLabel = document.getElementById("printedDocZoomLabel");
var printedDocCopyPdfBtn = document.getElementById("printedDocCopyPdfBtn");
var printedDocSavePdfBtn = document.getElementById("printedDocSavePdfBtn");
var printedDocPdfStatus = document.getElementById("printedDocPdfStatus");
var printedDocPdfViewport = document.getElementById("printedDocPdfViewport");
var printedDocPdfPages = document.getElementById("printedDocPdfPages");
var printedDocFallback = document.getElementById("printedDocFallback");
var printedDocType = document.getElementById("printedDocType");
var printedDocTitle = document.getElementById("printedDoc-title");
var printedDocSubtitle = document.getElementById("printedDocSubtitle");
var printedDocSubject = document.getElementById("printedDocSubject");
var printedDocOfficer = document.getElementById("printedDocOfficer");
var printedDocIssued = document.getElementById("printedDocIssued");
var printedDocStatus = document.getElementById("printedDocStatus");
var printedDocFine = document.getElementById("printedDocFine");
var printedDocJail = document.getElementById("printedDocJail");
var printedDocReference = document.getElementById("printedDocReference");
var printedDocSummary = document.getElementById("printedDocSummary");
var printedDocNotesSection = document.getElementById("printedDocNotesSection");
var printedDocNotes = document.getElementById("printedDocNotes");
var printedDocExtraSection = document.getElementById("printedDocExtraSection");
var printedDocExtra = document.getElementById("printedDocExtra");
var printedDocQuickReference = document.getElementById("printedDocQuickReference");
var printedDocCopyShareTextBtn = document.getElementById("printedDocCopyShareTextBtn");

var licenseOverlay = document.getElementById("licenseOverlay");
var licenseForm = document.getElementById("licenseForm");
var licenseCloseBtn = document.getElementById("licenseCloseBtn");
var licenseCancelBtn = document.getElementById("licenseCancelBtn");
var licenseSubmitBtn = document.getElementById("licenseSubmitBtn");
var licenseNameInput = document.getElementById("licenseNameInput");
var licenseDobInput = document.getElementById("licenseDobInput");
var licenseGenderInput = document.getElementById("licenseGenderInput");
var licenseQuizList = document.getElementById("licenseQuizList");
var licenseStatusPanel = document.getElementById("licenseStatusPanel");
var licenseStatusMessage = document.getElementById("licenseStatusMessage");
var licenseRetakePhotoBtn = document.getElementById("licenseRetakePhotoBtn");
var licenseQuizPanel = document.getElementById("licenseQuizPanel");
var licensePassPanel = document.getElementById("licensePassPanel");
var licensePassMessage = document.getElementById("licensePassMessage");
var licenseContinuePhotoBtn = document.getElementById("licenseContinuePhotoBtn");
var licenseFormError = document.getElementById("licenseFormError");

var registrationOverlay = document.getElementById("registrationOverlay");
var registrationForm = document.getElementById("registrationForm");
var registrationCloseBtn = document.getElementById("registrationCloseBtn");
var registrationCancelBtn = document.getElementById("registrationCancelBtn");
var registrationSubmitBtn = document.getElementById("registrationSubmitBtn");
var regoOwnerInput = document.getElementById("regoOwnerInput");
var regoPlateInput = document.getElementById("regoPlateInput");
var regoModelInput = document.getElementById("regoModelInput");
var regoColourInput = document.getElementById("regoColourInput");
var regoDurationList = document.getElementById("regoDurationList");
var registrationFormError = document.getElementById("registrationFormError");

var idCardMount = document.getElementById("idCardMount");
var idCardOverlay = null;
var idCardCloseBtn = null;
var idCardViewerNote = null;
var idCardPhoto = null;
var idCardFullName = null;
var idCardAddress = null;
var idCardDob = null;
var idCardNumber = null;
var idCardClasses = null;
var idCardExpiry = null;
var idCardConditions = null;
var idCardTemplateReady = false;
var idCardTemplatePromise = null;
var queuedIdCardPayload = null;

var emergencyOpen = false;
var trafficStopOpen = false;
var jailReleaseOpen = false;
var printedDocOpen = false;
var licenseOpen = false;
var registrationOpen = false;
var idCardOpen = false;

var titleLimit = 80;
var detailsLimit = 600;
var trafficStopPlateLimit = 16;
var trafficStopLocationLimit = 160;
var trafficStopReasonLimit = 120;
var trafficStopOutcomeLimit = 80;
var trafficStopNotesLimit = 500;
var departments = [];
var selectedDepartmentIds = [];
var quizAnswers = {};
var quizPassPercent = 80;
var licenseRenewalWindowDays = 3;
var activeQuizQuestions = [];
var existingLicenseSnapshot = null;
var pendingLicenseSubmissionPayload = null;
var licenseViewMode = "quiz";
var licenseShowStatusPanel = false;
var durationOptions = [];
var selectedRegistrationDurationDays = 35;
var registrationSubmitPending = false;
var trafficStopHiddenFields = { street: "", crossing: "", postal: "" };
var jailReleaseOptions = [];
var activePrintedDocPayload = null;
var printedDocPdfDoc = null;
var printedDocPdfRenderToken = 0;
var printedDocPdfZoom = 1;
var printedDocPdfFitZoom = 1;
var printedDocPdfHasPdf = false;
var printedDocStatusAutoHideTimer = 0;
var printedDocPdfDragState = null;

function bindIdCardNodes() {
  idCardOverlay = document.getElementById("idCardOverlay");
  idCardCloseBtn = document.getElementById("idCardCloseBtn");
  idCardViewerNote = document.getElementById("idCardViewerNote");
  idCardPhoto = document.getElementById("idCardPhoto");
  idCardFullName = document.getElementById("idCardFullName");
  idCardAddress = document.getElementById("idCardAddress");
  idCardDob = document.getElementById("idCardDob");
  idCardNumber = document.getElementById("idCardNumber");
  idCardClasses = document.getElementById("idCardClasses");
  idCardExpiry = document.getElementById("idCardExpiry");
  idCardConditions = document.getElementById("idCardConditions");
  if (idCardCloseBtn && idCardCloseBtn.dataset.bound !== "1") {
    idCardCloseBtn.dataset.bound = "1";
    idCardCloseBtn.addEventListener("click", requestCloseIdCard);
  }
  idCardTemplateReady = Boolean(idCardOverlay);
}

function ensureIdCardTemplateLoaded() {
  if (idCardTemplateReady) return Promise.resolve(true);
  if (idCardTemplatePromise) return idCardTemplatePromise;
  idCardTemplatePromise = fetch("license-card.html", { cache: "no-store" })
    .then(function onTemplateResponse(response) {
      if (!response.ok) throw new Error("license-card template request failed");
      return response.text();
    })
    .then(function onTemplateHtml(html) {
      if (idCardMount) idCardMount.innerHTML = String(html || "");
      bindIdCardNodes();
      return idCardTemplateReady;
    })
    .catch(function onTemplateLoadError(err) {
      console.error("[CAD UI] Failed loading license-card.html:", err);
      bindIdCardNodes();
      return idCardTemplateReady;
    })
    .finally(function afterTemplateLoad() {
      idCardTemplatePromise = null;
      if (queuedIdCardPayload && idCardTemplateReady) {
        var payload = queuedIdCardPayload;
        queuedIdCardPayload = null;
        openIdCard(payload);
      }
    });
  return idCardTemplatePromise;
}

function safeGet(obj, key, fallback) {
  if (!obj || typeof obj !== "object") return fallback;
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return fallback;
  return obj[key];
}

function getResourceName() {
  try {
    return GetParentResourceName();
  } catch (_err) {
    return "nui-resource";
  }
}

function postNui(endpoint, payload) {
  return fetch("https://" + getResourceName() + "/" + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(payload || {}),
  });
}

function sanitizeDepartments(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  var seen = {};
  for (var i = 0; i < raw.length; i += 1) {
    var item = raw[i] || {};
    var id = Number(safeGet(item, "id", 0));
    if (!Number.isInteger(id) || id <= 0 || seen[id]) continue;
    seen[id] = true;
    out.push({
      id: id,
      name: String(safeGet(item, "name", "Department #" + String(id)) || "").trim() || ("Department #" + String(id)),
      shortName: String(safeGet(item, "short_name", "") || "").trim(),
      color: String(safeGet(item, "color", "") || "").trim(),
    });
  }
  return out;
}

function sanitizeStringArray(raw, toUpper) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  var seen = {};
  for (var i = 0; i < raw.length; i += 1) {
    var value = String(raw[i] || "").trim();
    if (!value) continue;
    if (toUpper) value = value.toUpperCase();
    if (seen[value]) continue;
    seen[value] = true;
    out.push(value);
  }
  return out;
}

function pad2(value) {
  var num = Number(value);
  if (!Number.isFinite(num)) return "";
  var rounded = Math.floor(num);
  if (rounded < 0) return "";
  return rounded < 10 ? "0" + String(rounded) : String(rounded);
}

function normalizeDateForDateInput(rawValue) {
  var text = String(rawValue || "").trim();
  if (!text) return "";

  var isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[1] + "-" + isoMatch[2] + "-" + isoMatch[3];
  }

  var parts = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!parts) return "";

  var first = Number(parts[1]);
  var second = Number(parts[2]);
  var year = Number(parts[3]);
  if (!Number.isFinite(first) || !Number.isFinite(second) || !Number.isFinite(year)) return "";
  if (year < 1900 || year > 2100) return "";

  // Prefer AU-style day-first, fallback to month-first when day-first is impossible.
  var day = first;
  var month = second;
  if (first <= 12 && second > 12) {
    month = first;
    day = second;
  }

  var candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    (candidate.getUTCMonth() + 1) !== month ||
    candidate.getUTCDate() !== day
  ) {
    candidate = new Date(Date.UTC(year, first - 1, second));
    if (
      candidate.getUTCFullYear() !== year ||
      (candidate.getUTCMonth() + 1) !== first ||
      candidate.getUTCDate() !== second
    ) {
      return "";
    }
    month = first;
    day = second;
  }

  return String(year) + "-" + pad2(month) + "-" + pad2(day);
}

function showErrorNode(node, text) {
  if (!node) return;
  node.textContent = String(text || "");
  if (text) node.classList.remove("hidden");
  else node.classList.add("hidden");
}

function setVisible(node, visible) {
  if (!node) return;
  if (visible) {
    node.classList.remove("hidden");
    node.style.display = "grid";
    node.setAttribute("aria-hidden", "false");
    return;
  }
  node.classList.add("hidden");
  node.style.display = "none";
  node.setAttribute("aria-hidden", "true");
}

function anyModalOpen() {
  return emergencyOpen || trafficStopOpen || jailReleaseOpen || printedDocOpen || licenseOpen || registrationOpen || idCardOpen;
}

function closeAll() {
  cancelEmergencyForm();
  cancelTrafficStopForm();
  cancelJailReleaseForm();
  cancelPrintedDocForm();
  cancelLicenseForm();
  cancelRegistrationForm();
  if (idCardOpen) requestCloseIdCard();
}

function isDepartmentSelected(id) {
  for (var i = 0; i < selectedDepartmentIds.length; i += 1) {
    if (Number(selectedDepartmentIds[i]) === Number(id)) return true;
  }
  return false;
}

function toggleDepartment(id) {
  var next = [];
  var removed = false;
  for (var i = 0; i < selectedDepartmentIds.length; i += 1) {
    var current = Number(selectedDepartmentIds[i]);
    if (current === Number(id)) {
      removed = true;
      continue;
    }
    next.push(current);
  }
  if (!removed) next.push(Number(id));
  selectedDepartmentIds = next;
}

function updateCounters() {
  if (!titleCounter || !detailsCounter || !titleInput || !detailsInput) return;
  titleCounter.textContent = String(titleInput.value.length) + " / " + String(titleLimit);
  detailsCounter.textContent = String(detailsInput.value.length) + " / " + String(detailsLimit);
}

function renderDepartments() {
  if (!departmentsList || !departmentsEmpty) return;
  departmentsList.innerHTML = "";
  showErrorNode(departmentsError, "");
  if (departments.length === 0) {
    departmentsEmpty.classList.remove("hidden");
    departmentsList.classList.add("hidden");
    return;
  }

  departmentsEmpty.classList.add("hidden");
  departmentsList.classList.remove("hidden");

  for (var i = 0; i < departments.length; i += 1) {
    (function renderDepartmentButton(dept) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dept-btn" + (isDepartmentSelected(dept.id) ? " active" : "");
      btn.dataset.id = String(dept.id);

      var title = document.createElement("span");
      title.className = "dept-title";
      title.textContent = dept.name;
      if (dept.color) title.style.color = dept.color;

      var subtitle = document.createElement("span");
      subtitle.className = "dept-subtitle";
      subtitle.textContent = dept.shortName ? dept.shortName : "ID " + String(dept.id);

      btn.appendChild(title);
      btn.appendChild(subtitle);
      btn.addEventListener("click", function onDepartmentClick() {
        toggleDepartment(dept.id);
        renderDepartments();
      });

      departmentsList.appendChild(btn);
    })(departments[i]);
  }
}

function collectSelectedDepartmentIds() {
  var out = [];
  for (var i = 0; i < selectedDepartmentIds.length; i += 1) {
    var id = Number(selectedDepartmentIds[i]);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (out.indexOf(id) >= 0) continue;
    out.push(id);
  }
  return out;
}

function resetEmergencyForm(payload) {
  var data = payload || {};
  titleLimit = Math.max(20, Math.min(120, Number(safeGet(data, "max_title_length", 80)) || 80));
  detailsLimit = Math.max(100, Math.min(1200, Number(safeGet(data, "max_details_length", 600)) || 600));
  titleInput.maxLength = titleLimit;
  detailsInput.maxLength = detailsLimit;

  titleInput.value = "";
  detailsInput.value = "";
  showErrorNode(titleError, "");
  showErrorNode(detailsError, "");
  showErrorNode(departmentsError, "");

  departments = sanitizeDepartments(safeGet(data, "departments", []));
  selectedDepartmentIds = [];
  renderDepartments();
  updateCounters();
  submitBtn.disabled = false;
}

function openEmergencyForm(payload) {
  if (licenseOpen) closeLicenseForm();
  if (registrationOpen) closeRegistrationForm();
  resetEmergencyForm(payload || {});
  emergencyOpen = true;
  setVisible(overlay, true);
  setTimeout(function focusEmergencyTitle() {
    if (titleInput) {
      titleInput.focus();
      titleInput.select();
    }
  }, 40);
}

function closeEmergencyForm() {
  emergencyOpen = false;
  setVisible(overlay, false);
}

async function submitEmergencyForm() {
  var title = String(titleInput.value || "").trim();
  var details = String(detailsInput.value || "").trim();
  var selectedDepartments = collectSelectedDepartmentIds();

  if (!title) {
    showErrorNode(titleError, "Title is required.");
    if (titleInput) titleInput.focus();
    return;
  }
  if (!details) {
    showErrorNode(detailsError, "Reason for calling is required.");
    if (detailsInput) detailsInput.focus();
    return;
  }
  if (departments.length > 0 && selectedDepartments.length === 0) {
    showErrorNode(departmentsError, "Select at least one department.");
    return;
  }

  showErrorNode(titleError, "");
  showErrorNode(detailsError, "");
  showErrorNode(departmentsError, "");
  submitBtn.disabled = true;

  try {
    var response = await postNui("cadBridge000Submit", {
      title: title,
      details: details,
      requested_department_ids: selectedDepartments,
      departments_available: departments.length,
    });
    var result = null;
    try {
      result = await response.json();
    } catch (_err) {
      result = null;
    }
    if (!response.ok || (result && result.ok === false)) {
      if (result && result.error === "title_required") {
        showErrorNode(titleError, "Title is required.");
      } else if (result && result.error === "details_required") {
        showErrorNode(detailsError, "Reason for calling is required.");
      } else if (result && result.error === "departments_required") {
        showErrorNode(departmentsError, "Select at least one department.");
      }
      submitBtn.disabled = false;
      return;
    }
    closeEmergencyForm();
  } catch (_err) {
    submitBtn.disabled = false;
  }
}

function cancelEmergencyForm() {
  if (!emergencyOpen) return;
  postNui("cadBridge000Cancel", {}).catch(function ignoreCancelError() {});
  closeEmergencyForm();
}

function updateTrafficStopCounters() {
  if (trafficStopPlateCounter && trafficStopPlateInput) {
    trafficStopPlateCounter.textContent = String(trafficStopPlateInput.value.length) + " / " + String(trafficStopPlateLimit);
  }
  if (trafficStopLocationCounter && trafficStopLocationInput) {
    trafficStopLocationCounter.textContent = String(trafficStopLocationInput.value.length) + " / " + String(trafficStopLocationLimit);
  }
  if (trafficStopReasonCounter && trafficStopReasonInput) {
    trafficStopReasonCounter.textContent = String(trafficStopReasonInput.value.length) + " / " + String(trafficStopReasonLimit);
  }
  if (trafficStopOutcomeCounter && trafficStopOutcomeInput) {
    trafficStopOutcomeCounter.textContent = String(trafficStopOutcomeInput.value.length) + " / " + String(trafficStopOutcomeLimit);
  }
  if (trafficStopNotesCounter && trafficStopNotesInput) {
    trafficStopNotesCounter.textContent = String(trafficStopNotesInput.value.length) + " / " + String(trafficStopNotesLimit);
  }
}

function resetTrafficStopForm(payload) {
  var data = payload || {};
  trafficStopPlateLimit = Math.max(8, Math.min(32, Number(safeGet(data, "max_plate_length", 16)) || 16));
  trafficStopLocationLimit = Math.max(40, Math.min(240, Number(safeGet(data, "max_location_length", 160)) || 160));
  trafficStopReasonLimit = Math.max(20, Math.min(200, Number(safeGet(data, "max_reason_length", 120)) || 120));
  trafficStopOutcomeLimit = Math.max(20, Math.min(120, Number(safeGet(data, "max_outcome_length", 80)) || 80));
  trafficStopNotesLimit = Math.max(80, Math.min(1200, Number(safeGet(data, "max_notes_length", 500)) || 500));

  if (trafficStopPlateInput) trafficStopPlateInput.maxLength = trafficStopPlateLimit;
  if (trafficStopLocationInput) trafficStopLocationInput.maxLength = trafficStopLocationLimit;
  if (trafficStopReasonInput) trafficStopReasonInput.maxLength = trafficStopReasonLimit;
  if (trafficStopOutcomeInput) trafficStopOutcomeInput.maxLength = trafficStopOutcomeLimit;
  if (trafficStopNotesInput) trafficStopNotesInput.maxLength = trafficStopNotesLimit;

  if (trafficStopPlateInput) trafficStopPlateInput.value = String(safeGet(data, "plate", "") || "");
  if (trafficStopLocationInput) trafficStopLocationInput.value = String(safeGet(data, "location", "") || "");
  if (trafficStopReasonInput) trafficStopReasonInput.value = String(safeGet(data, "reason", "") || "");
  if (trafficStopOutcomeInput) trafficStopOutcomeInput.value = String(safeGet(data, "outcome", "") || "");
  if (trafficStopNotesInput) trafficStopNotesInput.value = String(safeGet(data, "notes", "") || "");

  trafficStopHiddenFields = {
    street: String(safeGet(data, "street", "") || "").trim(),
    crossing: String(safeGet(data, "crossing", "") || "").trim(),
    postal: String(safeGet(data, "postal", "") || "").trim(),
  };

  showErrorNode(trafficStopReasonError, "");
  if (trafficStopSubmitBtn) {
    trafficStopSubmitBtn.disabled = false;
    trafficStopSubmitBtn.textContent = "Log Traffic Stop";
  }
  updateTrafficStopCounters();
}

function openTrafficStopForm(payload) {
  if (emergencyOpen) closeEmergencyForm();
  if (licenseOpen) closeLicenseForm();
  if (registrationOpen) closeRegistrationForm();
  resetTrafficStopForm(payload || {});
  trafficStopOpen = true;
  setVisible(trafficStopOverlay, true);
  setTimeout(function focusTrafficStopReason() {
    if (trafficStopReasonInput) {
      trafficStopReasonInput.focus();
      if (String(trafficStopReasonInput.value || "").trim()) trafficStopReasonInput.select();
    }
  }, 40);
}

function closeTrafficStopForm() {
  trafficStopOpen = false;
  setVisible(trafficStopOverlay, false);
}

async function submitTrafficStopForm() {
  var plate = String(trafficStopPlateInput && trafficStopPlateInput.value || "").trim();
  var location = String(trafficStopLocationInput && trafficStopLocationInput.value || "").trim();
  var reason = String(trafficStopReasonInput && trafficStopReasonInput.value || "").trim();
  var outcome = String(trafficStopOutcomeInput && trafficStopOutcomeInput.value || "").trim();
  var notes = String(trafficStopNotesInput && trafficStopNotesInput.value || "").trim();

  if (!reason) {
    showErrorNode(trafficStopReasonError, "Reason is required.");
    if (trafficStopReasonInput) trafficStopReasonInput.focus();
    return;
  }

  showErrorNode(trafficStopReasonError, "");
  if (trafficStopSubmitBtn) {
    trafficStopSubmitBtn.disabled = true;
    trafficStopSubmitBtn.textContent = "Logging...";
  }

  try {
    var response = await postNui("cadBridgeTrafficStopSubmit", {
      plate: plate,
      location: location,
      street: String(trafficStopHiddenFields.street || ""),
      crossing: String(trafficStopHiddenFields.crossing || ""),
      postal: String(trafficStopHiddenFields.postal || ""),
      reason: reason,
      outcome: outcome,
      notes: notes,
    });
    var result = null;
    try {
      result = await response.json();
    } catch (_err) {
      result = null;
    }
    if (!response.ok || (result && result.ok === false)) {
      if (result && result.error === "reason_required") {
        showErrorNode(trafficStopReasonError, "Reason is required.");
      }
      if (trafficStopSubmitBtn) {
        trafficStopSubmitBtn.disabled = false;
        trafficStopSubmitBtn.textContent = "Log Traffic Stop";
      }
      return;
    }
    closeTrafficStopForm();
  } catch (_err2) {
    if (trafficStopSubmitBtn) {
      trafficStopSubmitBtn.disabled = false;
      trafficStopSubmitBtn.textContent = "Log Traffic Stop";
    }
  }
}

function cancelTrafficStopForm() {
  if (!trafficStopOpen) return;
  postNui("cadBridgeTrafficStopCancel", {}).catch(function ignoreTrafficStopCancelError() {});
  closeTrafficStopForm();
}

function sanitizeJailReleaseOptions(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  for (var i = 0; i < raw.length; i += 1) {
    var item = raw[i] || {};
    var label = String(safeGet(item, "label", "") || "").trim();
    var description = String(safeGet(item, "description", "") || "").trim();
    var id = String(safeGet(item, "id", safeGet(item, "value", String(i + 1))) || "").trim();
    var index = Number(safeGet(item, "index", i + 1));
    if (!label) label = "Release Point " + String(i + 1);
    if (!id) id = String(i + 1);
    if (!Number.isFinite(index) || index < 1) index = i + 1;
    out.push({
      id: id,
      index: Math.floor(index),
      label: label,
      description: description,
    });
  }
  return out;
}

function renderJailReleaseOptions(defaultOptionId) {
  if (!jailReleaseSelect) return;
  jailReleaseSelect.innerHTML = "";

  if (!Array.isArray(jailReleaseOptions) || jailReleaseOptions.length === 0) {
    var emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No release points available";
    jailReleaseSelect.appendChild(emptyOption);
    jailReleaseSelect.disabled = true;
    return;
  }

  jailReleaseSelect.disabled = false;
  var selectedValue = "";
  for (var i = 0; i < jailReleaseOptions.length; i += 1) {
    var option = jailReleaseOptions[i];
    var node = document.createElement("option");
    node.value = String(option.id || "");
    node.dataset.index = String(option.index || (i + 1));
    node.textContent = option.description
      ? (String(option.label || "") + " - " + String(option.description || ""))
      : String(option.label || "");
    jailReleaseSelect.appendChild(node);
    if (!selectedValue && String(defaultOptionId || "") && String(defaultOptionId) === String(option.id)) {
      selectedValue = node.value;
    }
  }
  if (!selectedValue && jailReleaseOptions[0]) selectedValue = String(jailReleaseOptions[0].id || "");
  jailReleaseSelect.value = selectedValue;
}

function resetJailReleaseForm(payload) {
  var data = payload || {};
  var sentenceMinutes = Math.max(0, Math.floor(Number(safeGet(data, "sentence_minutes", 0)) || 0));
  var reason = String(safeGet(data, "reason", "") || "").trim();
  jailReleaseOptions = sanitizeJailReleaseOptions(safeGet(data, "options", []));

  if (jailReleaseSentenceInput) {
    jailReleaseSentenceInput.value = sentenceMinutes > 0
      ? (String(sentenceMinutes) + " minute(s)")
      : "Sentence complete";
  }

  if (jailReleaseReasonText) {
    jailReleaseReasonText.textContent = reason || "No reason provided.";
  }
  if (jailReleaseReasonField) {
    if (reason) jailReleaseReasonField.classList.remove("hidden");
    else jailReleaseReasonField.classList.add("hidden");
  }

  renderJailReleaseOptions(String(safeGet(data, "default_option_id", "") || ""));
  showErrorNode(jailReleaseSelectError, "");
  if (jailReleaseSubmitBtn) {
    jailReleaseSubmitBtn.disabled = jailReleaseOptions.length === 0;
    jailReleaseSubmitBtn.textContent = "Release Me";
  }
}

function openJailReleaseForm(payload) {
  if (emergencyOpen) closeEmergencyForm();
  if (trafficStopOpen) closeTrafficStopForm();
  if (licenseOpen) closeLicenseForm();
  if (registrationOpen) closeRegistrationForm();
  if (idCardOpen) requestCloseIdCard();

  resetJailReleaseForm(payload || {});
  jailReleaseOpen = true;
  setVisible(jailReleaseOverlay, true);
  setTimeout(function focusJailReleaseSelect() {
    if (jailReleaseSelect && !jailReleaseSelect.disabled) jailReleaseSelect.focus();
  }, 40);
}

function closeJailReleaseForm() {
  jailReleaseOpen = false;
  setVisible(jailReleaseOverlay, false);
}

async function submitJailReleaseForm() {
  var selectedId = String(jailReleaseSelect && jailReleaseSelect.value || "").trim();
  var selectedIndex = 0;
  for (var i = 0; i < jailReleaseOptions.length; i += 1) {
    if (String(jailReleaseOptions[i].id || "") === selectedId) {
      selectedIndex = Number(jailReleaseOptions[i].index || 0);
      break;
    }
  }

  if (!selectedId || selectedIndex <= 0) {
    showErrorNode(jailReleaseSelectError, "Select a release point.");
    if (jailReleaseSelect) jailReleaseSelect.focus();
    return;
  }

  showErrorNode(jailReleaseSelectError, "");
  if (jailReleaseSubmitBtn) {
    jailReleaseSubmitBtn.disabled = true;
    jailReleaseSubmitBtn.textContent = "Releasing...";
  }

  try {
    var response = await postNui("cadBridgeJailReleaseSubmit", {
      selected_release_id: selectedId,
      selected_release_index: selectedIndex,
      index: selectedIndex,
    });
    var result = null;
    try {
      result = await response.json();
    } catch (_err) {
      result = null;
    }
    if (!response.ok || (result && result.ok === false)) {
      showErrorNode(jailReleaseSelectError, "Unable to release at the selected point.");
      if (jailReleaseSubmitBtn) {
        jailReleaseSubmitBtn.disabled = false;
        jailReleaseSubmitBtn.textContent = "Release Me";
      }
      return;
    }
    closeJailReleaseForm();
  } catch (_err2) {
    showErrorNode(jailReleaseSelectError, "Unable to release at the selected point.");
    if (jailReleaseSubmitBtn) {
      jailReleaseSubmitBtn.disabled = false;
      jailReleaseSubmitBtn.textContent = "Release Me";
    }
  }
}

function cancelJailReleaseForm() {
  if (!jailReleaseOpen) return;
  postNui("cadBridgeJailReleaseCancel", {}).catch(function ignoreJailReleaseCancelError() {});
  closeJailReleaseForm();
}

function printedDocToTitleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b([a-z])/gi, function onChar(match) {
      return match.toUpperCase();
    });
}

function formatPrintedDocDate(value) {
  var raw = String(value || "").trim();
  if (!raw) return "Unknown";
  var parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return raw;
  try {
    return parsed.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_err) {
    return parsed.toISOString();
  }
}

function formatPrintedDocMoney(value) {
  var amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "N/A";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (_err) {
    return "$" + String(Math.round(amount));
  }
}

function formatPrintedDocJail(value) {
  var minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "N/A";
  return String(Math.floor(minutes)) + " min";
}

function printedDocString(value) {
  return String(value == null ? "" : value).trim();
}

function printedDocFirstNonEmpty(values, fallback) {
  for (var i = 0; i < values.length; i += 1) {
    var value = printedDocString(values[i]);
    if (value) return value;
  }
  return fallback || "";
}

function sanitizePrintedDocPayload(payload) {
  var data = payload && typeof payload === "object" ? payload : {};
  var metadata = safeGet(data, "metadata", {});
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) metadata = {};
  var copiedMetadata = {};
  Object.keys(metadata).forEach(function copyMetadataKey(key) {
    copiedMetadata[key] = metadata[key];
  });
  return {
    source: printedDocString(safeGet(data, "source", "")),
    itemName: printedDocString(safeGet(data, "item_name", "")),
    itemLabel: printedDocString(safeGet(data, "item_label", "")),
    metadata: copiedMetadata,
  };
}

function printedDocPdfLib() {
  if (typeof window === "undefined") return null;
  var lib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
  if (!lib || typeof lib.getDocument !== "function") return null;
  if (lib.GlobalWorkerOptions && !lib.__cadBridgePdfWorkerConfigured) {
    try {
      lib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
      lib.__cadBridgePdfWorkerConfigured = true;
    } catch (err) {
      console.warn("[CAD UI] Failed to configure PDF worker source:", err);
    }
  }
  return lib;
}

function normalizePrintedDocPdfBase64(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  var candidates = [
    safeGet(metadata, "pdf_base64", ""),
    safeGet(metadata, "document_pdf_base64", ""),
    safeGet(metadata, "pdf_data_base64", ""),
  ];
  for (var i = 0; i < candidates.length; i += 1) {
    var raw = String(candidates[i] == null ? "" : candidates[i]).trim();
    if (!raw) continue;
    var match = raw.match(/^data:application\/pdf(?:;charset=[^;,]+)?;base64,(.+)$/i);
    if (match && match[1]) raw = match[1];
    raw = raw.replace(/\s+/g, "");
    if (raw) return raw;
  }
  return "";
}

function normalizePrintedDocPdfMime(metadata) {
  var mime = printedDocString(safeGet(metadata, "pdf_mime", ""));
  if (!mime) mime = "application/pdf";
  return mime;
}

function normalizePrintedDocPdfFilename(metadata) {
  var filename = printedDocString(safeGet(metadata, "pdf_filename", ""));
  if (!filename) {
    var title = printedDocString(safeGet(metadata, "title", "")) || printedDocString(safeGet(metadata, "label", "")) || "cad-printed-document";
    filename = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!filename) filename = "cad-printed-document";
    filename = filename.slice(0, 64);
  }
  if (!/\.pdf$/i.test(filename)) filename += ".pdf";
  return filename;
}

function getPrintedDocPdfAttachment(metadata) {
  var safeMeta = metadata && typeof metadata === "object" ? metadata : {};
  return {
    base64: normalizePrintedDocPdfBase64(safeMeta),
    mime: normalizePrintedDocPdfMime(safeMeta),
    filename: normalizePrintedDocPdfFilename(safeMeta),
  };
}

function getActivePrintedDocMetadata() {
  if (!activePrintedDocPayload || typeof activePrintedDocPayload !== "object") return {};
  var metadata = activePrintedDocPayload.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata;
}

function clearPrintedDocStatusAutoHide() {
  if (!printedDocStatusAutoHideTimer) return;
  try {
    clearTimeout(printedDocStatusAutoHideTimer);
  } catch (_err) {}
  printedDocStatusAutoHideTimer = 0;
}

function setPrintedDocTransientStatus(message, isError, timeoutMs) {
  setPrintedDocPdfStatus(message, isError === true);
  clearPrintedDocStatusAutoHide();
  var wait = Number(timeoutMs);
  if (!Number.isFinite(wait) || wait < 400) wait = 2400;
  printedDocStatusAutoHideTimer = setTimeout(function clearPrintedDocTransientStatus() {
    printedDocStatusAutoHideTimer = 0;
    if (!printedDocOpen) return;
    setPrintedDocPdfStatus("", false);
  }, wait);
}

function fallbackCopyText(text) {
  try {
    var textarea = document.createElement("textarea");
    textarea.value = String(text || "");
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    var copied = false;
    try {
      copied = document.execCommand("copy") === true;
    } catch (_err) {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  } catch (_err) {
    return false;
  }
}

function copyTextToClipboard(text) {
  var payload = String(text == null ? "" : text);
  if (!payload) return Promise.resolve(false);
  if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(payload).then(function onClipboardSuccess() {
      return true;
    }).catch(function onClipboardFailure() {
      return fallbackCopyText(payload);
    });
  }
  return Promise.resolve(fallbackCopyText(payload));
}

function buildPrintedDocShareText() {
  var metadata = getActivePrintedDocMetadata();
  var lines = [];
  var title = printedDocFirstNonEmpty([
    safeGet(metadata, "label", ""),
    safeGet(metadata, "title", ""),
    activePrintedDocPayload && activePrintedDocPayload.itemLabel,
    activePrintedDocPayload && activePrintedDocPayload.itemName
  ], "CAD Printed Document");
  var reference = formatPrintedDocReference(metadata);
  var subject = printedDocFirstNonEmpty([
    safeGet(metadata, "subject_name", ""),
    safeGet(metadata, "subject_display", ""),
    safeGet(metadata, "citizen_id", ""),
    safeGet(metadata, "subject_key", "")
  ], "");
  var officer = printedDocFirstNonEmpty([
    [printedDocString(safeGet(metadata, "officer_callsign", "")), printedDocString(safeGet(metadata, "officer_name", ""))].filter(Boolean).join(" - "),
    safeGet(metadata, "officer_name", ""),
    safeGet(metadata, "officer_callsign", "")
  ], "");
  var statusText = printedDocToTitleCase(printedDocFirstNonEmpty([safeGet(metadata, "status", ""), safeGet(metadata, "payable_status", "")], ""));
  var fineText = formatPrintedDocMoney(printedDocFirstNonEmpty([safeGet(metadata, "fine_amount", 0), safeGet(metadata, "amount", 0)], 0));
  var issuedText = formatPrintedDocDate(printedDocFirstNonEmpty([safeGet(metadata, "issued_at", ""), safeGet(metadata, "printed_at", "")], ""));
  var summaryText = printedDocFirstNonEmpty([safeGet(metadata, "description", ""), safeGet(metadata, "info", "")], "");

  lines.push(title);
  if (reference) lines.push("Reference: " + reference);
  if (subject) lines.push("Subject: " + subject);
  if (officer) lines.push("Officer: " + officer);
  if (statusText) lines.push("Status: " + statusText);
  if (fineText && fineText !== "N/A") lines.push("Fine: " + fineText);
  if (issuedText && issuedText !== "Unknown") lines.push("Issued: " + issuedText);
  if (summaryText) {
    lines.push("");
    lines.push(summaryText);
  }
  return lines.join("\n").trim();
}

function copyPrintedDocShareText() {
  var text = buildPrintedDocShareText();
  if (!text) {
    setPrintedDocTransientStatus("No document details available to copy.", true);
    return;
  }
  copyTextToClipboard(text).then(function onCopied(ok) {
    if (ok) setPrintedDocTransientStatus("Share text copied to clipboard.", false);
    else setPrintedDocTransientStatus("Unable to copy share text in this viewer.", true);
  });
}

function tryClipboardWritePdfBlob(blob) {
  if (!blob) return Promise.resolve(false);
  if (!navigator || !navigator.clipboard || typeof navigator.clipboard.write !== "function") {
    return Promise.resolve(false);
  }
  if (typeof ClipboardItem !== "function") {
    return Promise.resolve(false);
  }
  try {
    var clipboardItem = new ClipboardItem({
      [blob.type || "application/pdf"]: blob,
    });
    return navigator.clipboard.write([clipboardItem]).then(function onWriteOk() {
      return true;
    }).catch(function onWriteErr() {
      return false;
    });
  } catch (_err) {
    return Promise.resolve(false);
  }
}

function copyPrintedDocPdf() {
  var attachment = getPrintedDocPdfAttachment(getActivePrintedDocMetadata());
  if (!attachment.base64) {
    setPrintedDocTransientStatus("This document item does not contain a PDF attachment.", true);
    return;
  }

  var bytes = null;
  try {
    bytes = base64ToUint8Array(attachment.base64);
  } catch (_err) {
    setPrintedDocTransientStatus("PDF data is invalid and could not be copied.", true);
    return;
  }
  var blob = new Blob([bytes], { type: attachment.mime || "application/pdf" });

  tryClipboardWritePdfBlob(blob).then(function onClipboardBlobWrite(blobCopied) {
    if (blobCopied) {
      setPrintedDocTransientStatus("PDF copied to clipboard.", false);
      return;
    }
    var dataUrl = "data:" + (attachment.mime || "application/pdf") + ";base64," + attachment.base64;
    return copyTextToClipboard(dataUrl).then(function onCopyDataUrl(ok) {
      if (ok) {
        setPrintedDocTransientStatus("PDF copied as shareable data URL text.", false, 3000);
      } else {
        setPrintedDocTransientStatus("Unable to copy the PDF in this viewer.", true);
      }
    });
  });
}

function savePrintedDocPdf() {
  var attachment = getPrintedDocPdfAttachment(getActivePrintedDocMetadata());
  if (!attachment.base64) {
    setPrintedDocTransientStatus("This document item does not contain a PDF attachment.", true);
    return;
  }

  var bytes = null;
  try {
    bytes = base64ToUint8Array(attachment.base64);
  } catch (_err) {
    setPrintedDocTransientStatus("PDF data is invalid and could not be saved.", true);
    return;
  }

  try {
    var blob = new Blob([bytes], { type: attachment.mime || "application/pdf" });
    var objectUrl = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = attachment.filename || "cad-printed-document.pdf";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(function revokePrintedDocObjectUrl() {
      try { URL.revokeObjectURL(objectUrl); } catch (_err) {}
    }, 3000);
    setPrintedDocTransientStatus("PDF export started.", false);
  } catch (_err) {
    setPrintedDocTransientStatus("This viewer cannot save PDF files here. Use Copy PDF instead.", true, 3000);
  }
}

function base64ToUint8Array(base64) {
  var binary = atob(String(base64 || ""));
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function setPrintedDocPdfStatus(message, isError) {
  if (!printedDocPdfStatus) return;
  clearPrintedDocStatusAutoHide();
  var text = String(message || "").trim();
  if (!text) {
    printedDocPdfStatus.classList.add("hidden");
    printedDocPdfStatus.classList.remove("is-error");
    printedDocPdfStatus.textContent = "";
    return;
  }
  printedDocPdfStatus.classList.remove("hidden");
  if (isError) printedDocPdfStatus.classList.add("is-error");
  else printedDocPdfStatus.classList.remove("is-error");
  printedDocPdfStatus.textContent = text;
}

function clearPrintedDocPdfPages() {
  if (!printedDocPdfPages) return;
  printedDocPdfPages.innerHTML = "";
}

function clampPrintedDocZoom(value) {
  var next = Number(value);
  if (!Number.isFinite(next)) next = 1;
  if (next < 0.45) next = 0.45;
  if (next > 3.5) next = 3.5;
  return next;
}

function updatePrintedDocZoomLabel() {
  if (!printedDocZoomLabel) return;
  var zoom = clampPrintedDocZoom(printedDocPdfZoom || 1);
  printedDocZoomLabel.textContent = String(Math.round(zoom * 100)) + "%";
}

function setPrintedDocViewerMode(usePdf) {
  printedDocPdfHasPdf = usePdf === true;
  if (printedDocPdfViewport) {
    if (printedDocPdfHasPdf) printedDocPdfViewport.classList.remove("hidden");
    else printedDocPdfViewport.classList.add("hidden");
  }
  if (printedDocFallback) {
    if (printedDocPdfHasPdf) printedDocFallback.classList.add("hidden");
    else printedDocFallback.classList.remove("hidden");
  }
}

function resetPrintedDocPdfViewer() {
  printedDocPdfRenderToken += 1;
  printedDocPdfDoc = null;
  printedDocPdfZoom = 1;
  printedDocPdfFitZoom = 1;
  clearPrintedDocPdfDragState();
  clearPrintedDocPdfPages();
  clearPrintedDocStatusAutoHide();
  setPrintedDocPdfStatus("", false);
  setPrintedDocViewerMode(false);
  updatePrintedDocZoomLabel();
}

function renderPrintedDocPdfPages() {
  var pdfDoc = printedDocPdfDoc;
  var lib = printedDocPdfLib();
  if (!pdfDoc || !printedDocPdfPages || !lib) return Promise.resolve(false);

  var renderToken = ++printedDocPdfRenderToken;
  clearPrintedDocPdfPages();
  setPrintedDocPdfStatus("Rendering PDF...", false);
  updatePrintedDocZoomLabel();

  var zoom = clampPrintedDocZoom(printedDocPdfZoom || 1);
  var chain = Promise.resolve();
  for (var pageNumber = 1; pageNumber <= Number(pdfDoc.numPages || 0); pageNumber += 1) {
    (function renderPage(pageIndex) {
      chain = chain.then(function onPageStep() {
        if (renderToken !== printedDocPdfRenderToken) return false;
        return pdfDoc.getPage(pageIndex).then(function onPageLoaded(page) {
          if (renderToken !== printedDocPdfRenderToken) return false;
          var viewport = page.getViewport({ scale: zoom });
          var canvas = document.createElement("canvas");
          canvas.className = "printed-doc-pdf-page";
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          canvas.style.width = Math.round(viewport.width) + "px";
          canvas.style.height = Math.round(viewport.height) + "px";

          var pageWrap = document.createElement("div");
          pageWrap.className = "printed-doc-pdf-page-wrap";
          var pageLabel = document.createElement("div");
          pageLabel.className = "printed-doc-pdf-page-label";
          pageLabel.textContent = "Page " + String(pageIndex);
          pageWrap.appendChild(canvas);
          if (Number(pdfDoc.numPages || 0) > 1) {
            pageWrap.appendChild(pageLabel);
          }
          printedDocPdfPages.appendChild(pageWrap);

          var context = canvas.getContext("2d", { alpha: false });
          return page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;
        });
      });
    })(pageNumber);
  }

  return chain.then(function onRendered() {
    if (renderToken !== printedDocPdfRenderToken) return false;
    setPrintedDocPdfStatus("", false);
    return true;
  }).catch(function onRenderError(err) {
    if (renderToken !== printedDocPdfRenderToken) return false;
    clearPrintedDocPdfPages();
    setPrintedDocPdfStatus("Unable to render PDF in the in-game viewer. Showing fallback details instead.", true);
    setPrintedDocViewerMode(false);
    console.error("[CAD UI] PDF render failed:", err);
    return false;
  });
}

function loadPrintedDocPdf(metadata) {
  resetPrintedDocPdfViewer();

  var base64 = normalizePrintedDocPdfBase64(metadata || {});
  if (!base64) {
    var pdfMissingSubtype = printedDocString(safeGet(metadata, "document_subtype", "")).toLowerCase();
    if (pdfMissingSubtype === "ticket") {
      setPrintedDocPdfStatus("No PDF was embedded on this ticket. Showing paper-style fallback.", true);
    }
    return Promise.resolve(false);
  }

  var lib = printedDocPdfLib();
  if (!lib) {
    setPrintedDocPdfStatus("PDF viewer library not loaded. Showing fallback details.", true);
    return Promise.resolve(false);
  }

  setPrintedDocViewerMode(true);
  setPrintedDocPdfStatus("Loading PDF...", false);

  var bytes;
  try {
    bytes = base64ToUint8Array(base64);
  } catch (err) {
    setPrintedDocViewerMode(false);
    setPrintedDocPdfStatus("Invalid PDF data on this item. Showing fallback details.", true);
    console.error("[CAD UI] Invalid PDF base64:", err);
    return Promise.resolve(false);
  }

  return lib.getDocument({
    data: bytes,
  }).promise.then(function onPdfLoaded(pdfDoc) {
    printedDocPdfDoc = pdfDoc || null;
    if (!printedDocPdfDoc) {
      setPrintedDocViewerMode(false);
      setPrintedDocPdfStatus("No PDF pages found. Showing fallback details.", true);
      return false;
    }

    return printedDocPdfDoc.getPage(1).then(function onFirstPage(page) {
      var baseViewport = page.getViewport({ scale: 1 });
      var availableWidth = printedDocPdfViewport
        ? Math.max(220, (printedDocPdfViewport.clientWidth || 0) - 26)
        : Math.max(220, baseViewport.width);
      var fitZoom = clampPrintedDocZoom(availableWidth / Math.max(1, baseViewport.width));
      printedDocPdfFitZoom = fitZoom;
      printedDocPdfZoom = fitZoom;
      if (printedDocPdfViewport) {
        printedDocPdfViewport.scrollTop = 0;
        printedDocPdfViewport.scrollLeft = 0;
      }
      return renderPrintedDocPdfPages();
    });
  }).catch(function onPdfLoadError(err) {
    printedDocPdfDoc = null;
    setPrintedDocViewerMode(false);
    setPrintedDocPdfStatus("Unable to open PDF. Showing fallback details instead.", true);
    console.error("[CAD UI] PDF load failed:", err);
    return false;
  });
}

function changePrintedDocZoom(delta) {
  if (!printedDocPdfDoc || !printedDocPdfHasPdf) return;
  printedDocPdfZoom = clampPrintedDocZoom((printedDocPdfZoom || 1) + delta);
  renderPrintedDocPdfPages();
}

function fitPrintedDocPdfToWidth() {
  if (!printedDocPdfDoc || !printedDocPdfHasPdf) return;
  printedDocPdfZoom = clampPrintedDocZoom(printedDocPdfFitZoom || 1);
  renderPrintedDocPdfPages();
}

function clearPrintedDocPdfDragState() {
  printedDocPdfDragState = null;
  if (printedDocPdfViewport && printedDocPdfViewport.classList) {
    printedDocPdfViewport.classList.remove("is-dragging");
  }
}

function beginPrintedDocPdfDrag(event) {
  if (!printedDocPdfViewport || !printedDocPdfHasPdf || !printedDocPdfDoc) return;
  if (!event || event.button !== 0) return;
  printedDocPdfDragState = {
    startX: Number(event.clientX || 0),
    startY: Number(event.clientY || 0),
    scrollLeft: Number(printedDocPdfViewport.scrollLeft || 0),
    scrollTop: Number(printedDocPdfViewport.scrollTop || 0)
  };
  if (printedDocPdfViewport.classList) printedDocPdfViewport.classList.add("is-dragging");
  event.preventDefault();
}

function movePrintedDocPdfDrag(event) {
  if (!printedDocPdfDragState || !printedDocPdfViewport) return;
  var buttons = Number(event && event.buttons);
  if (Number.isFinite(buttons) && buttons > 0 && (buttons & 1) !== 1) {
    clearPrintedDocPdfDragState();
    return;
  }
  var deltaX = Number(event.clientX || 0) - printedDocPdfDragState.startX;
  var deltaY = Number(event.clientY || 0) - printedDocPdfDragState.startY;
  printedDocPdfViewport.scrollLeft = printedDocPdfDragState.scrollLeft - deltaX;
  printedDocPdfViewport.scrollTop = printedDocPdfDragState.scrollTop - deltaY;
  event.preventDefault();
}

function setPrintedDocField(node, value, fallback) {
  if (!node) return;
  var text = printedDocString(value);
  node.textContent = text || String(fallback || "N/A");
}

function formatPrintedDocReference(metadata) {
  var parts = [];
  var recordId = Number(safeGet(metadata, "record_id", 0));
  var warningId = Number(safeGet(metadata, "warning_id", 0));
  var infringementNoticeId = Number(safeGet(metadata, "infringement_notice_id", 0));
  var printJobId = Number(safeGet(metadata, "cad_print_job_id", 0));
  var noticeNumber = printedDocString(safeGet(metadata, "notice_number", ""));
  var citizenId = printedDocString(safeGet(metadata, "citizen_id", ""));
  var subjectKey = printedDocString(safeGet(metadata, "subject_key", ""));
  if (Number.isInteger(recordId) && recordId > 0) parts.push("Record #" + String(recordId));
  if (Number.isInteger(warningId) && warningId > 0) parts.push("Warning #" + String(warningId));
  if (noticeNumber) parts.push("Notice " + noticeNumber);
  if (Number.isInteger(infringementNoticeId) && infringementNoticeId > 0) parts.push("Infringement #" + String(infringementNoticeId));
  if (Number.isInteger(printJobId) && printJobId > 0) parts.push("Print Job #" + String(printJobId));
  if (citizenId) parts.push("CID " + citizenId);
  if (subjectKey) parts.push("Ref " + subjectKey);
  return parts.join(" | ");
}

function formatPrintedDocExtraValue(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    var out = [];
    for (var i = 0; i < value.length; i += 1) {
      if (value[i] == null) continue;
      out.push(String(value[i]));
    }
    return out.join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_err) {
      return String(value);
    }
  }
  return String(value);
}

function renderPrintedDocExtra(metadata) {
  if (!printedDocExtra || !printedDocExtraSection) return;
  printedDocExtra.innerHTML = "";

  var skipKeys = {
    document_type: true,
    document_subtype: true,
    cad_print_job_id: true,
    title: true,
    label: true,
    description: true,
    info: true,
    notes: true,
    source: true,
    record_id: true,
    record_type: true,
    warning_id: true,
    citizen_id: true,
    subject_name: true,
    subject_display: true,
    subject_key: true,
    subject_type: true,
    officer_name: true,
    officer_callsign: true,
    fine_amount: true,
    payable_status: true,
    jail_minutes: true,
    issued_at: true,
    printed_at: true,
    status: true,
    item_name: true,
    item_label: true,
    pdf_base64: true,
    document_pdf_base64: true,
    pdf_data_base64: true,
    pdf_mime: true,
    pdf_filename: true,
    pdf_layout: true,
  };

  var keys = Object.keys(metadata || {});
  keys.sort();
  var count = 0;
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    if (skipKeys[key]) continue;
    var rawValue = metadata[key];
    var formattedValue = printedDocString(formatPrintedDocExtraValue(rawValue));
    if (!formattedValue) continue;
    count += 1;

    var row = document.createElement("div");
    row.className = "printed-doc-extra-row";

    var keyNode = document.createElement("div");
    keyNode.className = "printed-doc-extra-key";
    keyNode.textContent = printedDocToTitleCase(key);

    var valueNode = document.createElement("div");
    valueNode.className = "printed-doc-extra-value";
    valueNode.textContent = formattedValue;

    row.appendChild(keyNode);
    row.appendChild(valueNode);
    printedDocExtra.appendChild(row);

    if (count >= 10) break;
  }

  if (count > 0) printedDocExtraSection.classList.remove("hidden");
  else printedDocExtraSection.classList.add("hidden");
}

function resetPrintedDocForm(payload) {
  var normalized = sanitizePrintedDocPayload(payload || {});
  activePrintedDocPayload = normalized;
  var metadata = normalized.metadata || {};

  var subtype = printedDocString(safeGet(metadata, "document_subtype", ""));
  var isTicketDoc = subtype.toLowerCase() === "ticket";
  if (printedDocOverlay && printedDocOverlay.classList) {
    if (isTicketDoc) printedDocOverlay.classList.add("printed-doc-overlay--ticket");
    else printedDocOverlay.classList.remove("printed-doc-overlay--ticket");
  }
  if (printedDocPopup && printedDocPopup.classList) {
    if (isTicketDoc) printedDocPopup.classList.add("printed-doc-popup--ticket");
    else printedDocPopup.classList.remove("printed-doc-popup--ticket");
  }
  if (printedDocFallback && printedDocFallback.classList) {
    if (isTicketDoc) printedDocFallback.classList.add("printed-doc-paper-ticket");
    else printedDocFallback.classList.remove("printed-doc-paper-ticket");
  }
  var typeText = subtype ? printedDocToTitleCase(subtype) : "Document";
  var titleText = printedDocFirstNonEmpty([
    safeGet(metadata, "label", ""),
    safeGet(metadata, "title", ""),
    normalized.itemLabel,
    normalized.itemName
  ], "Printed Document");
  var subtitleParts = [];
  var sourceText = printedDocString(safeGet(metadata, "source", "")) || normalized.source;
  if (sourceText) subtitleParts.push(printedDocToTitleCase(sourceText));
  if (normalized.itemLabel) subtitleParts.push("Item: " + normalized.itemLabel);
  else if (normalized.itemName) subtitleParts.push("Item: " + normalized.itemName);

  if (printedDocType) printedDocType.textContent = typeText;
  if (printedDocTitle) printedDocTitle.textContent = titleText;
  if (printedDocSubtitle) printedDocSubtitle.textContent = subtitleParts.join(" | ") || "Issued via CAD";

  var subjectText = printedDocFirstNonEmpty([
    safeGet(metadata, "subject_name", ""),
    safeGet(metadata, "subject_display", ""),
    safeGet(metadata, "citizen_id", ""),
    safeGet(metadata, "subject_key", "")
  ], "Not set");
  var officerText = printedDocFirstNonEmpty([
    [printedDocString(safeGet(metadata, "officer_callsign", "")), printedDocString(safeGet(metadata, "officer_name", ""))].filter(Boolean).join(" - "),
    safeGet(metadata, "officer_name", ""),
    safeGet(metadata, "officer_callsign", "")
  ], "Unknown");

  setPrintedDocField(printedDocSubject, subjectText, "Not set");
  setPrintedDocField(printedDocOfficer, officerText, "Unknown");
  setPrintedDocField(
    printedDocIssued,
    formatPrintedDocDate(printedDocFirstNonEmpty([safeGet(metadata, "issued_at", ""), safeGet(metadata, "printed_at", "")], "")),
    "Unknown"
  );
  if (printedDocStatus && printedDocStatus.parentElement && printedDocStatus.parentElement.classList) {
    if (isTicketDoc) printedDocStatus.parentElement.classList.add("hidden");
    else printedDocStatus.parentElement.classList.remove("hidden");
  }
  setPrintedDocField(
    printedDocStatus,
    printedDocToTitleCase(printedDocFirstNonEmpty([
      safeGet(metadata, "status", ""),
      isTicketDoc ? "" : safeGet(metadata, "payable_status", "")
    ], "")),
    "N/A"
  );
  setPrintedDocField(
    printedDocFine,
    formatPrintedDocMoney(printedDocFirstNonEmpty([safeGet(metadata, "fine_amount", 0), safeGet(metadata, "amount", 0)], 0)),
    "N/A"
  );
  setPrintedDocField(printedDocJail, formatPrintedDocJail(safeGet(metadata, "jail_minutes", 0)), "N/A");
  var referenceText = formatPrintedDocReference(metadata);
  setPrintedDocField(printedDocReference, referenceText, "N/A");
  if (printedDocQuickReference) {
    printedDocQuickReference.textContent = printedDocString(referenceText) || "N/A";
  }

  var summaryText = printedDocFirstNonEmpty([
    safeGet(metadata, "description", ""),
    safeGet(metadata, "info", ""),
    safeGet(metadata, "title", "")
  ], "No summary available.");
  if (printedDocSummary) printedDocSummary.textContent = summaryText;

  var notesText = printedDocFirstNonEmpty([
    safeGet(metadata, "notes", "")
  ], "");
  if (printedDocNotes) printedDocNotes.textContent = notesText;
  if (printedDocNotesSection) {
    if (notesText && notesText !== summaryText) printedDocNotesSection.classList.remove("hidden");
    else printedDocNotesSection.classList.add("hidden");
  }

  renderPrintedDocExtra(metadata);
}

function openPrintedDocForm(payload) {
  if (emergencyOpen) closeEmergencyForm();
  if (trafficStopOpen) closeTrafficStopForm();
  if (jailReleaseOpen) closeJailReleaseForm();
  if (licenseOpen) closeLicenseForm();
  if (registrationOpen) closeRegistrationForm();
  if (idCardOpen) requestCloseIdCard();

  resetPrintedDocForm(payload || {});
  printedDocOpen = true;
  setVisible(printedDocOverlay, true);
  setTimeout(function loadPrintedDocAfterOpen() {
    if (!printedDocOpen || !activePrintedDocPayload || !activePrintedDocPayload.metadata) return;
    loadPrintedDocPdf(activePrintedDocPayload.metadata || {});
  }, 20);
  setTimeout(function focusPrintedDocClose() {
    if (printedDocCloseBtn) printedDocCloseBtn.focus();
    else if (printedDocCancelBtn) printedDocCancelBtn.focus();
  }, 40);
}

function closePrintedDocForm() {
  printedDocOpen = false;
  activePrintedDocPayload = null;
  resetPrintedDocPdfViewer();
  if (printedDocOverlay && printedDocOverlay.classList) printedDocOverlay.classList.remove("printed-doc-overlay--ticket");
  if (printedDocPopup && printedDocPopup.classList) printedDocPopup.classList.remove("printed-doc-popup--ticket");
  setVisible(printedDocOverlay, false);
}

function cancelPrintedDocForm() {
  if (!printedDocOpen) return;
  postNui("cadBridgePrintedDocClose", {}).catch(function ignorePrintedDocCloseError() {});
  closePrintedDocForm();
}

var LICENSE_QUIZ_QUESTION_POOL = [
  {
    id: "q1",
    question: "At a STOP sign in Australia, what must you do?",
    options: [
      "Slow down and continue if clear",
      "Come to a complete stop and give way",
      "Honk and proceed first"
    ],
    answer: 1
  },
  {
    id: "q2",
    question: "What is the default urban speed limit unless signed otherwise?",
    options: [
      "40 km/h",
      "50 km/h",
      "60 km/h"
    ],
    answer: 1
  },
  {
    id: "q3",
    question: "When turning left at lights with pedestrians crossing, you must:",
    options: [
      "Give way to pedestrians",
      "Drive through if you are first",
      "Flash headlights to warn them"
    ],
    answer: 0
  },
  {
    id: "q4",
    question: "On multi-lane roads, you should normally keep:",
    options: [
      "In the right lane at all times",
      "In the left lane unless overtaking or turning right",
      "Any lane regardless of traffic"
    ],
    answer: 1
  },
  {
    id: "q5",
    question: "Using a hand-held phone while driving is:",
    options: [
      "Allowed below 40 km/h",
      "Allowed at traffic lights",
      "Illegal"
    ],
    answer: 2
  },
  {
    id: "q6",
    question: "When approaching a roundabout, you must:",
    options: [
      "Give way to vehicles already in the roundabout",
      "Enter first if you are on the right",
      "Always stop even if clear"
    ],
    answer: 0
  },
  {
    id: "q7",
    question: "A flashing yellow traffic light means:",
    options: [
      "Stop and wait",
      "Proceed with caution and obey give-way rules",
      "Traffic lights are off so you can ignore signs"
    ],
    answer: 1
  },
  {
    id: "q8",
    question: "In wet weather, your safe following distance should:",
    options: [
      "Stay the same as dry conditions",
      "Be reduced because speeds are lower",
      "Increase to allow extra stopping distance"
    ],
    answer: 2
  },
  {
    id: "q9",
    question: "You may overtake on the left only when:",
    options: [
      "The vehicle ahead is turning right or it is safe in marked lanes",
      "You are in a hurry",
      "There is a school zone"
    ],
    answer: 0
  },
  {
    id: "q10",
    question: "Seatbelts must be worn by:",
    options: [
      "Driver only",
      "Front passengers only",
      "All occupants where fitted"
    ],
    answer: 2
  },
  {
    id: "q11",
    question: "At a pedestrian crossing without lights, you must:",
    options: [
      "Give way to pedestrians on or entering the crossing",
      "Sound horn and continue",
      "Only stop for children"
    ],
    answer: 0
  },
  {
    id: "q12",
    question: "What should you do before changing lanes?",
    options: [
      "Brake hard first",
      "Check mirrors, blind spot, then indicate",
      "Only indicate if another car is close"
    ],
    answer: 1
  }
];

function pickRandomQuizQuestions(count) {
  var normalizedCount = Number(count);
  if (!Number.isFinite(normalizedCount) || normalizedCount < 1) normalizedCount = 5;
  var desiredCount = Math.min(Math.floor(normalizedCount), LICENSE_QUIZ_QUESTION_POOL.length);
  var pool = LICENSE_QUIZ_QUESTION_POOL.slice(0);
  for (var i = pool.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }
  return pool.slice(0, desiredCount);
}

function renderLicenseQuiz() {
  if (!licenseQuizList) return;
  licenseQuizList.innerHTML = "";

  for (var i = 0; i < activeQuizQuestions.length; i += 1) {
    (function renderQuestion(questionObj, questionIndex) {
      var wrapper = document.createElement("div");
      wrapper.className = "field";

      var title = document.createElement("label");
      title.textContent = String(questionIndex + 1) + ". " + questionObj.question;
      wrapper.appendChild(title);

      var optionsGrid = document.createElement("div");
      optionsGrid.className = "chip-grid";

      for (var optionIndex = 0; optionIndex < questionObj.options.length; optionIndex += 1) {
        (function renderOption(index) {
          var btn = document.createElement("button");
          btn.type = "button";
          var isActive = Number(quizAnswers[questionObj.id]) === index;
          btn.className = "chip-btn" + (isActive ? " active" : "");
          btn.textContent = questionObj.options[index];
          btn.addEventListener("click", function onQuizAnswerClick() {
            quizAnswers[questionObj.id] = index;
            renderLicenseQuiz();
          });
          optionsGrid.appendChild(btn);
        })(optionIndex);
      }

      wrapper.appendChild(optionsGrid);
      licenseQuizList.appendChild(wrapper);
    })(activeQuizQuestions[i], i);
  }
}

function setLicenseMode(mode) {
  licenseViewMode = String(mode || "quiz");
  setVisible(licenseStatusPanel, licenseViewMode === "blocked" || (licenseViewMode === "quiz" && licenseShowStatusPanel));
  setVisible(licenseQuizPanel, licenseViewMode === "quiz");
  setVisible(licensePassPanel, licenseViewMode === "pass");
  if (licenseSubmitBtn) {
    var showSubmit = licenseViewMode === "quiz";
    licenseSubmitBtn.textContent = licenseViewMode === "pass" ? "Processing..." : "Submit Quiz";
    licenseSubmitBtn.disabled = !showSubmit;
    licenseSubmitBtn.classList.toggle("hidden", !showSubmit);
  }
  if (licenseCancelBtn) {
    licenseCancelBtn.textContent = licenseViewMode === "blocked" ? "Exit" : "Cancel";
  }
}

function normalizeExistingLicense(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    full_name: String(raw.full_name || "").trim(),
    date_of_birth: String(raw.date_of_birth || "").trim(),
    gender: String(raw.gender || "").trim(),
    license_number: String(raw.license_number || "").trim(),
    license_classes: sanitizeStringArray(Array.isArray(raw.license_classes) ? raw.license_classes : [], true),
    conditions: sanitizeStringArray(Array.isArray(raw.conditions) ? raw.conditions : [], false),
    expiry_at: String(raw.expiry_at || "").trim(),
    status: String(raw.status || "").trim(),
    days_until_expiry: Number(raw.days_until_expiry),
  };
}

function resetLicenseForm(payload) {
  var data = payload || {};
  quizAnswers = {};
  activeQuizQuestions = pickRandomQuizQuestions(Number(safeGet(data, "quiz_question_count", 5)) || 5);
  quizPassPercent = Number(safeGet(data, "quiz_pass_percent", 80));
  if (!Number.isFinite(quizPassPercent) || quizPassPercent < 1) quizPassPercent = 80;
  licenseRenewalWindowDays = Number(safeGet(data, "renewal_window_days", 3));
  if (!Number.isFinite(licenseRenewalWindowDays) || licenseRenewalWindowDays < 0) licenseRenewalWindowDays = 3;
  existingLicenseSnapshot = normalizeExistingLicense(safeGet(data, "existing_license", null));
  licenseShowStatusPanel = false;
  pendingLicenseSubmissionPayload = null;
  if (licenseContinuePhotoBtn) licenseContinuePhotoBtn.disabled = false;
  if (licenseCancelBtn) licenseCancelBtn.disabled = false;
  if (licenseCloseBtn) licenseCloseBtn.disabled = false;

  if (licenseNameInput) licenseNameInput.value = String(safeGet(data, "full_name", "") || "");
  if (licenseDobInput) {
    licenseDobInput.value = normalizeDateForDateInput(safeGet(data, "date_of_birth", ""));
  }
  if (licenseGenderInput) licenseGenderInput.value = String(safeGet(data, "gender", "") || "");
  renderLicenseQuiz();
  showErrorNode(licenseFormError, "");

  var canTakeQuiz = safeGet(data, "can_take_quiz", true) === true;
  var canRetakePhoto = safeGet(data, "can_retake_photo", false) === true;
  var blockedMessage = String(safeGet(data, "blocked_message", "") || "").trim();
  var expiryText = existingLicenseSnapshot && existingLicenseSnapshot.expiry_at ? existingLicenseSnapshot.expiry_at : "unknown";
  var statusText = existingLicenseSnapshot && existingLicenseSnapshot.status ? existingLicenseSnapshot.status : "unknown";

  if (!canTakeQuiz) {
    licenseShowStatusPanel = true;
    if (licenseStatusMessage) {
      if (blockedMessage) {
        licenseStatusMessage.textContent = blockedMessage;
      } else {
        licenseStatusMessage.textContent =
          "You already have a valid licence (status: " + statusText + ", expiry: " + expiryText + "). " +
          "You can take a new test within " + String(licenseRenewalWindowDays) + " days of expiry.";
      }
    }
    if (licenseRetakePhotoBtn) licenseRetakePhotoBtn.disabled = !canRetakePhoto;
    setLicenseMode("blocked");
    return;
  }

  if (licenseStatusMessage && existingLicenseSnapshot) {
    var days = Number(existingLicenseSnapshot.days_until_expiry);
    if (Number.isFinite(days)) {
      licenseStatusMessage.textContent = "Current licence found. Days until expiry: " + String(days) + ". You can retake your photo now.";
    } else {
      licenseStatusMessage.textContent = "Current licence found. You can retake your photo now.";
    }
  }
  licenseShowStatusPanel = canRetakePhoto && existingLicenseSnapshot !== null;
  if (licenseRetakePhotoBtn) licenseRetakePhotoBtn.disabled = !canRetakePhoto;
  setLicenseMode("quiz");
}

function openLicenseForm(payload) {
  if (emergencyOpen) closeEmergencyForm();
  if (registrationOpen) closeRegistrationForm();
  resetLicenseForm(payload || {});
  licenseOpen = true;
  setVisible(licenseOverlay, true);
  setTimeout(function focusLicenseInput() {
    if (licenseSubmitBtn) licenseSubmitBtn.focus();
  }, 40);
}

function closeLicenseForm() {
  licenseOpen = false;
  setVisible(licenseOverlay, false);
}

async function submitLicenseForm() {
  if (licenseViewMode !== "quiz") return;
  var fullName = String(licenseNameInput && licenseNameInput.value || "").trim();
  var dateOfBirth = String(licenseDobInput && licenseDobInput.value || "").trim();
  var gender = String(licenseGenderInput && licenseGenderInput.value || "").trim();
  if (!fullName || !dateOfBirth || !gender) {
    showErrorNode(licenseFormError, "Character details are missing. Reopen the quiz.");
    return;
  }

  var answered = 0;
  var correct = 0;
  for (var i = 0; i < activeQuizQuestions.length; i += 1) {
    var questionObj = activeQuizQuestions[i];
    var selected = Number(quizAnswers[questionObj.id]);
    if (!Number.isInteger(selected)) continue;
    answered += 1;
    if (selected === Number(questionObj.answer)) correct += 1;
  }

  if (answered < activeQuizQuestions.length) {
    showErrorNode(licenseFormError, "Please answer every question.");
    return;
  }

  var scorePercent = Math.floor((correct / activeQuizQuestions.length) * 100);
  if (scorePercent < quizPassPercent) {
    showErrorNode(
      licenseFormError,
      "Quiz failed (" + String(scorePercent) + "%). You need " + String(quizPassPercent) + "% or more."
    );
    return;
  }

  pendingLicenseSubmissionPayload = {
    full_name: fullName,
    date_of_birth: dateOfBirth,
    gender: gender,
    license_classes: ["CAR"],
    conditions: [],
    expiry_days: 30,
    quiz_mode: true,
    quiz_score_percent: scorePercent,
    quiz_total_questions: activeQuizQuestions.length,
    quiz_correct_answers: correct
  };
  if (licensePassMessage) {
    licensePassMessage.textContent =
      "Congratulations, you passed with " + String(scorePercent) + "%. " +
      "Your photo will now be taken for your licence record.";
  }
  showErrorNode(licenseFormError, "");
  setLicenseMode("pass");
}

async function submitPendingLicenseAfterPass() {
  if (!pendingLicenseSubmissionPayload) return;
  if (licenseContinuePhotoBtn) licenseContinuePhotoBtn.disabled = true;
  if (licenseCancelBtn) licenseCancelBtn.disabled = true;
  if (licenseCloseBtn) licenseCloseBtn.disabled = true;
  try {
    var response = await postNui("cadBridgeLicenseSubmit", pendingLicenseSubmissionPayload);
    var result = null;
    try {
      result = await response.json();
    } catch (_err) {
      result = null;
    }
    if (!response.ok || (result && result.ok === false)) {
      showErrorNode(licenseFormError, "Unable to submit quiz result.");
      setLicenseMode("pass");
      if (licenseContinuePhotoBtn) licenseContinuePhotoBtn.disabled = false;
      if (licenseCancelBtn) licenseCancelBtn.disabled = false;
      if (licenseCloseBtn) licenseCloseBtn.disabled = false;
      return;
    }
    closeLicenseForm();
  } catch (_err2) {
    showErrorNode(licenseFormError, "Unable to submit quiz result.");
    setLicenseMode("pass");
    if (licenseContinuePhotoBtn) licenseContinuePhotoBtn.disabled = false;
    if (licenseCancelBtn) licenseCancelBtn.disabled = false;
    if (licenseCloseBtn) licenseCloseBtn.disabled = false;
  }
}

async function requestLicensePhotoRetake() {
  if (!existingLicenseSnapshot) {
    showErrorNode(licenseFormError, "No existing licence found for photo retake.");
    return;
  }
  if (licenseRetakePhotoBtn) licenseRetakePhotoBtn.disabled = true;
  if (licenseCancelBtn) licenseCancelBtn.disabled = true;
  if (licenseCloseBtn) licenseCloseBtn.disabled = true;

  try {
    var response = await postNui("cadBridgeLicenseRetakePhoto", {
      existing_license: existingLicenseSnapshot
    });
    var result = null;
    try {
      result = await response.json();
    } catch (_err) {
      result = null;
    }
    if (!response.ok || (result && result.ok === false)) {
      showErrorNode(licenseFormError, "Unable to start photo retake.");
      if (licenseRetakePhotoBtn) licenseRetakePhotoBtn.disabled = false;
      if (licenseCancelBtn) licenseCancelBtn.disabled = false;
      if (licenseCloseBtn) licenseCloseBtn.disabled = false;
      return;
    }
    closeLicenseForm();
  } catch (_err2) {
    showErrorNode(licenseFormError, "Unable to start photo retake.");
    if (licenseRetakePhotoBtn) licenseRetakePhotoBtn.disabled = false;
    if (licenseCancelBtn) licenseCancelBtn.disabled = false;
    if (licenseCloseBtn) licenseCloseBtn.disabled = false;
  }
}

function cancelLicenseForm() {
  if (!licenseOpen) return;
  postNui("cadBridgeLicenseCancel", {}).catch(function ignoreCancelError() {});
  closeLicenseForm();
}

function normalizeDurationOptions(raw, fallback) {
  var list = Array.isArray(raw) ? raw : [];
  var out = [];
  var seen = {};
  for (var i = 0; i < list.length; i += 1) {
    var value = Number(list[i]);
    if (!Number.isFinite(value) || value < 1) continue;
    var rounded = Math.floor(value);
    if (seen[rounded]) continue;
    seen[rounded] = true;
    out.push(rounded);
  }
  if (out.length === 0) out = [Number(fallback) || 35];
  out.sort(function sortNumber(a, b) { return a - b; });
  return out;
}

function getLicenseDurationLabel(days) {
  var value = Number(days) || 0;
  if (value === 1) return "Temporary (1 day)";
  if (value === 6) return "6 months (6 days)";
  if (value === 14) return "2 years (2 weeks)";
  if (value === 35) return "5 years (5 weeks)";
  if (value === 70) return "10 years (10 weeks)";
  return String(value) + " day" + (value === 1 ? "" : "s");
}

function renderRegistrationDurations(defaultDuration) {
  if (!regoDurationList) return;
  regoDurationList.innerHTML = "";
  var fallback = Number(defaultDuration) || 35;
  durationOptions = normalizeDurationOptions(durationOptions, fallback);
  selectedRegistrationDurationDays = durationOptions.indexOf(fallback) >= 0 ? fallback : durationOptions[0];

  for (var i = 0; i < durationOptions.length; i += 1) {
    (function renderDurationButton(optionValue) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn" + (selectedRegistrationDurationDays === optionValue ? " active" : "");
      btn.textContent = getLicenseDurationLabel(optionValue);
      btn.addEventListener("click", function onDurationClick() {
        selectedRegistrationDurationDays = optionValue;
        renderRegistrationDurations(optionValue);
      });
      regoDurationList.appendChild(btn);
    })(durationOptions[i]);
  }
}

function resetRegistrationForm(payload) {
  var data = payload || {};
  if (regoOwnerInput) regoOwnerInput.value = String(safeGet(data, "owner_name", "") || "");
  if (regoPlateInput) regoPlateInput.value = String(safeGet(data, "plate", "") || "");
  if (regoModelInput) regoModelInput.value = String(safeGet(data, "vehicle_model", "") || "");
  if (regoColourInput) regoColourInput.value = String(safeGet(data, "vehicle_colour", "") || "");
  durationOptions = Array.isArray(data.duration_options) ? data.duration_options : [];
  renderRegistrationDurations(Number(safeGet(data, "default_duration_days", 35)) || 35);
  registrationSubmitPending = false;
  if (registrationSubmitBtn) registrationSubmitBtn.disabled = false;
  if (registrationSubmitBtn) registrationSubmitBtn.textContent = "Save Registration";
  showErrorNode(registrationFormError, "");
}

function openRegistrationForm(payload) {
  if (emergencyOpen) closeEmergencyForm();
  if (licenseOpen) closeLicenseForm();
  resetRegistrationForm(payload || {});
  registrationOpen = true;
  setVisible(registrationOverlay, true);
  setTimeout(function focusRegoDuration() {
    var selectedButton = regoDurationList && regoDurationList.querySelector("button.active") || regoDurationList && regoDurationList.querySelector("button");
    if (selectedButton) selectedButton.focus();
  }, 40);
}

function closeRegistrationForm() {
  registrationOpen = false;
  registrationSubmitPending = false;
  setVisible(registrationOverlay, false);
  if (registrationSubmitBtn) {
    registrationSubmitBtn.disabled = false;
    registrationSubmitBtn.textContent = "Save Registration";
  }
}

async function submitRegistrationForm() {
  if (registrationSubmitPending) return;

  var ownerName = String(regoOwnerInput && regoOwnerInput.value || "").trim();
  var plate = String(regoPlateInput && regoPlateInput.value || "").trim().toUpperCase();
  var model = String(regoModelInput && regoModelInput.value || "").trim();
  if (!ownerName || !plate || !model) {
    showErrorNode(registrationFormError, "Owner, plate and model are required.");
    return;
  }
  showErrorNode(registrationFormError, "");
  if (registrationSubmitBtn) registrationSubmitBtn.disabled = true;

  var durationDays = Number(selectedRegistrationDurationDays || 0);
  if (!Number.isFinite(durationDays) || durationDays < 1) durationDays = 35;
  var payload = {
    owner_name: ownerName,
    plate: plate,
    vehicle_model: model,
    vehicle_colour: String(regoColourInput && regoColourInput.value || "").trim(),
    duration_days: Math.floor(durationDays),
  };

  try {
    var response = await postNui("cadBridgeRegistrationSubmit", payload);
    var result = null;
    try {
      result = await response.json();
    } catch (_err) {
      result = null;
    }
    if (!response.ok || (result && result.ok === false)) {
      var errorCode = String(result && result.error || "").trim();
      if (errorCode === "submit_in_progress") {
        showErrorNode(registrationFormError, "Registration is already being submitted. Please wait.");
      } else if (errorCode === "invalid_form") {
        showErrorNode(registrationFormError, "Owner, plate and model are required.");
      } else {
        showErrorNode(registrationFormError, "Unable to submit registration form.");
      }
      if (registrationSubmitBtn) registrationSubmitBtn.disabled = false;
      return;
    }
    if (result && (result.pending === true || result.accepted === true)) {
      registrationSubmitPending = true;
      if (registrationSubmitBtn) {
        registrationSubmitBtn.disabled = true;
        registrationSubmitBtn.textContent = "Saving...";
      }
      return;
    }
    closeRegistrationForm();
  } catch (_err2) {
    showErrorNode(registrationFormError, "Unable to submit registration form.");
    if (registrationSubmitBtn) registrationSubmitBtn.disabled = false;
  }
}

function cancelRegistrationForm() {
  if (!registrationOpen) return;
  postNui("cadBridgeRegistrationCancel", {}).catch(function ignoreCancelError() {});
  closeRegistrationForm();
}

function setTextNode(node, value, fallback) {
  if (!node) return;
  var text = String(value || "").trim();
  node.textContent = text || String(fallback || "");
}

function setIdCardField(fieldName, value, fallback, legacyNode) {
  var text = String(value || "").trim();
  var resolved = text || String(fallback || "");
  var wrotePlaceholder = false;
  if (idCardOverlay) {
    var selector = '[data-license-field="' + String(fieldName || "") + '"]';
    var nodes = idCardOverlay.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].textContent = resolved;
      wrotePlaceholder = true;
    }
  }
  if (legacyNode) {
    legacyNode.textContent = resolved;
    return;
  }
  if (!wrotePlaceholder) return;
}

function setIdCardImage(fieldName, src, legacyNode) {
  var imageSrc = String(src || "").trim();
  var wrotePlaceholder = false;
  if (idCardOverlay) {
    var selector = '[data-license-image="' + String(fieldName || "") + '"]';
    var nodes = idCardOverlay.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i += 1) {
      if (imageSrc) nodes[i].setAttribute("src", imageSrc);
      else nodes[i].removeAttribute("src");
      wrotePlaceholder = true;
    }
  }
  if (legacyNode) {
    if (imageSrc) legacyNode.setAttribute("src", imageSrc);
    else legacyNode.removeAttribute("src");
    return;
  }
  if (!wrotePlaceholder) return;
}

function extractDisplayNameForCard(payload) {
  var firstName = String(safeGet(payload || {}, "first_name", "") || "").trim();
  var lastName = String(safeGet(payload || {}, "last_name", "") || "").trim();
  var combined = String(firstName + " " + lastName).trim();
  if (combined) return combined;

  var fullName = String(safeGet(payload || {}, "full_name", "") || "").trim();
  if (fullName) {
    var fullParts = fullName.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (fullParts.length >= 2) {
      return String(fullParts[0] + " " + fullParts[fullParts.length - 1]).trim();
    }
    return String(fullName).trim();
  }

  return firstName;
}

function formatDateForCard(value) {
  var normalized = normalizeDateForDateInput(value);
  if (!normalized) return String(value || "").trim();
  var parts = normalized.split("-");
  if (parts.length !== 3) return normalized;
  return parts[2] + "-" + parts[1] + "-" + parts[0];
}

function listToText(value, fallback) {
  var listSource = [];
  if (Array.isArray(value)) {
    listSource = value;
  } else {
    var single = String(value || "").trim();
    if (single) listSource = [single];
  }
  var list = sanitizeStringArray(listSource, false);
  if (list.length === 0) return String(fallback || "None");
  return list.join(", ");
}

function sanitizeConditionsForCard(value) {
  var source = [];
  if (Array.isArray(value)) {
    source = value.slice();
  } else {
    var single = String(value || "").trim();
    if (single) source = [single];
  }
  var normalized = sanitizeStringArray(source, false);
  var hadQuizPass = normalized.some(function hasQuizPass(entry) {
    return /quiz\s*pass/i.test(String(entry || ""));
  });
  var cleaned = normalized.filter(function filterQuizPass(entry) {
    var text = String(entry || "");
    if (/quiz\s*pass/i.test(text)) return false;
    if (hadQuizPass && /^\d{1,3}%$/.test(text)) return false;
    return true;
  });
  return cleaned;
}

function closeIdCard() {
  idCardOpen = false;
  setVisible(idCardOverlay, false);
}

function requestCloseIdCard() {
  postNui("cadBridgeIdCardClose", {}).catch(function ignoreIdCardCloseError() {});
  closeIdCard();
}

function openIdCard(payload) {
  if (!idCardTemplateReady || !idCardOverlay) {
    queuedIdCardPayload = payload || {};
    ensureIdCardTemplateLoaded();
    return;
  }
  var data = payload || {};
  var mugshot = String(safeGet(data, "mugshot_url", "") || "").trim();
  var displayName = extractDisplayNameForCard(data);
  var address = String(safeGet(data, "address", "") || "").trim();
  var conditions = sanitizeConditionsForCard(safeGet(data, "conditions", []));
  setIdCardImage("mugshot_url", mugshot, idCardPhoto);
  setIdCardField("viewer_note", safeGet(data, "viewer_note", ""), "", idCardViewerNote);
  setIdCardField("full_name", displayName, "Unknown", idCardFullName);
  setIdCardField("address", address, "Not recorded", idCardAddress);
  setIdCardField("date_of_birth", formatDateForCard(safeGet(data, "date_of_birth", "")), "Unknown", idCardDob);
  setIdCardField("license_number", safeGet(data, "license_number", ""), "Auto", idCardNumber);
  setIdCardField("license_classes", listToText(safeGet(data, "license_classes", []), "None"), "None", idCardClasses);
  setIdCardField("expiry_at", formatDateForCard(safeGet(data, "expiry_at", "")), "None", idCardExpiry);
  setIdCardField("conditions", listToText(conditions, "None"), "None", idCardConditions);

  idCardOpen = true;
  setVisible(idCardOverlay, true);
}

window.addEventListener("message", function onMessage(event) {
  var message = event.data || {};
  if (message.action === "cadBridge000:open") {
    openEmergencyForm(message.payload || {});
    postNui("cadBridge000Opened", {}).catch(function ignoreOpenedError() {});
    return;
  }
  if (message.action === "cadBridge000:close") {
    closeEmergencyForm();
    return;
  }
  if (message.action === "cadBridgeTrafficStop:open") {
    openTrafficStopForm(message.payload || {});
    postNui("cadBridgeTrafficStopOpened", {}).catch(function ignoreTrafficStopOpenedError() {});
    return;
  }
  if (message.action === "cadBridgeTrafficStop:close") {
    closeTrafficStopForm();
    return;
  }
  if (message.action === "cadBridgeJailRelease:open") {
    openJailReleaseForm(message.payload || {});
    postNui("cadBridgeJailReleaseOpened", {}).catch(function ignoreJailReleaseOpenedError() {});
    return;
  }
  if (message.action === "cadBridgeJailRelease:close") {
    closeJailReleaseForm();
    return;
  }
  if (message.action === "cadBridgePrintedDoc:open") {
    openPrintedDocForm(message.payload || {});
    return;
  }
  if (message.action === "cadBridgePrintedDoc:close") {
    closePrintedDocForm();
    return;
  }
  if (message.action === "cadBridgeLicense:open") {
    openLicenseForm(message.payload || {});
    return;
  }
  if (message.action === "cadBridgeLicense:close") {
    closeLicenseForm();
    return;
  }
  if (message.action === "cadBridgeRegistration:open") {
    openRegistrationForm(message.payload || {});
    return;
  }
  if (message.action === "cadBridgeRegistration:close") {
    closeRegistrationForm();
    return;
  }
  if (message.action === "cadBridgeRegistration:submitting") {
    registrationSubmitPending = true;
    if (registrationSubmitBtn) {
      registrationSubmitBtn.disabled = true;
      registrationSubmitBtn.textContent = "Saving...";
    }
    return;
  }
  if (message.action === "cadBridgeRegistration:submitResult") {
    var submitPayload = message.payload || {};
    var submitOk = submitPayload.ok === true || submitPayload.success === true;
    if (submitOk) {
      closeRegistrationForm();
      return;
    }
    registrationSubmitPending = false;
    if (registrationSubmitBtn) {
      registrationSubmitBtn.disabled = false;
      registrationSubmitBtn.textContent = "Save Registration";
    }
    var submitMessage = String(safeGet(submitPayload, "message", "") || "").trim();
    if (!submitMessage) {
      var submitErrorCode = String(safeGet(submitPayload, "error_code", "") || "").trim();
      if (submitErrorCode === "not_owner") {
        submitMessage = "You are not the owner of this vehicle, so it cannot be registered.";
      } else {
        submitMessage = "Unable to save registration.";
      }
    }
    showErrorNode(registrationFormError, submitMessage);
    return;
  }
  if (message.action === "cadBridgeIdCard:show") {
    openIdCard(message.payload || {});
    return;
  }
  if (message.action === "cadBridgeIdCard:hide") {
    closeIdCard();
    return;
  }
  if (message.action === "cadBridgeMiniCad:update") {
    updateMiniCad(message.payload || null);
    return;
  }
  if (message.action === "cadBridgeMiniCad:closestPrompt") {
    setMiniCadClosestPrompt(message.payload || {});
    return;
  }
  if (message.action === "cadBridgeMiniCad:closestPromptClear") {
    clearMiniCadClosestPrompt();
    return;
  }
  if (message.action === "cadBridgeMiniCad:show") {
    if ((miniCadData && miniCadData.call_id) || isMiniCadClosestPromptActive()) showMiniCad();
    return;
  }
  if (message.action === "cadBridgeMiniCad:hide") {
    hideMiniCadSilently();
    return;
  }
  if (message.action === "cadBridgeMugshot:showBackdrop") {
    var bd = document.getElementById("mugshotBackdrop");
    if (bd) bd.style.display = "none";
    return;
  }
  if (message.action === "cadBridgeMugshot:hideBackdrop") {
    var bd2 = document.getElementById("mugshotBackdrop");
    if (bd2) bd2.style.display = "none";
    return;
  }
  if (message.action === "cadBridgeHeadshot:capture") {
    var txdName = String(message.txdName || "").trim();
    if (!txdName) {
      postNui("cadBridgeHeadshotCapture", { data: "" }).catch(function ignoreCaptureError() {});
      return;
    }
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function onHeadshotLoad() {
      var canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 256;
      canvas.height = img.naturalHeight || 256;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      var dataUrl = canvas.toDataURL("image/webp", 0.92);
      postNui("cadBridgeHeadshotCapture", { data: dataUrl }).catch(function ignoreCaptureError() {});
    };
    img.onerror = function onHeadshotError() {
      postNui("cadBridgeHeadshotCapture", { data: "" }).catch(function ignoreCaptureError() {});
    };
    img.src = "https://nui-img/" + txdName + "/" + txdName;
    return;
  }
});

// Mini-CAD Popup
var miniCadPopup = document.getElementById("miniCadPopup");
var miniCadCallIndex = document.getElementById("miniCadCallIndex");
var miniCadCallView = document.getElementById("miniCadCallView");
var miniCadTitle = document.getElementById("miniCadTitle");
var miniCadCaller = document.getElementById("miniCadCaller");
var miniCadLocation = document.getElementById("miniCadLocation");
var miniCadPostal = document.getElementById("miniCadPostal");
var miniCadDescription = document.getElementById("miniCadDescription");
var miniCadDetachBtn = document.getElementById("miniCadDetach");
var miniCadHideBtn = document.getElementById("miniCadHideBtn");
var miniCadTab = document.getElementById("miniCadTab");
var miniCadTabLabel = document.getElementById("miniCadTabLabel");
var miniCadClosestPromptPanel = document.getElementById("miniCadClosestPrompt");
var miniCadClosestLabel = document.getElementById("miniCadClosestLabel");
var miniCadClosestTimer = document.getElementById("miniCadClosestTimer");
var miniCadClosestTitle = document.getElementById("miniCadClosestTitle");
var miniCadClosestMeta = document.getElementById("miniCadClosestMeta");
var miniCadClosestLocation = document.getElementById("miniCadClosestLocation");
var miniCadClosestAttachBtn = document.getElementById("miniCadClosestAttach");
var miniCadClosestDeclineBtn = document.getElementById("miniCadClosestDecline");
var miniCadOpen = false;
var miniCadData = null;
var miniCadClosestPromptData = null;
var miniCadClosestPromptDeadlineMs = 0;
var miniCadClosestPromptTimerHandle = null;

function isMiniCadClosestPromptActive() {
  return !!(miniCadClosestPromptData && miniCadClosestPromptData.id);
}

function hasMiniCadContent() {
  return isMiniCadClosestPromptActive() || !!(miniCadData && miniCadData.call_id);
}

function updateMiniCadTabVisibility() {
  if (!miniCadTab) return;
  if (miniCadOpen || !hasMiniCadContent()) {
    miniCadTab.classList.add("hidden");
    return;
  }
  miniCadTab.classList.remove("hidden");
  if (miniCadTabLabel) {
    miniCadTabLabel.textContent = isMiniCadClosestPromptActive() ? "Mini-CAD Offer (Insert)" : "Mini-CAD (Insert)";
  }
}

function showMiniCad() {
  if (!miniCadPopup) return;
  if (!hasMiniCadContent()) return;
  miniCadOpen = true;
  miniCadPopup.classList.remove("hidden");
  updateMiniCadTabVisibility();
}

function hideMiniCadSilently() {
  if (!miniCadPopup) return;
  miniCadOpen = false;
  miniCadPopup.classList.add("hidden");
  updateMiniCadTabVisibility();
}

function hideMiniCad() {
  if (!miniCadPopup) return;
  hideMiniCadSilently();
  postNui("cadBridgeMiniCadHidden", {}).catch(function ignore() {});
}

function clearMiniCadClosestPromptTimer() {
  if (miniCadClosestPromptTimerHandle) {
    window.clearInterval(miniCadClosestPromptTimerHandle);
    miniCadClosestPromptTimerHandle = null;
  }
}

function formatMiniCadClosestLocation(prompt) {
  var location = String(prompt.location || "").trim();
  var postal = String(prompt.postal || "").trim();
  if (location && postal) return location + " (Postal " + postal + ")";
  if (location) return location;
  if (postal) return "Postal " + postal;
  return "Location pending";
}

function formatMiniCadClosestDistance(distanceMeters) {
  var value = Number(distanceMeters);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1000) return Math.round(value) + "m";
  return (value / 1000).toFixed(2) + "km";
}

function updateMiniCadClosestTimerLabel() {
  if (!miniCadClosestTimer) return;
  if (!isMiniCadClosestPromptActive() || !miniCadClosestPromptDeadlineMs) {
    miniCadClosestTimer.textContent = "";
    return;
  }
  var remainingMs = Math.max(0, miniCadClosestPromptDeadlineMs - Date.now());
  var remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  miniCadClosestTimer.textContent = remainingSeconds > 0 ? String(remainingSeconds) + "s" : "0s";
}

function renderMiniCadClosestPrompt() {
  if (!miniCadClosestPromptPanel) return;
  if (!isMiniCadClosestPromptActive()) {
    miniCadClosestPromptPanel.classList.add("hidden");
    if (miniCadCallView) miniCadCallView.classList.remove("hidden");
    if (miniCadHideBtn) miniCadHideBtn.disabled = false;
    updateMiniCadClosestTimerLabel();
    return;
  }

  var prompt = miniCadClosestPromptData || {};
  if (miniCadCallView) miniCadCallView.classList.add("hidden");
  miniCadClosestPromptPanel.classList.remove("hidden");
  if (miniCadHideBtn) miniCadHideBtn.disabled = false;

  var deptShort = String(prompt.department_short_name || "").trim();
  var deptName = String(prompt.department_name || "").trim();
  var deptLabel = deptShort || deptName;
  if (miniCadClosestLabel) {
    miniCadClosestLabel.textContent = deptLabel ? "Closest Unit Offer - " + deptLabel : "Closest Unit Offer";
  }
  if (miniCadClosestTitle) {
    miniCadClosestTitle.textContent = String(prompt.title || "").trim() || "Incoming CAD Call";
  }
  if (miniCadClosestMeta) {
    var metaParts = [];
    var priority = String(prompt.priority || "").trim();
    if (priority) metaParts.push("Priority " + priority);
    var distanceLabel = formatMiniCadClosestDistance(prompt.distance_meters);
    if (distanceLabel) metaParts.push(distanceLabel + " away");
    miniCadClosestMeta.textContent = metaParts.join(" | ");
  }
  if (miniCadClosestLocation) {
    miniCadClosestLocation.textContent = formatMiniCadClosestLocation(prompt);
  }
  updateMiniCadClosestTimerLabel();
}

function setMiniCadClosestPrompt(payload) {
  var prompt = payload || {};
  var promptId = String(prompt.id || prompt.prompt_id || "").trim();
  var callId = Number(prompt.call_id || 0);
  if (!promptId || !Number.isFinite(callId) || callId <= 0) return;

  miniCadClosestPromptData = {
    id: promptId,
    call_id: callId,
    title: String(prompt.title || prompt.call_title || "").trim(),
    priority: String(prompt.priority || "").trim(),
    location: String(prompt.location || "").trim(),
    postal: String(prompt.postal || "").trim(),
    distance_meters: Number(prompt.distance_meters || 0) || 0,
    department_name: String(prompt.department_name || "").trim(),
    department_short_name: String(prompt.department_short_name || "").trim(),
  };

  var expiresInMs = Math.max(1000, Number(prompt.expires_in_ms || 15000) || 15000);
  miniCadClosestPromptDeadlineMs = Date.now() + expiresInMs;

  clearMiniCadClosestPromptTimer();
  miniCadClosestPromptTimerHandle = window.setInterval(updateMiniCadClosestTimerLabel, 500);
  renderMiniCadCall();
  showMiniCad();
}

function clearMiniCadClosestPrompt() {
  miniCadClosestPromptData = null;
  miniCadClosestPromptDeadlineMs = 0;
  clearMiniCadClosestPromptTimer();
  renderMiniCadCall();
  if ((!miniCadData || !miniCadData.call_id) && miniCadOpen) {
    hideMiniCadSilently();
  }
  updateMiniCadTabVisibility();
}

function miniCadClosestDecision(action) {
  if (!isMiniCadClosestPromptActive()) return;
  var normalizedAction = String(action || "").trim().toLowerCase();
  if (normalizedAction !== "accept" && normalizedAction !== "decline") {
    normalizedAction = "decline";
  }
  postNui("cadBridgeMiniCadClosestDecision", {
    id: String(miniCadClosestPromptData.id || ""),
    action: normalizedAction,
    reason: normalizedAction === "accept" ? "player_accept_ui" : "player_decline_ui",
  }).catch(function ignore() {});
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatMiniCadLocation(location, postal) {
  var locationText = String(location || "").trim();
  var postalText = String(postal || "").trim();
  if (!locationText) return "No location set";

  if (postalText) {
    var escapedPostal = escapeRegex(postalText);
    locationText = locationText
      .replace(new RegExp("\\s*\\(" + escapedPostal + "\\)\\s*$", "i"), "")
      .replace(new RegExp("\\s*-?\\s*postal\\s*" + escapedPostal + "\\s*$", "i"), "");
  }

  locationText = locationText.trim();
  return locationText || "No location set";
}

function updateMiniCad(payload) {
  miniCadData = payload || null;
  if (!miniCadData || !miniCadData.call_id) {
    renderMiniCadCall();
    if (miniCadOpen && !isMiniCadClosestPromptActive()) hideMiniCadSilently();
    updateMiniCadTabVisibility();
    return;
  }

  renderMiniCadCall();
  updateMiniCadTabVisibility();
}

function renderMiniCadCall() {
  renderMiniCadClosestPrompt();
  if (isMiniCadClosestPromptActive()) {
    if (miniCadCallIndex) miniCadCallIndex.textContent = "!";
    return;
  }
  if (!miniCadData || !miniCadData.call_id) return;

  var currentCall = miniCadData;
  if (miniCadCallIndex) miniCadCallIndex.textContent = "1/1";

  var title = String(currentCall.title || "").trim();
  if (miniCadTitle) {
    miniCadTitle.textContent = title.toUpperCase();
  }
  if (miniCadCaller) {
    var caller = String(currentCall.caller_name || miniCadData.caller_name || "").trim();
    miniCadCaller.textContent = caller;
    miniCadCaller.style.display = caller ? "" : "none";
  }

  if (miniCadLocation) {
    miniCadLocation.textContent = formatMiniCadLocation(currentCall.location, currentCall.postal);
  }

  if (miniCadPostal) {
    var postalVal = String(currentCall.postal || "").trim();
    miniCadPostal.textContent = postalVal;
  }

  // Description: for the current call being viewed use the main description if it's the primary call.
  if (miniCadDescription) {
    var desc = String(currentCall.reason_for_call || miniCadData.reason_for_call || "").trim();
    if (!desc) desc = String(currentCall.description || "").trim();
    miniCadDescription.textContent = desc;
  }
}

function miniCadDetach() {
  if (isMiniCadClosestPromptActive()) return;
  if (!miniCadData) return;
  var callId = Number(miniCadData.call_id || 0);
  if (callId > 0) {
    postNui("cadBridgeMiniCadDetach", { call_id: callId }).catch(function ignore() {});
  }
}

function revealMiniCadFromTab() {
  if (!hasMiniCadContent()) return;
  showMiniCad();
  postNui("cadBridgeMiniCadShown", {}).catch(function ignore() {});
}

window.force000Open = function force000Open(departmentsPayload) {
  openEmergencyForm({
    departments: departmentsPayload || [],
    max_title_length: 80,
    max_details_length: 600,
  });
};

function initialize() {
  bindIdCardNodes();
  ensureIdCardTemplateLoaded();

  setVisible(overlay, false);
  setVisible(trafficStopOverlay, false);
  setVisible(jailReleaseOverlay, false);
  setVisible(printedDocOverlay, false);
  resetPrintedDocPdfViewer();
  setVisible(licenseOverlay, false);
  setVisible(registrationOverlay, false);
  setVisible(idCardOverlay, false);

  if (form) {
    form.addEventListener("submit", function onEmergencySubmit(event) {
      event.preventDefault();
      submitEmergencyForm();
    });
  }
  if (closeBtn) closeBtn.addEventListener("click", cancelEmergencyForm);
  if (cancelBtn) cancelBtn.addEventListener("click", cancelEmergencyForm);
  if (titleInput) {
    titleInput.addEventListener("input", function onTitleInput() {
      if (String(titleInput.value || "").trim()) {
        showErrorNode(titleError, "");
      }
      updateCounters();
    });
  }
  if (detailsInput) {
    detailsInput.addEventListener("input", function onDetailsInput() {
      if (String(detailsInput.value || "").trim()) {
        showErrorNode(detailsError, "");
      }
      updateCounters();
    });
  }
  updateCounters();

  if (trafficStopForm) {
    trafficStopForm.addEventListener("submit", function onTrafficStopSubmit(event) {
      event.preventDefault();
      submitTrafficStopForm();
    });
  }
  if (trafficStopCloseBtn) trafficStopCloseBtn.addEventListener("click", cancelTrafficStopForm);
  if (trafficStopCancelBtn) trafficStopCancelBtn.addEventListener("click", cancelTrafficStopForm);
  if (trafficStopPlateInput) {
    trafficStopPlateInput.addEventListener("input", function onTrafficStopPlateInput() {
      updateTrafficStopCounters();
    });
  }
  if (trafficStopLocationInput) {
    trafficStopLocationInput.addEventListener("input", function onTrafficStopLocationInput() {
      updateTrafficStopCounters();
    });
  }
  if (trafficStopReasonInput) {
    trafficStopReasonInput.addEventListener("input", function onTrafficStopReasonInput() {
      if (String(trafficStopReasonInput.value || "").trim()) {
        showErrorNode(trafficStopReasonError, "");
      }
      updateTrafficStopCounters();
    });
  }
  if (trafficStopOutcomeInput) {
    trafficStopOutcomeInput.addEventListener("input", function onTrafficStopOutcomeInput() {
      updateTrafficStopCounters();
    });
  }
  if (trafficStopNotesInput) {
    trafficStopNotesInput.addEventListener("input", function onTrafficStopNotesInput() {
      updateTrafficStopCounters();
    });
  }
  updateTrafficStopCounters();

  if (jailReleaseForm) {
    jailReleaseForm.addEventListener("submit", function onJailReleaseSubmit(event) {
      event.preventDefault();
      submitJailReleaseForm();
    });
  }
  if (jailReleaseCloseBtn) jailReleaseCloseBtn.addEventListener("click", cancelJailReleaseForm);
  if (jailReleaseCancelBtn) jailReleaseCancelBtn.addEventListener("click", cancelJailReleaseForm);
  if (jailReleaseSelect) {
    jailReleaseSelect.addEventListener("change", function onJailReleaseSelectChange() {
      if (String(jailReleaseSelect.value || "").trim()) showErrorNode(jailReleaseSelectError, "");
    });
  }

  if (printedDocCloseBtn) printedDocCloseBtn.addEventListener("click", cancelPrintedDocForm);
  if (printedDocCancelBtn) printedDocCancelBtn.addEventListener("click", cancelPrintedDocForm);
  if (printedDocZoomOutBtn) printedDocZoomOutBtn.addEventListener("click", function onPrintedDocZoomOut() {
    changePrintedDocZoom(-0.1);
  });
  if (printedDocZoomResetBtn) printedDocZoomResetBtn.addEventListener("click", function onPrintedDocZoomReset() {
    fitPrintedDocPdfToWidth();
  });
  if (printedDocZoomInBtn) printedDocZoomInBtn.addEventListener("click", function onPrintedDocZoomIn() {
    changePrintedDocZoom(0.1);
  });
  if (printedDocCopyPdfBtn) printedDocCopyPdfBtn.addEventListener("click", function onPrintedDocCopyPdf() {
    copyPrintedDocPdf();
  });
  if (printedDocSavePdfBtn) printedDocSavePdfBtn.addEventListener("click", function onPrintedDocSavePdf() {
    savePrintedDocPdf();
  });
  if (printedDocCopyShareTextBtn) printedDocCopyShareTextBtn.addEventListener("click", function onPrintedDocCopyShareText() {
    copyPrintedDocShareText();
  });
  if (printedDocPdfViewport) {
    printedDocPdfViewport.addEventListener("mousedown", function onPrintedDocDragStart(event) {
      beginPrintedDocPdfDrag(event);
    });
    printedDocPdfViewport.addEventListener("wheel", function onPrintedDocWheel(event) {
      if (!printedDocPdfHasPdf || !printedDocPdfDoc) return;
      if (!event.ctrlKey) return;
      event.preventDefault();
      changePrintedDocZoom(event.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });
  }
  document.addEventListener("mousemove", function onPrintedDocDragMove(event) {
    movePrintedDocPdfDrag(event);
  });
  document.addEventListener("mouseup", function onPrintedDocDragEnd() {
    clearPrintedDocPdfDragState();
  });

  if (licenseForm) {
    licenseForm.addEventListener("submit", function onLicenseSubmit(event) {
      event.preventDefault();
      submitLicenseForm();
    });
  }
  if (licenseCloseBtn) licenseCloseBtn.addEventListener("click", cancelLicenseForm);
  if (licenseCancelBtn) licenseCancelBtn.addEventListener("click", cancelLicenseForm);
  if (licenseRetakePhotoBtn) {
    licenseRetakePhotoBtn.addEventListener("click", function onRetakePhotoClick() {
      requestLicensePhotoRetake();
    });
  }
  if (licenseContinuePhotoBtn) {
    licenseContinuePhotoBtn.addEventListener("click", function onContinuePhotoClick() {
      submitPendingLicenseAfterPass();
    });
  }

  if (registrationForm) {
    registrationForm.addEventListener("submit", function onRegistrationSubmit(event) {
      event.preventDefault();
      submitRegistrationForm();
    });
  }
  if (registrationCloseBtn) registrationCloseBtn.addEventListener("click", cancelRegistrationForm);
  if (registrationCancelBtn) registrationCancelBtn.addEventListener("click", cancelRegistrationForm);

  // Mini-CAD bindings.
  if (miniCadHideBtn) miniCadHideBtn.addEventListener("click", hideMiniCad);
  if (miniCadDetachBtn) miniCadDetachBtn.addEventListener("click", miniCadDetach);
  if (miniCadTab) {
    miniCadTab.addEventListener("click", revealMiniCadFromTab);
    miniCadTab.addEventListener("keydown", function onMiniCadTabKeyDown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      revealMiniCadFromTab();
    });
  }
  if (miniCadClosestAttachBtn) miniCadClosestAttachBtn.addEventListener("click", function onMiniCadClosestAttach() {
    miniCadClosestDecision("accept");
  });
  if (miniCadClosestDeclineBtn) miniCadClosestDeclineBtn.addEventListener("click", function onMiniCadClosestDecline() {
    miniCadClosestDecision("decline");
  });

  window.addEventListener("keydown", function onKeyDown(event) {
    if (!anyModalOpen()) return;
    if (event.key === "PageDown") {
      event.preventDefault();
      if (idCardOpen) requestCloseIdCard();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeAll();
    }
  });

  postNui("cadBridge000Ready", {})
    .then(function noop() {})
    .catch(function onReadyError(err) {
      console.error("[CAD UI] Ready signal failed:", err);
    });
  postNui("cadBridgeTrafficStopReady", {})
    .then(function noopTrafficStopReady() {})
    .catch(function onTrafficStopReadyError(err2) {
      console.error("[CAD UI] Traffic stop ready signal failed:", err2);
    });
  postNui("cadBridgeJailReleaseReady", {})
    .then(function noopJailReleaseReady() {})
    .catch(function onJailReleaseReadyError(err3) {
      console.error("[CAD UI] Jail release ready signal failed:", err3);
    });

  updateMiniCadTabVisibility();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

