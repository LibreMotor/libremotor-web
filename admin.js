const API_BASE_URL = "https://api.libremotor.com";
const TOKEN_STORAGE_KEY = "libremotor.adminToken";
const PAGE_LIMIT = 50;

const state = {
  signups: [],
  signupStats: null,
  signupPage: { limit: PAGE_LIMIT, offset: 0, total: 0, filteredTotal: 0, nextOffset: null, query: "" },
  vehicles: [],
  vehicleStats: null,
  vehiclePage: { limit: PAGE_LIMIT, offset: 0, total: 0, filteredTotal: 0, nextOffset: null, query: "" },
  activeTab: "overview",
  lastInvite: null,
};

const loginPanel = document.querySelector("[data-login-panel]");
const adminShell = document.querySelector("[data-admin-shell]");
const loginForm = document.querySelector("[data-admin-login]");
const tokenInput = loginForm?.elements.token;
const loginStatusEl = document.querySelector("[data-login-status]");
const adminStatusEl = document.querySelector("[data-admin-status]");
const metricsEl = document.querySelector("[data-metrics]");
const countryStatsEl = document.querySelector("[data-country-stats]");
const dayStatsEl = document.querySelector("[data-day-stats]");
const signupRowsEl = document.querySelector("[data-signup-rows]");
const vehicleRowsEl = document.querySelector("[data-vehicle-rows]");
const signupFilterInput = document.querySelector("[data-signup-filter]");
const vehicleFilterInput = document.querySelector("[data-vehicle-filter]");
const signupPageLabel = document.querySelector("[data-signup-page-label]");
const signupPrevButton = document.querySelector("[data-signup-prev]");
const signupNextButton = document.querySelector("[data-signup-next]");
const vehiclePageLabel = document.querySelector("[data-vehicle-page-label]");
const vehiclePrevButton = document.querySelector("[data-vehicle-prev]");
const vehicleNextButton = document.querySelector("[data-vehicle-next]");
const accessForm = document.querySelector("[data-access-form]");
const inviteForm = document.querySelector("[data-invite-form]");
const inviteOutput = document.querySelector("[data-invite-output]");
const inviteCodeEl = document.querySelector("[data-invite-code]");
const inviteSubjectInput = document.querySelector("[data-invite-subject]");
const inviteMessageInput = document.querySelector("[data-invite-message]");
const inviteMailtoLink = document.querySelector("[data-mailto-invite]");

function storedToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function activeToken() {
  return tokenInput?.value.trim() || storedToken();
}

function setLoginStatus(message, stateName = "") {
  setStatus(loginStatusEl, message, stateName);
}

function setAdminStatus(message, stateName = "") {
  setStatus(adminStatusEl, message, stateName);
}

function setStatus(element, message, stateName = "") {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = stateName;
}

async function api(path, options = {}) {
  const token = activeToken();
  if (!token) {
    throw new Error("Admin token is required.");
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

async function login() {
  const token = activeToken();
  if (!token) {
    setLoginStatus("Admin token is required.", "error");
    return;
  }
  setLoginStatus("Checking token...");
  await api("/v1/admin/session");
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  showShell();
  await refreshAll();
}

function showShell() {
  if (loginPanel) loginPanel.hidden = true;
  if (adminShell) adminShell.hidden = false;
  setLoginStatus("");
}

function showLogin() {
  if (loginPanel) loginPanel.hidden = false;
  if (adminShell) adminShell.hidden = true;
}

async function refreshAll() {
  setAdminStatus("Loading admin data...");
  const [signups, vehicles] = await Promise.all([
    fetchSignupPage(0),
    fetchVehiclePage(0),
  ]);
  applySignupPage(signups);
  applyVehiclePage(vehicles);
  renderDashboard();
  setAdminStatus(
    `Loaded ${pageSummary(state.signupPage, state.signups.length)} signups and ${pageSummary(state.vehiclePage, state.vehicles.length)} vehicles.`,
    "success",
  );
}

async function loadSignupPage(offset = 0) {
  setAdminStatus("Loading signups...");
  applySignupPage(await fetchSignupPage(offset));
  renderSignupMetrics();
  renderStatList(countryStatsEl, state.signupStats?.by_country || []);
  renderStatList(dayStatsEl, state.signupStats?.by_day || [], "day");
  renderSignupRows();
  setAdminStatus(`Loaded ${pageSummary(state.signupPage, state.signups.length)} signups.`, "success");
}

async function loadVehiclePage(offset = 0) {
  setAdminStatus("Loading vehicles...");
  applyVehiclePage(await fetchVehiclePage(offset));
  renderSignupMetrics();
  renderVehicleRows();
  setAdminStatus(`Loaded ${pageSummary(state.vehiclePage, state.vehicles.length)} vehicles.`, "success");
}

async function fetchSignupPage(offset = 0) {
  return await api(buildListPath("/v1/admin/beta-interest", {
    limit: PAGE_LIMIT,
    offset,
    query: signupFilterInput?.value || "",
  }));
}

async function fetchVehiclePage(offset = 0) {
  return await api(buildListPath("/v1/admin/vehicles", {
    limit: PAGE_LIMIT,
    offset,
    query: vehicleFilterInput?.value || "",
  }));
}

function buildListPath(path, { limit, offset, query }) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(Math.max(0, Number(offset) || 0)),
  });
  const cleanQuery = String(query || "").trim();
  if (cleanQuery) params.set("q", cleanQuery);
  return `${path}?${params.toString()}`;
}

