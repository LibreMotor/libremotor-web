(function installLibremotorRealtimeAdapter() {
  "use strict";

  if (window.__LIBREMOTOR_REALTIME_ADAPTER__) return;

  const originalFetch = window.fetch.bind(window);
  const originalSetInterval = window.setInterval.bind(window);

  function statusSourceLabel(source, locale) {
    if (source === "hub_autosdk") return locale === "pt" ? "Hub / AutoSDK" : "Hub / AutoSDK";
    if (source === "hub_stale") return locale === "pt" ? "Hub desconectado" : "Hub offline";
    if (source === "leapmotor_cloud") return locale === "pt" ? "Nuvem Leapmotor" : "Leapmotor cloud";
    return source || (locale === "pt" ? "Indisponível" : "Unavailable");
  }

  function normalizeBattery12VSignal(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return null;
    if (raw >= 6 && raw <= 18) return raw;
    if (raw >= 60 && raw <= 180) return raw / 10;
    if (raw >= 600 && raw <= 1800) return raw / 100;
    if (raw >= 6000 && raw <= 18000) return raw / 1000;
    return null;
  }

  function adaptStatus(status) {
    if (!status || typeof status !== "object" || Array.isArray(status)) return status;

    const telemetry = status.telemetry && typeof status.telemetry === "object"
      ? status.telemetry
      : {};
    const capabilities = status.capabilities && typeof status.capabilities === "object"
      ? status.capabilities
      : {};
    const vehicleServices = capabilities.vehicle_services || telemetry.vehicleServices || {};
    const battery12v = normalizeBattery12VSignal(telemetry.battery12v ?? telemetry.battery12V);
    const sourceUpdatedAt = status.source === "hub_autosdk"
      ? status.hub_updated_at
      : status.cloud_updated_at || status.updated_at;

    return {
      ...status,
      capabilities: {
        ...capabilities,
        vehicleServices,
      },
      telemetry: {
        ...telemetry,
        battery12v,
        battery12V: battery12v,
        source: status.source || telemetry.source || "unavailable",
        connectedVia: status.connected_via || "",
        freshness: status.freshness || {},
        hubUpdatedAt: status.hub_updated_at || null,
        cloudUpdatedAt: status.cloud_updated_at || null,
        hubConnection: vehicleServices,
        hubConnectionSummary: status.source === "hub_autosdk"
          ? "Live native C10 connection"
          : status.source === "hub_stale"
            ? "Last native C10 reading"
            : "Leapmotor cloud cache",
        updatedAt: sourceUpdatedAt || status.updated_at || telemetry.updatedAt || null,
      },
      updated_at: sourceUpdatedAt || status.updated_at || null,
    };
  }

  function adaptPayload(payload, requestUrl) {
    if (!payload || typeof payload !== "object") return payload;
    const path = new URL(requestUrl, window.location.href).pathname;
    if (!/^\/v1\/app\/vehicles\/[^/]+\/(?:status|sync)$/.test(path)) return payload;

    if (payload.status) {
      const status = adaptStatus(payload.status);
      return {
        ...payload,
        status,
        synced_at: status.updated_at || payload.synced_at || null,
      };
    }
    return adaptStatus(payload);
  }

  window.fetch = async function libremotorFetch(input, init) {
    const response = await originalFetch(input, init);
    const requestUrl = typeof input === "string" ? input : input.url;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return response;

    const clone = response.clone();
    const payload = await clone.json().catch(() => null);
    const adapted = adaptPayload(payload, requestUrl);
    if (adapted === payload) return response;

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify(adapted), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  // Keep the cloud refresh at its existing cadence. Only accelerate the cheap
  // cached status read so native Hub heartbeats reach the foreground quickly.
  window.setInterval = function libremotorSetInterval(handler, timeout, ...args) {
    const effectiveTimeout = timeout === 30_000 ? 5_000 : timeout;
    return originalSetInterval(handler, effectiveTimeout, ...args);
  };

  function updateSourceBadges() {
    const locale = localStorage.getItem("libremotor.appLocale") === "pt" ? "pt" : "en";
    document.querySelectorAll(".status-live-strip").forEach((strip) => {
      const spans = Array.from(strip.querySelectorAll(":scope > span"));
      const sourceSpan = spans.find((span) => /^(Source|Origem):/i.test(span.textContent.trim()));
      const sourceStrong = sourceSpan && sourceSpan.querySelector("strong");
      if (!sourceStrong) return;

      const rawSource = sourceStrong.textContent.trim();
      const machineSource = ["hub_autosdk", "hub_stale", "leapmotor_cloud", "unavailable"].includes(rawSource)
        ? rawSource
        : strip.dataset.source;
      if (!machineSource) return;
      const sourceLabel = statusSourceLabel(machineSource, locale);
      if (sourceStrong.textContent !== sourceLabel) sourceStrong.textContent = sourceLabel;
      strip.dataset.source = machineSource;

      const liveSpan = spans[0];
      if (!liveSpan) return;
      const label = machineSource === "hub_autosdk"
        ? (locale === "pt" ? "Ao vivo via AutoSDK" : "Live via AutoSDK")
        : (locale === "pt" ? "Dados em cache" : "Cached vehicle data");
      const textNode = Array.from(liveSpan.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode && textNode.nodeValue !== label) textNode.nodeValue = label;
    });
  }

  const observer = new MutationObserver(updateSourceBadges);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", updateSourceBadges, { once: true });

  window.__LIBREMOTOR_REALTIME_ADAPTER__ = {
    version: "2026.07.17",
    adaptStatus,
  };
})();
