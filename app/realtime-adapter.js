(function installLibremotorRealtimeAdapter() {
  "use strict";

  if (window.__LIBREMOTOR_REALTIME_ADAPTER__) return;

  const originalFetch = window.fetch.bind(window);
  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  const intervalRecords = new Map();
  const statusIntervals = new Set();
  const baseStatusByVehicle = new Map();
  const liveStatusByVehicle = new Map();
  let activeIntervalRecord = null;
  let streamContext = null;
  let streamSocket = null;
  let streamConnecting = false;
  let streamReconnectTimer = null;
  let streamRetryMs = 1_000;
  let refreshQueued = false;

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

  function requestDetails(input, init) {
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(requestUrl, window.location.href);
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init && init.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    const method = String(init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    return {
      method,
      requestUrl: url.toString(),
      path: url.pathname,
      apiOrigin: url.origin,
      authorization: headers.get("authorization") || "",
    };
  }

  function statusVehicleId(path) {
    const match = path.match(/^\/v1\/app\/vehicles\/([^/]+)\/(?:status|sync)$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function jsonResponse(payload) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    });
  }

  function currentStreamReady(vehicleId) {
    return streamContext?.vehicleId === vehicleId && streamSocket?.readyState === 1;
  }

  function mergeTelemetryStatus(baseStatus, envelope) {
    const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
    const telemetry = payload.telemetry && typeof payload.telemetry === "object" ? payload.telemetry : {};
    const incomingCapabilities = payload.capabilities && typeof payload.capabilities === "object"
      ? payload.capabilities
      : {};
    const baseCapabilities = baseStatus?.capabilities && typeof baseStatus.capabilities === "object"
      ? baseStatus.capabilities
      : {};
    const capabilities = {
      ...baseCapabilities,
      ...incomingCapabilities,
      vehicle_services: {
        ...(baseCapabilities.vehicle_services || {}),
        ...(incomingCapabilities.vehicle_services || {}),
      },
    };
    const vehicleServices = capabilities.vehicle_services || {};
    const autoSdk = vehicleServices.autoSdk || capabilities.autoSdk || {};
    const legacyCarControl = vehicleServices.legacyCarControl || capabilities.legacyCarControl || {};
    const updatedAt = Number(envelope.received_at || Math.floor(Date.now() / 1_000));
    const baseFreshness = baseStatus?.freshness && typeof baseStatus.freshness === "object"
      ? baseStatus.freshness
      : {};

    return adaptStatus({
      ...(baseStatus || {}),
      vehicle_id: envelope.vehicle_id || baseStatus?.vehicle_id || "",
      state: payload.state || "online",
      device_id: payload.device_id || baseStatus?.device_id || "",
      session_id: payload.session_id || baseStatus?.session_id || "",
      bridge_version: payload.bridge_version || baseStatus?.bridge_version || "",
      telemetry: {
        ...(baseStatus?.telemetry || {}),
        ...telemetry,
      },
      capabilities,
      cameras: Array.isArray(payload.cameras) ? payload.cameras : baseStatus?.cameras || [],
      source: "hub_autosdk",
      connected_via: autoSdk.connected === true ? "autosdk" : "mqtt",
      updated_at: updatedAt,
      hub_updated_at: updatedAt,
      freshness: {
        ...baseFreshness,
        generated_at: updatedAt,
        hub: {
          ...(baseFreshness.hub || {}),
          available: true,
          fresh: true,
          age_seconds: 0,
          updated_at: updatedAt,
          state: payload.state || "online",
          bridge_version: payload.bridge_version || baseStatus?.bridge_version || "",
          autosdk_connected: autoSdk.connected === true,
          car_control_connected: legacyCarControl.primaryBinderConnected === true,
          local_commands_enabled: vehicleServices.commandsEnabled === true,
        },
      },
    });
  }

  function mergePresenceStatus(currentStatus, envelope) {
    if (!currentStatus) return null;
    const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
    const state = payload.state || currentStatus.state || "offline";
    const receivedAt = Number(envelope.received_at || Math.floor(Date.now() / 1_000));
    const freshness = currentStatus.freshness && typeof currentStatus.freshness === "object"
      ? currentStatus.freshness
      : {};
    return adaptStatus({
      ...currentStatus,
      state,
      source: state === "online" ? currentStatus.source : "hub_stale",
      connected_via: state === "online" ? currentStatus.connected_via : "mqtt",
      freshness: {
        ...freshness,
        generated_at: receivedAt,
        hub: {
          ...(freshness.hub || {}),
          available: true,
          fresh: state === "online",
          state,
        },
      },
    });
  }

  function triggerStatusRefresh(vehicleId) {
    if (refreshQueued) return;
    refreshQueued = true;
    window.setTimeout(() => {
      refreshQueued = false;
      statusIntervals.forEach((record) => {
        if (record.vehicleIds.has(vehicleId)) record.run();
      });
    }, 0);
  }

  function handleStreamEnvelope(raw) {
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return;
    }
    const vehicleId = String(envelope?.vehicle_id || "");
    if (!vehicleId || vehicleId !== streamContext?.vehicleId) return;

    if (envelope.type === "telemetry") {
      const status = mergeTelemetryStatus(
        liveStatusByVehicle.get(vehicleId) || baseStatusByVehicle.get(vehicleId),
        envelope,
      );
      liveStatusByVehicle.set(vehicleId, status);
      triggerStatusRefresh(vehicleId);
      window.dispatchEvent(new CustomEvent("libremotor:telemetry", { detail: envelope }));
      return;
    }
    if (envelope.type === "presence") {
      const status = mergePresenceStatus(
        liveStatusByVehicle.get(vehicleId) || baseStatusByVehicle.get(vehicleId),
        envelope,
      );
      if (status) {
        liveStatusByVehicle.set(vehicleId, status);
        triggerStatusRefresh(vehicleId);
      }
      window.dispatchEvent(new CustomEvent("libremotor:presence", { detail: envelope }));
      return;
    }
    if (envelope.type === "command-results") {
      window.dispatchEvent(new CustomEvent("libremotor:command-result", { detail: envelope }));
    }
  }

  function closeStream() {
    if (streamReconnectTimer) window.clearTimeout(streamReconnectTimer);
    streamReconnectTimer = null;
    const socket = streamSocket;
    streamSocket = null;
    if (socket && socket.readyState < 2) socket.close(1000, "stream context changed");
  }

  function scheduleStreamReconnect() {
    if (!streamContext || streamReconnectTimer) return;
    const delay = streamRetryMs;
    streamRetryMs = Math.min(streamRetryMs * 2, 30_000);
    streamReconnectTimer = window.setTimeout(() => {
      streamReconnectTimer = null;
      connectStream();
    }, delay);
  }

  async function connectStream() {
    if (!streamContext || streamConnecting || streamSocket?.readyState < 2) return;
    streamConnecting = true;
    const context = streamContext;
    try {
      const tokenResponse = await originalFetch(
        `${context.apiOrigin}/v1/app/vehicles/${encodeURIComponent(context.vehicleId)}/stream-token`,
        {
          method: "POST",
          headers: {
            authorization: context.authorization,
            "content-type": "application/json",
          },
          body: "{}",
        },
      );
      if (!tokenResponse.ok) throw new Error(`Stream token failed (${tokenResponse.status})`);
      const tokenPayload = await tokenResponse.json();
      if (streamContext !== context || !tokenPayload.stream_url) return;

      const socket = new WebSocket(tokenPayload.stream_url);
      streamSocket = socket;
      socket.addEventListener("open", () => {
        if (streamSocket !== socket) return;
        streamRetryMs = 1_000;
      });
      socket.addEventListener("message", (event) => {
        if (streamSocket === socket && typeof event.data === "string") {
          handleStreamEnvelope(event.data);
        }
      });
      socket.addEventListener("close", () => {
        if (streamSocket !== socket) return;
        streamSocket = null;
        scheduleStreamReconnect();
      });
      socket.addEventListener("error", () => {
        if (streamSocket === socket && socket.readyState < 2) socket.close();
      });
    } catch {
      if (streamContext === context) scheduleStreamReconnect();
    } finally {
      streamConnecting = false;
    }
  }

  function ensureStream(vehicleId, authorization, apiOrigin) {
    if (!vehicleId || !authorization) return;
    const changed = streamContext?.vehicleId !== vehicleId
      || streamContext?.authorization !== authorization
      || streamContext?.apiOrigin !== apiOrigin;
    if (changed) {
      closeStream();
      streamContext = { vehicleId, authorization, apiOrigin };
      streamRetryMs = 1_000;
    }
    connectStream();
  }

  window.fetch = async function libremotorFetch(input, init) {
    let details;
    try {
      details = requestDetails(input, init);
    } catch {
      return originalFetch(input, init);
    }
    const vehicleId = statusVehicleId(details.path);
    if (vehicleId && activeIntervalRecord) {
      activeIntervalRecord.vehicleIds.add(vehicleId);
      statusIntervals.add(activeIntervalRecord);
    }
    if (vehicleId && details.path.endsWith("/status")) {
      ensureStream(vehicleId, details.authorization, details.apiOrigin);
      const liveStatus = liveStatusByVehicle.get(vehicleId);
      if (liveStatus && currentStreamReady(vehicleId)) return jsonResponse(liveStatus);
    }

    const response = await originalFetch(input, init);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return response;

    const clone = response.clone();
    const payload = await clone.json().catch(() => null);
    const adapted = adaptPayload(payload, details.requestUrl);
    if (vehicleId && response.ok) {
      const status = adapted?.status || adapted;
      if (status && typeof status === "object" && !Array.isArray(status)) {
        baseStatusByVehicle.set(vehicleId, status);
        ensureStream(vehicleId, details.authorization, details.apiOrigin);
      }
    }
    if (adapted === payload) return response;

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify(adapted), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  window.setInterval = function libremotorSetInterval(handler, timeout, ...args) {
    if (typeof handler !== "function") return originalSetInterval(handler, timeout, ...args);
    const record = {
      vehicleIds: new Set(),
      run() {
        const previous = activeIntervalRecord;
        activeIntervalRecord = record;
        try {
          return handler(...args);
        } finally {
          activeIntervalRecord = previous;
        }
      },
    };
    const id = originalSetInterval(record.run, timeout);
    intervalRecords.set(id, record);
    return id;
  };

  window.clearInterval = function libremotorClearInterval(id) {
    const record = intervalRecords.get(id);
    if (record) {
      statusIntervals.delete(record);
      intervalRecords.delete(id);
    }
    return originalClearInterval(id);
  };

  window.addEventListener("pagehide", closeStream);

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
    version: "2026.07.17-mqtt",
    adaptStatus,
    mergeTelemetryStatus,
  };
})();