function applySignupPage(response) {
  state.signups = Array.isArray(response.items) ? response.items : [];
  state.signupStats = response.stats || buildFallbackSignupStats(state.signups);
  state.signupPage = normalizePage(response, signupFilterInput?.value || "");
}

function applyVehiclePage(response) {
  state.vehicles = Array.isArray(response.items) ? response.items : [];
  state.vehicleStats = response.stats || null;
  state.vehiclePage = normalizePage(response, vehicleFilterInput?.value || "");
}

function normalizePage(response, query) {
  return {
    limit: Number(response.limit || PAGE_LIMIT),
    offset: Number(response.offset || 0),
    total: Number(response.total || 0),
    filteredTotal: Number(response.filtered_total ?? response.total ?? 0),
    nextOffset: response.next_offset === null || response.next_offset === undefined ? null : Number(response.next_offset),
    query: String(response.query || query || "").trim(),
  };
}

function pageSummary(page, count) {
  const total = page.filteredTotal;
  if (!total) return `0/${page.total || 0}`;
  const start = page.offset + 1;
  const end = page.offset + count;
  return `${start}-${end}/${total}`;
}

function renderDashboard() {
  renderSignupMetrics();
  renderStatList(countryStatsEl, state.signupStats?.by_country || []);
  renderStatList(dayStatsEl, state.signupStats?.by_day || [], "day");
  renderSignupRows();
  renderVehicleRows();
}

function buildFallbackSignupStats(items) {
  return {
    total: items.length,
    updated_last_24h: items.filter((item) => Number(item.updated_at || 0) >= Date.now() / 1000 - 86400).length,
    by_vehicle_type: groupItems(items, "vehicle_type"),
    by_country: groupItems(items, "country"),
    by_day: groupItems(items.map((item) => ({ day: formatDay(item.updated_at) })), "day"),
  };
}

