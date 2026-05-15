const API_BASE_URL = "https://api.libremotor.com";
const TOKEN_STORAGE_KEY = "libremotor.adminToken";

const state = {
  items: [],
  stats: null,
};

const authForm = document.querySelector("[data-admin-auth]");
const tokenInput = authForm?.elements.token;
const statusEl = document.querySelector("[data-admin-status]");
const metricsEl = document.querySelector("[data-metrics]");
const countryStatsEl = document.querySelector("[data-country-stats]");
const dayStatsEl = document.querySelector("[data-day-stats]");
const rowsEl = document.querySelector("[data-signup-rows]");
const filterInput = document.querySelector("[data-filter]");

function setStatus(message, stateName = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.state = stateName;
}

function storedToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function activeToken() {
  return tokenInput?.value.trim() || storedToken();
}

async function loadDashboard() {
  const token = activeToken();
  if (!token) {
    setStatus("Admin token is required.", "error");
    return;
  }

  setStatus("Loading beta interest data...");
  const response = await fetch(`${API_BASE_URL}/v1/admin/beta-interest?limit=500`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Request failed with ${response.status}`);
  }

  const payload = await response.json();
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  state.items = Array.isArray(payload.items) ? payload.items : [];
  state.stats = payload.stats || buildFallbackStats(state.items);
  renderDashboard();
  setStatus(`Loaded ${state.items.length} latest signups. Total: ${payload.total ?? state.items.length}.`, "success");
}

function buildFallbackStats(items) {
  return {
    total: items.length,
    updated_last_24h: items.filter((item) => Number(item.updated_at || 0) >= Date.now() / 1000 - 86400).length,
    by_vehicle_type: groupItems(items, "vehicle_type"),
    by_country: groupItems(items, "country"),
    by_locale: groupItems(items, "locale"),
    by_day: groupItems(
      items.map((item) => ({ day: formatDay(item.updated_at) })),
      "day",
    ),
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

function renderDashboard() {
  const stats = state.stats || buildFallbackStats(state.items);
  const vehicleStats = new Map((stats.by_vehicle_type || []).map((entry) => [entry.value, entry.count]));
  renderMetrics([
    ["Total", stats.total ?? state.items.length],
    ["Last 24h", stats.updated_last_24h ?? 0],
    ["C10 BEV", vehicleStats.get("c10_bev") || 0],
    ["C10 REEV", vehicleStats.get("c10_reev") || 0],
  ]);
  renderStatList(countryStatsEl, stats.by_country || []);
  renderStatList(dayStatsEl, stats.by_day || [], "day");
  renderRows();
}

function renderMetrics(metrics) {
  if (!metricsEl) return;
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

function renderRows() {
  if (!rowsEl) return;
  const query = (filterInput?.value || "").trim().toLowerCase();
  const items = query
    ? state.items.filter((item) =>
        [item.email, item.vehicle_type, item.country, item.locale, item.source]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : state.items;

  if (!items.length) {
    rowsEl.innerHTML = `<tr><td colspan="7">${state.items.length ? "No signups match this filter." : "No signups yet."}</td></tr>`;
    return;
  }

  rowsEl.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.email)}</td>
          <td>${escapeHtml(formatVehicle(item.vehicle_type))}</td>
          <td>${escapeHtml(item.country)}</td>
          <td>${escapeHtml(item.locale || "-")}</td>
          <td>${escapeHtml(item.source || "-")}</td>
          <td>${escapeHtml(formatDateTime(item.created_at))}</td>
          <td>${escapeHtml(formatDateTime(item.updated_at))}</td>
        </tr>
      `,
    )
    .join("");
}

function exportCsv() {
  if (!state.items.length) {
    setStatus("No data to export.", "error");
    return;
  }
  const header = ["email", "vehicle_type", "country", "locale", "source", "created_at", "updated_at"];
  const csv = [
    header.join(","),
    ...state.items.map((item) =>
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

function formatVehicle(value) {
  if (value === "c10_bev") return "C10 BEV";
  if (value === "c10_reev") return "C10 REEV";
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

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadDashboard();
  } catch (error) {
    setStatus(error.message || "Could not load dashboard.", "error");
  }
});

document.querySelector("[data-refresh]")?.addEventListener("click", async () => {
  try {
    await loadDashboard();
  } catch (error) {
    setStatus(error.message || "Could not refresh dashboard.", "error");
  }
});

document.querySelector("[data-export-csv]")?.addEventListener("click", exportCsv);

document.querySelector("[data-forget-token]")?.addEventListener("click", () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  if (tokenInput) tokenInput.value = "";
  setStatus("Admin token removed from this browser.", "success");
});

filterInput?.addEventListener("input", renderRows);

if (tokenInput && storedToken()) {
  tokenInput.value = storedToken();
}
