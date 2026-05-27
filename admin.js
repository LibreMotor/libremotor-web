const API_BASE_URL = "https://api.libremotor.com";
const TOKEN_STORAGE_KEY = "libremotor.adminToken";
const USER_PAGE_LIMIT = 10;
const VEHICLE_PAGE_LIMIT = 50;

const state = {
  users: [],
  userStats: null,
  selectedUserId: null,
  userSort: { field: "updated_at", direction: "desc" },
  userPage: { limit: USER_PAGE_LIMIT, offset: 0, total: 0, filteredTotal: 0, nextOffset: null, query: "", status: "" },
  vehicles: [],
  vehicleStats: null,
  vehiclePage: { limit: VEHICLE_PAGE_LIMIT, offset: 0, total: 0, filteredTotal: 0, nextOffset: null, query: "" },
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
const appStatsEl = document.querySelector("[data-app-stats]");
const dayStatsEl = document.querySelector("[data-day-stats]");
const userRowsEl = document.querySelector("[data-user-rows]");
const userDetailsEl = document.querySelector("[data-user-details]");
const vehicleRowsEl = document.querySelector("[data-vehicle-rows]");
const userFilterInput = document.querySelector("[data-user-filter]");
const userStatusFilter = document.querySelector("[data-user-status-filter]");
const userSortSelect = document.querySelector("[data-user-sort-select]");
const userSortDirectionButton = document.querySelector("[data-user-sort-direction]");
const vehicleFilterInput = document.querySelector("[data-vehicle-filter]");
const userPageLabel = document.querySelector("[data-user-page-label]");
const userPrevButton = document.querySelector("[data-user-prev]");
const userNextButton = document.querySelector("[data-user-next]");
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
  const [users, vehicles] = await Promise.all([
    fetchUserPage(0),
    fetchVehiclePage(0),
  ]);
  applyUserPage(users);
  applyVehiclePage(vehicles);
  renderDashboard();
  setAdminStatus(
    `Loaded ${pageSummary(state.userPage, state.users.length)} users and ${pageSummary(state.vehiclePage, state.vehicles.length)} vehicles.`,
    "success",
  );
}

async function loadUserPage(offset = 0) {
  setAdminStatus("Loading users...");
  applyUserPage(await fetchUserPage(offset));
  renderUserMetrics();
  renderStatList(countryStatsEl, state.userStats?.by_country || []);
  renderStatList(appStatsEl, state.userStats?.by_app_interest || [], "app");
  renderStatList(dayStatsEl, state.userStats?.by_day || [], "day");
  renderUserRows();
  setAdminStatus(`Loaded ${pageSummary(state.userPage, state.users.length)} users.`, "success");
}

async function loadVehiclePage(offset = 0) {
  setAdminStatus("Loading vehicles...");
  applyVehiclePage(await fetchVehiclePage(offset));
  renderUserMetrics();
  renderVehicleRows();
  setAdminStatus(`Loaded ${pageSummary(state.vehiclePage, state.vehicles.length)} vehicles.`, "success");
}

async function fetchUserPage(offset = 0) {
  return await api(buildListPath("/v1/admin/users", {
    limit: USER_PAGE_LIMIT,
    offset,
    query: userFilterInput?.value || "",
    status: userStatusFilter?.value || "",
    sort: state.userSort.field,
    direction: state.userSort.direction,
  }));
}

async function fetchVehiclePage(offset = 0) {
  return await api(buildListPath("/v1/admin/vehicles", {
    limit: VEHICLE_PAGE_LIMIT,
    offset,
    query: vehicleFilterInput?.value || "",
  }));
}

function buildListPath(path, { limit, offset, query, status = "", sort = "", direction = "" }) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(Math.max(0, Number(offset) || 0)),
  });
  const cleanQuery = String(query || "").trim();
  if (cleanQuery) params.set("q", cleanQuery);
  const cleanStatus = String(status || "").trim();
  if (cleanStatus) params.set("status", cleanStatus);
  const cleanSort = String(sort || "").trim();
  if (cleanSort) params.set("sort", cleanSort);
  const cleanDirection = String(direction || "").trim();
  if (cleanDirection) params.set("direction", cleanDirection);
  return `${path}?${params.toString()}`;
}