function groupItems(items, field) {
  const counts = new Map();
  for (const item of items) {
    const value = item[field] || "Unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftValue, leftCount], [rightValue, rightCount]) => rightCount - leftCount || leftValue.localeCompare(rightValue))
    .map(([value, count]) => ({ value, count }));
}

function renderSignupMetrics() {
  if (!metricsEl) return;
  const stats = state.signupStats || buildFallbackSignupStats(state.signups);
  const vehicleStats = new Map((stats.by_vehicle_type || []).map((entry) => [entry.value, entry.count]));
  const accessStats = state.vehicleStats || Object.fromEntries(groupItems(state.vehicles, "access").map((entry) => [entry.value, entry.count]));
  renderMetrics([
    ["Signups", stats.total ?? state.signups.length],
    ["Vehicles", state.vehicleStats?.total ?? state.vehiclePage.total ?? state.vehicles.length],
    ["Trials", Number(accessStats.trial || 0)],
    ["Lifetime", Number(accessStats.lifetime || 0)],
    ["C10 BEV", vehicleStats.get("c10_bev") || 0],
    ["C10 REEV", vehicleStats.get("c10_reev") || 0],
    ["Expired", Number(accessStats.expired || 0)],
    ["Disabled", Number(accessStats.disabled || 0)],
  ]);
}

function renderMetrics(metrics) {
  metricsEl.innerHTML = metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${Number(value || 0).toLocaleString()}</strong>
        </article>
      `,
    )
    .join("");
}

function renderStatList(container, entries, type = "value") {
  if (!container) return;
  if (!entries.length) {
    container.innerHTML = "<p>No data yet.</p>";
    return;
  }
  const max = Math.max(...entries.map((entry) => Number(entry.count || 0)), 1);
  container.innerHTML = entries
    .slice(0, 12)
    .map((entry) => {
      const label = type === "day" ? entry.day : entry.value || "Unknown";
      const count = Number(entry.count || 0);
      const width = Math.max(4, Math.round((count / max) * 100));
      return `
        <div class="stat-row">
          <div>
            <strong>${escapeHtml(label)}</strong>
            <span>${count.toLocaleString()}</span>
          </div>
          <i style="width: ${width}%"></i>
        </div>
      `;
    })
    .join("");
}

function renderSignupRows() {
  if (!signupRowsEl) return;
  const items = state.signups;

  if (!items.length) {
    signupRowsEl.innerHTML = `<tr><td colspan="6">${state.signupPage.query ? "No signups match this filter." : "No signups yet."}</td></tr>`;
    renderPagination("signup");
    return;
  }

  signupRowsEl.innerHTML = items
    .map(
      (item, index) => `
        <tr class="clickable-row" tabindex="0" data-signup-index="${index}" title="Use this signup for an invite">
          <td>${escapeHtml(item.email)}</td>
          <td>${escapeHtml(formatVehicle(item.vehicle_type))}</td>
          <td>${escapeHtml(item.country)}</td>
          <td>${escapeHtml(item.locale || "-")}</td>
          <td>${escapeHtml(item.source || "-")}</td>
          <td>${escapeHtml(formatDateTime(item.updated_at))}</td>
        </tr>
      `,
    )
    .join("");
  renderPagination("signup");
}

function renderVehicleRows() {
  if (!vehicleRowsEl) return;
  const vehicles = state.vehicles;

  if (!vehicles.length) {
    vehicleRowsEl.innerHTML = `<tr><td colspan="7">${state.vehiclePage.query ? "No vehicles match this filter." : "No vehicles yet."}</td></tr>`;
    renderPagination("vehicle");
    return;
  }

  vehicleRowsEl.innerHTML = vehicles
    .map(
      (vehicle) => `
        <tr>
          <td>${escapeHtml(vehicle.email || "-")}</td>
          <td>${escapeHtml(vehicle.vin_suffix ? `...${vehicle.vin_suffix}` : "-")}</td>
          <td><span class="status-pill ${escapeHtml(vehicle.access)}">${escapeHtml(formatAccess(vehicle.access))}</span></td>
          <td>${escapeHtml(formatDateTime(vehicle.trial_expires_at))}</td>
          <td>${Number(vehicle.activations_count || 0).toLocaleString()}</td>
          <td>${escapeHtml(vehicle.label || "-")}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-vehicle-action="extend" data-vin-hash="${escapeHtml(vehicle.vin_hash)}">+7d</button>
              <button type="button" data-vehicle-action="lifetime" data-vin-hash="${escapeHtml(vehicle.vin_hash)}">Lifetime</button>
              <button type="button" data-vehicle-action="disable" data-vin-hash="${escapeHtml(vehicle.vin_hash)}">Disable</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
  renderPagination("vehicle");
}

function renderPagination(kind) {
  const isSignup = kind === "signup";
  const page = isSignup ? state.signupPage : state.vehiclePage;
  const count = isSignup ? state.signups.length : state.vehicles.length;
  const label = isSignup ? signupPageLabel : vehiclePageLabel;
  const prevButton = isSignup ? signupPrevButton : vehiclePrevButton;
  const nextButton = isSignup ? signupNextButton : vehicleNextButton;
  if (label) label.textContent = pageSummary(page, count);
  if (prevButton) prevButton.disabled = page.offset <= 0;
  if (nextButton) nextButton.disabled = page.nextOffset === null;
}

async function saveAccess(form) {
  const data = new FormData(form);
  const payload = {
    email: String(data.get("email") || "").trim(),
    vin: normalizeVinInput(data.get("vin")),
    label: String(data.get("label") || "").trim(),
    access: String(data.get("access") || "trial"),
    days: Number(data.get("days") || 7),
  };
  setAdminStatus("Saving vehicle access...");
  const result = await postJson("/v1/admin/vehicles/set-access", payload);
  setAdminStatus(`Saved ${formatAccess(result.access)} access for VIN ending ${result.vin_suffix || "registered"}.`, "success");
  form.reset();
  form.elements.days.value = "7";
  await refreshAll();
}

async function createInvite(form) {
  const data = new FormData(form);
  const payload = {
    email: String(data.get("email") || "").trim(),
    vin: normalizeVinInput(data.get("vin")),
    vehicle_type: String(data.get("vehicle_type") || "c10_bev"),
    country: String(data.get("country") || "").trim(),
    access: String(data.get("access") || "trial"),
    trial_days: Number(data.get("trial_days") || 7),
    code_days: Number(data.get("code_days") || 14),
    download_url: String(data.get("download_url") || "").trim(),
    locale: String(data.get("locale") || "pt-BR"),
    send_email: Boolean(data.get("send_email")),
  };
  setAdminStatus("Creating invite...");
  const result = await postJson("/v1/admin/invitations/create", payload);
  state.lastInvite = result;
  renderInvite(result);
  const delivery = result.email_delivery?.sent ? "Email sent." : "Email draft ready.";
  setAdminStatus(`${delivery} Code ${result.activation_code} created.`, "success");
  await refreshAll();
}

async function postJson(path, payload) {
  return await api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function renderInvite(result) {
  if (!inviteOutput || !result?.email_template) return;
  inviteOutput.hidden = false;
  if (inviteCodeEl) {
    inviteCodeEl.textContent = `Code: ${result.activation_code} · VIN ...${result.vehicle?.vin_suffix || ""}`;
  }
  if (inviteSubjectInput) inviteSubjectInput.value = result.email_template.subject || "";
  if (inviteMessageInput) inviteMessageInput.value = result.email_template.text || "";
  if (inviteMailtoLink) inviteMailtoLink.href = result.email_template.mailto || "#";
}

function prefillInviteFromSignup(signup) {
  if (!inviteForm || !signup) return;
  switchTab("invite");
  inviteForm.elements.email.value = signup.email || "";
  inviteForm.elements.vehicle_type.value = signup.vehicle_type || "c10_bev";
  inviteForm.elements.country.value = signup.country || "BR";
  inviteForm.elements.locale.value = String(signup.locale || "").toLowerCase().startsWith("pt") ? "pt-BR" : "en";
  inviteForm.elements.access.value = "trial";
  inviteForm.elements.trial_days.value = "7";
  inviteForm.elements.code_days.value = "14";
  inviteForm.elements.vin.value = "";
  inviteForm.elements.vin.focus();
  if (accessForm) {
    accessForm.elements.email.value = signup.email || "";
  }
  setAdminStatus("Invite filled from signup. Enter the VIN to create the vehicle-bound invite.", "success");
}

async function runVehicleAction(action, vinHash) {
  const payload = { vin_hash: vinHash };
  if (action === "extend") {
    payload.access = "trial";
    payload.days = 7;
  } else if (action === "lifetime") {
    payload.access = "lifetime";
  } else if (action === "disable") {
    payload.access = "disabled";
  } else {
    return;
  }
  setAdminStatus("Updating vehicle...");
  const result = await postJson("/v1/admin/vehicles/set-access", payload);
  setAdminStatus(`Vehicle is now ${formatAccess(result.access)}.`, "success");
  await refreshAll();
}

function exportCsv() {
  if (!state.signups.length) {
    setAdminStatus("No signup data to export.", "error");
    return;
  }
  const header = ["email", "vehicle_type", "country", "locale", "source", "created_at", "updated_at"];
  const csv = [
    header.join(","),
    ...state.signups.map((item) =>
      header
        .map((field) => {
          const value = field.endsWith("_at") ? formatDateTime(item[field]) : item[field] || "";
          return `"${String(value).replaceAll('"', '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `libremotor-beta-interest-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll("[data-tab-button]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabButton === tab);
  });
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tab;
  });
}

function logout() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  if (tokenInput) tokenInput.value = "";
  state.signups = [];
  state.vehicles = [];
  state.signupStats = null;
  state.vehicleStats = null;
  showLogin();
  setLoginStatus("Logged out.", "success");
}

function normalizeVinInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
}

function formatVehicle(value) {
  if (value === "c10_bev") return "C10 BEV";
  if (value === "c10_reev") return "C10 REEV";
  return value || "-";
}

function formatAccess(value) {
  if (value === "lifetime") return "Lifetime";
  if (value === "trial") return "Trial";
  if (value === "expired") return "Expired";
  if (value === "disabled") return "Disabled";
  return value || "-";
}

function formatDateTime(value) {
  const seconds = Number(value || 0);
  if (!seconds) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(seconds * 1000));
}

