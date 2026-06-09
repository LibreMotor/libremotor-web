const API_BASE_URL = "https://api.libremotor.com";
const DASHBOARD_TOKEN_KEY = "libremotor.dashboardToken";

const leadEl = document.querySelector("[data-dashboard-lead]");
const statusEl = document.querySelector("[data-dashboard-status]");
const emptyEl = document.querySelector("[data-dashboard-empty]");
const shellEl = document.querySelector("[data-dashboard-shell]");
const metricsEl = document.querySelector("[data-dashboard-metrics]");
const telemetryEl = document.querySelector("[data-dashboard-telemetry]");
const camerasEl = document.querySelector("[data-dashboard-cameras]");
const refreshButton = document.querySelector("[data-refresh-dashboard]");
const clearButton = document.querySelector("[data-clear-dashboard]");

function setStatus(message, state = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function dashboardToken() {
  return sessionStorage.getItem(DASHBOARD_TOKEN_KEY) || "";
}

function saveDashboardToken(token) {
  if (token) {
    sessionStorage.setItem(DASHBOARD_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(DASHBOARD_TOKEN_KEY);
  }
}

async function redeemPairingCode(code) {
  const response = await fetch(`${API_BASE_URL}/v1/bridge/pairings/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairing_code: code }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Pairing failed.");
  }
  saveDashboardToken(payload.dashboard_token || "");
  return payload;
}

async function loadDashboard() {
  const token = dashboardToken();
  if (!token) {
    renderDisconnected();
    return;
  }
  setStatus("Loading vehicle status...");
  const response = await fetch(`${API_BASE_URL}/v1/bridge/dashboard/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    saveDashboardToken("");
    renderDisconnected();
    throw new Error(payload.message || payload.error || "Dashboard token expired.");
  }
  renderDashboard(payload);
  setStatus("Connected.", "success");
}

function renderDisconnected() {
  if (emptyEl) emptyEl.hidden = false;
  if (shellEl) shellEl.hidden = true;
  if (leadEl) leadEl.textContent = "Scan a fresh QR code from Libremotor Hub to pair this dashboard.";
}

function renderDashboard(status) {
  if (emptyEl) emptyEl.hidden = true;
  if (shellEl) shellEl.hidden = false;
  if (leadEl) {
    leadEl.textContent = `Vehicle ${status.vin_suffix ? `ending ${status.vin_suffix}` : "paired"} via Libremotor Hub.`;
  }
  renderMetrics(status);
  renderTelemetry(status.telemetry || {});
  renderCameras(status.cameras || []);
}

function renderMetrics(status) {
  if (!metricsEl) return;
  const updated = status.updated_at ? formatDate(status.updated_at) : "Never";
  metricsEl.innerHTML = [
    metricCard("Bridge", status.state || "offline", status.bridge_version || "No version"),
    metricCard("Vehicle", status.vehicle_status || "unknown", status.vin_suffix ? `VIN ...${status.vin_suffix}` : "VIN hidden"),
    metricCard("Last seen", updated, status.device_id ? "Hub connected" : "No Hub device"),
  ].join("");
}

function renderTelemetry(telemetry) {
  if (!telemetryEl) return;
  const entries = Object.entries(telemetry);
  if (!entries.length) {
    telemetryEl.innerHTML = `<p class="detail-empty">No telemetry reported yet.</p>`;
    return;
  }
  telemetryEl.innerHTML = entries
    .map(([key, value]) => `
      <div class="dashboard-detail">
        <span>${escapeHtml(formatKey(key))}</span>
        <strong>${escapeHtml(formatValue(value))}</strong>
      </div>
    `)
    .join("");
}

function renderCameras(cameras) {
  if (!camerasEl) return;
  if (!cameras.length) {
    camerasEl.innerHTML = `<p class="detail-empty">No camera capability reported yet.</p>`;
    return;
  }
  camerasEl.innerHTML = cameras
    .map((camera) => `
      <div class="dashboard-camera">
        <div>
          <strong>${escapeHtml(formatKey(camera.source || "camera"))}</strong>
          <span>${escapeHtml(camera.detail || camera.privacy || "")}</span>
        </div>
        <span class="status-pill">${escapeHtml(camera.status || "unknown")}</span>
      </div>
    `)
    .join("");
}

function metricCard(label, value, detail) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail || "")}</small>
    </article>
  `;
}

function formatKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(epochSeconds) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(Number(epochSeconds) * 1000));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function boot() {
  const code = new URLSearchParams(window.location.search).get("code");
  try {
    if (code) {
      setStatus("Pairing dashboard...");
      await redeemPairingCode(code);
      window.history.replaceState({}, "", window.location.pathname);
    }
    await loadDashboard();
  } catch (error) {
    setStatus(error.message || "Dashboard unavailable.", "error");
  }
}

refreshButton?.addEventListener("click", () => {
  loadDashboard().catch((error) => setStatus(error.message || "Dashboard unavailable.", "error"));
});

clearButton?.addEventListener("click", () => {
  saveDashboardToken("");
  setStatus("Disconnected.");
  renderDisconnected();
});

boot();