function applyUserPage(response) {
  state.users = Array.isArray(response.items) ? response.items : [];
  state.userStats = response.stats || buildFallbackUserStats(state.users);
  state.userPage = normalizePage(response, userFilterInput?.value || "");
  state.userPage.status = String(response.status || userStatusFilter?.value || "").trim();
  state.userSort = {
    field: String(response.sort || state.userSort.field || "updated_at"),
    direction: String(response.direction || state.userSort.direction || "desc"),
  };
  if (!state.selectedUserId || !state.users.some((item) => item.id === state.selectedUserId)) {
    state.selectedUserId = state.users[0]?.id || null;
  }
}

function applyVehiclePage(response) {
  state.vehicles = Array.isArray(response.items) ? response.items : [];
  state.vehicleStats = response.stats || null;
  state.vehiclePage = normalizePage(response, vehicleFilterInput?.value || "");
}

function normalizePage(response, query) {
  return {
    limit: Number(response.limit || USER_PAGE_LIMIT),
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
  renderUserMetrics();
  renderStatList(countryStatsEl, state.userStats?.by_country || []);
  renderStatList(appStatsEl, state.userStats?.by_app_interest || [], "app");
  renderStatList(dayStatsEl, state.userStats?.by_day || [], "day");
  renderUserRows();
  renderUserDetails();
  renderVehicleRows();
}

function buildFallbackUserStats(items) {
  return {
    total: items.length,
    updated_last_24h: items.filter((item) => Number(item.updated_at || 0) >= Date.now() / 1000 - 86400).length,
    by_status: groupItems(items, "status"),
    by_vehicle_type: groupItems(items, "vehicle_type"),
    by_country: groupItems(items, "country"),
    by_app_interest: groupAppInterests(items),
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

function groupAppInterests(items) {
  const expanded = [];
  for (const item of items) {
    for (const appInterest of item.app_interests || []) {
      expanded.push({ appInterest });
    }
  }
  return groupItems(expanded, "appInterest");
}

function renderUserMetrics() {
  if (!metricsEl) return;
  const stats = state.userStats || buildFallbackUserStats(state.users);
  const vehicleStats = new Map((stats.by_vehicle_type || []).map((entry) => [entry.value, entry.count]));
  const appStats = new Map((stats.by_app_interest || []).map((entry) => [entry.value, entry.count]));
  const statusStats = new Map((stats.by_status || []).map((entry) => [entry.value, entry.count]));
  const accessStats = state.vehicleStats || Object.fromEntries(groupItems(state.vehicles, "access").map((entry) => [entry.value, entry.count]));
  renderMetrics([
    ["Users", stats.total ?? state.users.length],
    ["Waitlist", statusStats.get("waitlist") || 0],
    ["Invited", statusStats.get("invited") || 0],
    ["Testers", statusStats.get("tester") || 0],
    ["Vehicles", state.vehicleStats?.total ?? state.vehiclePage.total ?? state.vehicles.length],
    ["Waze", appStats.get("waze") || 0],
    ["Android Auto", appStats.get("android_auto_no_carlinkit") || 0],
    ["Trials", Number(accessStats.trial || 0)],
    ["Lifetime", Number(accessStats.lifetime || 0)],
    ["B10", vehicleStats.get("b10") || 0],
    ["C10 BEV", vehicleStats.get("c10_bev") || 0],
    ["C10 REEV", vehicleStats.get("c10_reev") || 0],
    ["Expired", Number(accessStats.expired || 0)],
    ["Disabled", Number(accessStats.disabled || 0)],
    ["Users Disabled", statusStats.get("disabled") || 0],
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
      const label = type === "day" ? entry.day : type === "app" ? formatAppInterest(entry.value) : entry.value || "Unknown";
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

function renderUserRows() {
  if (!userRowsEl) return;
  const items = state.users;

  if (!items.length) {
    userRowsEl.innerHTML = `<tr><td colspan="6">${state.userPage.query || state.userPage.status ? "No users match this filter." : "No users yet."}</td></tr>`;
    renderUserDetails();
    renderPagination("user");
    renderUserSortState();
    return;
  }

  userRowsEl.innerHTML = items
    .map(
      (item, index) => `
        <tr class="clickable-row ${item.id === state.selectedUserId ? "is-selected" : ""}" tabindex="0" data-user-index="${index}">
          <td class="email-cell">${escapeHtml(item.email)}</td>
          <td><span class="status-pill ${escapeHtml(item.status)}">${escapeHtml(formatUserStatus(item.status))}</span></td>
          <td>${escapeHtml(formatVehicle(item.vehicle_type))}</td>
          <td>${escapeHtml(item.country)}</td>
          <td>${escapeHtml(formatDateTime(item.updated_at))}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-user-action="invite" data-user-index="${index}">Invite</button>
              <button type="button" data-user-action="tester" data-user-index="${index}">Tester</button>
              <button type="button" data-user-action="disable" data-user-index="${index}">Disable</button>
            </div>
          </td>
        </tr>
      `,
    )
	    .join("");
  renderUserSortState();
  renderPagination("user");
  renderUserDetails();
}

function renderUserDetails() {
  if (!userDetailsEl) return;
  const user = state.users.find((item) => item.id === state.selectedUserId);
  if (!user) {
    userDetailsEl.innerHTML = `<p class="detail-empty">${state.users.length ? "Select a user to inspect properties." : "No user selected."}</p>`;
    return;
  }

  const properties = [
    ["Email", user.email],
    ["Status", formatUserStatus(user.status)],
    ["Vehicle", formatVehicle(user.vehicle_type)],
    ["Country", user.country || "-"],
    ["Region", user.region || "-"],
    ["Owns", formatOwnershipDuration(user.ownership_duration)],
    ["Apps", formatAppInterests(user)],
    ["Other app", user.other_app_interest || "-"],
    ["VIN", user.bound_vin_suffix ? `...${user.bound_vin_suffix}` : "-"],
    ["Invite", formatInviteState(user)],
    ["Invite count", Number(user.invite_count || 0).toLocaleString()],
    ["Language", user.locale || "-"],
    ["Source", user.source || "-"],
    ["Created", formatDateTime(user.created_at)],
    ["Updated", formatDateTime(user.updated_at)],
    ["Invited", formatDateTime(user.invited_at)],
    ["Last login", formatDateTime(user.last_login_at)],
    ["Notes", user.notes || "-"],
  ];

  userDetailsEl.innerHTML = `
    <div class="user-detail-heading">
      <div>
        <h3>${escapeHtml(user.email)}</h3>
        <span class="status-pill ${escapeHtml(user.status)}">${escapeHtml(formatUserStatus(user.status))}</span>
      </div>
    </div>
    <dl class="detail-list">
      ${properties.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join("")}
    </dl>
    <div class="row-actions detail-actions">
      <button type="button" data-user-detail-action="invite">Invite</button>
      <button type="button" data-user-detail-action="tester">Tester</button>
      <button type="button" data-user-detail-action="disable">Disable</button>
    </div>
  `;
}

function renderUserSortState() {
  if (userSortSelect) userSortSelect.value = state.userSort.field;
  if (userSortDirectionButton) userSortDirectionButton.textContent = state.userSort.direction === "asc" ? "Asc" : "Desc";
  document.querySelectorAll("[data-user-sort]").forEach((button) => {
    const active = button.dataset.userSort === state.userSort.field;
    button.classList.toggle("is-active", active);
    button.dataset.direction = active ? state.userSort.direction : "";
  });
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
  const isUser = kind === "user";
  const page = isUser ? state.userPage : state.vehiclePage;
  const count = isUser ? state.users.length : state.vehicles.length;
  const label = isUser ? userPageLabel : vehiclePageLabel;
  const prevButton = isUser ? userPrevButton : vehiclePrevButton;
  const nextButton = isUser ? userNextButton : vehicleNextButton;
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
  const result = await postJson("/v1/admin/users/invite", payload);
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
    const vin = result.vehicle?.vin_suffix ? ` · VIN ...${result.vehicle.vin_suffix}` : " · VIN binds on first Hub activation";
    inviteCodeEl.textContent = `Code: ${result.activation_code}${vin}`;
  }
  if (inviteSubjectInput) inviteSubjectInput.value = result.email_template.subject || "";
  if (inviteMessageInput) inviteMessageInput.value = result.email_template.text || "";
  if (inviteMailtoLink) inviteMailtoLink.href = result.email_template.mailto || "#";
}

function prefillInviteFromUser(user) {
  if (!inviteForm || !user) return;
  switchTab("invite");
  inviteForm.elements.email.value = user.email || "";
  inviteForm.elements.vehicle_type.value = user.vehicle_type || "c10_bev";
  inviteForm.elements.country.value = user.country || "BR";
  inviteForm.elements.locale.value = String(user.locale || "").toLowerCase().startsWith("pt") ? "pt-BR" : "en";
  inviteForm.elements.access.value = "trial";
  inviteForm.elements.trial_days.value = "7";
  inviteForm.elements.code_days.value = "14";
  inviteForm.elements.email.focus();
  if (accessForm) {
    accessForm.elements.email.value = user.email || "";
  }
  setAdminStatus("Invite filled from user. The VIN will bind when the code is redeemed in Hub.", "success");
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

async function runUserAction(action, user) {
  if (!user) return;
  if (action === "invite") {
    prefillInviteFromUser(user);
    return;
  }
  const status = action === "tester" ? "tester" : action === "disable" ? "disabled" : "";
  if (!status) return;
  setAdminStatus("Updating user...");
  const result = await postJson("/v1/admin/users/set-status", {
    user_id: user.id,
    status,
  });
  setAdminStatus(`${result.user?.email || user.email} is now ${formatUserStatus(result.user?.status || status)}.`, "success");
  await refreshAll();
}

function exportCsv() {
  if (!state.users.length) {
    setAdminStatus("No user data to export.", "error");
    return;
  }
  const header = [
    "email",
    "status",
    "vehicle_type",
    "country",
    "region",
    "ownership_duration",
    "app_interests",
    "other_app_interest",
    "bound_vin_suffix",
    "active_invite_expires_at",
    "notes",
    "locale",
    "source",
    "created_at",
    "updated_at",
  ];
  const csv = [
    header.join(","),
    ...state.users.map((item) =>
      header
        .map((field) => {
          const value = field === "app_interests"
            ? (item.app_interests || []).join(";")
            : field.endsWith("_at")
              ? formatDateTime(item[field])
              : item[field] || "";
          return `"${String(value).replaceAll('"', '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `libremotor-users-${new Date().toISOString().slice(0, 10)}.csv`;
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
  state.users = [];
  state.selectedUserId = null;
  state.vehicles = [];
  state.userStats = null;
  state.vehicleStats = null;
  showLogin();
  setLoginStatus("Logged out.", "success");
}

function normalizeVinInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
}

function formatVehicle(value) {
  if (value === "b10") return "B10";
  if (value === "c10_bev") return "C10 BEV";
  if (value === "c10_reev") return "C10 REEV";
  return value || "-";
}

function formatOwnershipDuration(value) {
  if (value === "shopping") return "Shopping";
  if (value === "under_1_month") return "<1 month";
  if (value === "1_6_months") return "1-6 months";
  if (value === "6_12_months") return "6-12 months";
  if (value === "over_1_year") return ">1 year";
  return "-";
}

function formatAppInterest(value) {
  if (value === "waze") return "Waze";
  if (value === "android_auto_no_carlinkit") return "Android Auto";
  if (value === "youtube") return "YouTube";
  if (value === "openautolink") return "Phone projection";
  if (value === "other") return "Other";
  return value || "Unknown";
}

function formatAppInterests(item) {
  const selected = (item.app_interests || []).map(formatAppInterest);
  if (item.other_app_interest) selected.push(item.other_app_interest);
  return selected.length ? selected.join(", ") : "-";
}

function formatUserNotes(item) {
  const value = String(item.notes || "").replace(/\s+/g, " ").trim();
  if (!value) return "-";
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function formatAccess(value) {
  if (value === "lifetime") return "Lifetime";
  if (value === "trial") return "Trial";
  if (value === "expired") return "Expired";
  if (value === "disabled") return "Disabled";
  return value || "-";
}

function formatUserStatus(value) {
  if (value === "waitlist") return "Waitlist";
  if (value === "invited") return "Invited";
  if (value === "tester") return "Tester";
  if (value === "disabled") return "Disabled";
  return value || "-";
}

function formatInviteState(item) {
  if (item.bound_at) return `Bound ${formatDateTime(item.bound_at)}`;
  if (item.active_invite_expires_at) return `Open until ${formatDateTime(item.active_invite_expires_at)}`;
  if (item.last_invite_at) return `Last ${formatDateTime(item.last_invite_at)}`;
  return "-";
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
userFilterInput?.addEventListener("input", debounce(() => loadUserPage(0).catch((error) => {
  setAdminStatus(error.message || "Could not load users.", "error");
}), 250));
userStatusFilter?.addEventListener("change", () => {
  loadUserPage(0).catch((error) => {
    setAdminStatus(error.message || "Could not load users.", "error");
  });
});
userSortSelect?.addEventListener("change", () => {
  state.userSort.field = userSortSelect.value || "updated_at";
  loadUserPage(0).catch((error) => {
    setAdminStatus(error.message || "Could not sort users.", "error");
  });
});
userSortDirectionButton?.addEventListener("click", () => {
  state.userSort.direction = state.userSort.direction === "asc" ? "desc" : "asc";
  loadUserPage(0).catch((error) => {
    setAdminStatus(error.message || "Could not sort users.", "error");
  });
});
document.querySelectorAll("[data-user-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    const field = button.dataset.userSort;
    if (state.userSort.field === field) {
      state.userSort.direction = state.userSort.direction === "asc" ? "desc" : "asc";
    } else {
      state.userSort.field = field;
      state.userSort.direction = field === "updated_at" ? "desc" : "asc";
    }
    loadUserPage(0).catch((error) => {
      setAdminStatus(error.message || "Could not sort users.", "error");
    });
  });
});
vehicleFilterInput?.addEventListener("input", debounce(() => loadVehiclePage(0).catch((error) => {
  setAdminStatus(error.message || "Could not load vehicles.", "error");
}), 250));
userPrevButton?.addEventListener("click", () => {
  loadUserPage(Math.max(0, state.userPage.offset - state.userPage.limit)).catch((error) => {
    setAdminStatus(error.message || "Could not load previous users.", "error");
  });
});
userNextButton?.addEventListener("click", () => {
  if (state.userPage.nextOffset === null) return;
  loadUserPage(state.userPage.nextOffset).catch((error) => {
    setAdminStatus(error.message || "Could not load next users.", "error");
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

userRowsEl?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-action]");
  if (!button) {
    const row = event.target.closest("[data-user-index]");
    if (!row) return;
    const user = state.users[Number(row.dataset.userIndex)];
    if (!user) return;
    state.selectedUserId = user.id;
    renderUserRows();
    return;
  }
  try {
    await runUserAction(button.dataset.userAction, state.users[Number(button.dataset.userIndex)]);
  } catch (error) {
    setAdminStatus(error.message || "Could not update user.", "error");
  }
});

userRowsEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-user-index]");
  if (!row) return;
  event.preventDefault();
  const user = state.users[Number(row.dataset.userIndex)];
  if (!user) return;
  state.selectedUserId = user.id;
  renderUserRows();
});

userDetailsEl?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-detail-action]");
  if (!button) return;
  try {
    const user = state.users.find((item) => item.id === state.selectedUserId);
    await runUserAction(button.dataset.userDetailAction, user);
  } catch (error) {
    setAdminStatus(error.message || "Could not update user.", "error");
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

function debounce(callback, delay) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}