function formatDay(value) {
  const seconds = Number(value || 0);
  if (!seconds) return "Unknown";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await login();
  } catch (error) {
    setLoginStatus(error.message || "Login failed.", "error");
  }
});

document.querySelector("[data-refresh]")?.addEventListener("click", async () => {
  try {
    await refreshAll();
  } catch (error) {
    setAdminStatus(error.message || "Could not refresh dashboard.", "error");
  }
});

document.querySelector("[data-logout]")?.addEventListener("click", logout);
document.querySelector("[data-forget-token]")?.addEventListener("click", logout);
document.querySelector("[data-export-csv]")?.addEventListener("click", exportCsv);
signupFilterInput?.addEventListener("input", debounce(() => loadSignupPage(0).catch((error) => {
  setAdminStatus(error.message || "Could not load signups.", "error");
}), 250));
vehicleFilterInput?.addEventListener("input", debounce(() => loadVehiclePage(0).catch((error) => {
  setAdminStatus(error.message || "Could not load vehicles.", "error");
}), 250));
signupPrevButton?.addEventListener("click", () => {
  loadSignupPage(Math.max(0, state.signupPage.offset - state.signupPage.limit)).catch((error) => {
    setAdminStatus(error.message || "Could not load previous signups.", "error");
  });
});
signupNextButton?.addEventListener("click", () => {
  if (state.signupPage.nextOffset === null) return;
  loadSignupPage(state.signupPage.nextOffset).catch((error) => {
    setAdminStatus(error.message || "Could not load next signups.", "error");
  });
});
vehiclePrevButton?.addEventListener("click", () => {
  loadVehiclePage(Math.max(0, state.vehiclePage.offset - state.vehiclePage.limit)).catch((error) => {
    setAdminStatus(error.message || "Could not load previous vehicles.", "error");
  });
});
vehicleNextButton?.addEventListener("click", () => {
  if (state.vehiclePage.nextOffset === null) return;
  loadVehiclePage(state.vehiclePage.nextOffset).catch((error) => {
    setAdminStatus(error.message || "Could not load next vehicles.", "error");
  });
});

