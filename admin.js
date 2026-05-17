const API_BASE_URL = "https://api.libremotor.com";
const TOKEN_STORAGE_KEY = "libremotor.adminToken";

const state = {
  signups: [],
  signupStats: null,
  vehicles: [],
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
    api("/v1/admin/beta-interest?limit=500"),
    api("/v1/admin/vehicles?limit=1000"),
  ]);
  state.signups = Array.isArray(signups.items) ? signups.items : [];
  state.signupStats = signups.stats || buildFallbackSignupStats(state.signups);
  state.vehicles = Array.isArray(vehicles.items) ? vehicles.items : [];
  renderDashboard();
  setAdminStatus(`Loaded ${state.signups.length} signups and ${state.vehicles.length} vehicles.`, "success");
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
  const vehicleAccess = groupItems(state.vehicles, "access");
  const accessStats = new Map(vehicleAccess.map((entry) => [entry.value, entry.count]));
  renderMetrics([
    ["Signups", stats.total ?? state.signups.length],
    ["Vehicles", state.vehicles.length],
    ["Trials", accessStats.get("trial") || 0],
    ["Lifetime", accessStats.get("lifetime") || 0],
    ["C10 BEV", vehicleStats.get("c10_bev") || 0],
    ["C10 REEV", vehicleStats.get("c10_reev") || 0],
    ["Expired", accessStats.get("expired") || 0],
    ["Disabled", accessStats.get("disabled") || 0],
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
  const query = (signupFilterInput?.value || "").trim().toLowerCase();
  const items = query
    ? state.signups.filter((item) =>
        [item.email, item.vehicle_type, item.country, item.locale, item.source].join(" ").toLowerCase().includes(query),
      )
    : state.signups;

  if (!items.length) {
    signupRowsEl.innerHTML = `<tr><td colspan="6">${state.signups.length ? "No signups match this filter." : "No signups yet."}</td></tr>`;
    return;
  }

  signupRowsEl.innerHTML = items
    .map(
      (item) => `
        <tr>
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
}

function renderVehicleRows() {
  if (!vehicleRowsEl) return;
  const query = (vehicleFilterInput?.value || "").trim().toLowerCase();
  const vehicles = query
    ? state.vehicles.filter((item) =>
        [item.email, item.vin_suffix, item.label, item.access, item.status].join(" ").toLowerCase().includes(query),
      )
    : state.vehicles;

  if (!vehicles.length) {
    vehicleRowsEl.innerHTML = `<tr><td colspan="7">${state.vehicles.length ? "No vehicles match this filter." : "No vehicles yet."}</td></tr>`;
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
signupFilterInput?.addEventListener("input", renderSignupRows);
vehicleFilterInput?.addEventListener("input", renderVehicleRows);

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