document.querySelectorAll("[data-tab-button]").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tabButton));
});

accessForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveAccess(accessForm);
  } catch (error) {
    setAdminStatus(error.message || "Could not save access.", "error");
  }
});

inviteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createInvite(inviteForm);
  } catch (error) {
    setAdminStatus(error.message || "Could not create invite.", "error");
  }
});

vehicleRowsEl?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-vehicle-action]");
  if (!button) return;
  try {
    await runVehicleAction(button.dataset.vehicleAction, button.dataset.vinHash);
  } catch (error) {
    setAdminStatus(error.message || "Could not update vehicle.", "error");
  }
});

signupRowsEl?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-signup-index]");
  if (!row) return;
  prefillInviteFromSignup(state.signups[Number(row.dataset.signupIndex)]);
});

signupRowsEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-signup-index]");
  if (!row) return;
  event.preventDefault();
  prefillInviteFromSignup(state.signups[Number(row.dataset.signupIndex)]);
});

document.querySelector("[data-copy-invite]")?.addEventListener("click", async () => {
  const message = inviteMessageInput?.value || "";
  if (!message) return;
  await navigator.clipboard.writeText(message);
  setAdminStatus("Invite message copied.", "success");
});

if (tokenInput && storedToken()) {
  tokenInput.value = storedToken();
  login().catch(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    showLogin();
    setLoginStatus("Saved token was rejected. Login again.", "error");
  });
} else {
  showLogin();
}

function debounce(callback, delay) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}
