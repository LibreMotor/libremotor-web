const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const intervalCallbacks = new Map();
let nextTimerId = 1;
let statusRequests = 0;
let streamTokenRequests = 0;

const baseStatus = {
  vehicle_id: "a".repeat(64),
  state: "online",
  telemetry: { batteryPercent: 50 },
  capabilities: {},
  source: "leapmotor_cloud",
  updated_at: 100,
  cloud_updated_at: 100,
  freshness: { cloud: { available: true } },
};

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type, event = {}) {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;
    this.listeners.get(type)?.(event);
  }

  close() {
    this.emit("close");
  }
}

const pageListeners = new Map();
global.window = {
  location: { href: "https://libremotor.com/app/" },
  fetch: async (input) => {
    const url = String(input);
    if (url.endsWith("/stream-token")) {
      streamTokenRequests += 1;
      return Response.json({
        stream_url: "wss://mqtt-control.libremotor.com/v1/stream?token=scoped-test-token",
      });
    }
    if (url.endsWith("/status")) {
      statusRequests += 1;
      return Response.json(baseStatus);
    }
    throw new Error(`Unexpected request: ${url}`);
  },
  setInterval(callback) {
    const id = nextTimerId++;
    intervalCallbacks.set(id, callback);
    return id;
  },
  clearInterval(id) {
    intervalCallbacks.delete(id);
  },
  setTimeout(callback, delay) {
    const id = nextTimerId++;
    if (delay === 0) queueMicrotask(callback);
    return id;
  },
  clearTimeout() {},
  addEventListener(type, listener) {
    pageListeners.set(type, listener);
  },
  dispatchEvent() {},
};
global.document = {
  documentElement: {},
  querySelectorAll: () => [],
};
global.localStorage = { getItem: () => null };
global.MutationObserver = class {
  observe() {}
};
global.Node = { TEXT_NODE: 3 };
global.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
global.WebSocket = FakeWebSocket;

const adapterSource = fs.readFileSync(
  require.resolve("../app/realtime-adapter.js"),
  "utf8",
);
vm.runInThisContext(adapterSource, { filename: "realtime-adapter.js" });

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  let renderedStatus = null;
  const statusUrl = `https://api.libremotor.com/v1/app/vehicles/${baseStatus.vehicle_id}/status`;
  const intervalId = window.setInterval(async () => {
    const response = await window.fetch(statusUrl, {
      headers: { authorization: "Bearer app-session" },
    });
    renderedStatus = await response.json();
  }, 5_000);

  await intervalCallbacks.get(intervalId)();
  await settle();
  assert.equal(statusRequests, 1);
  assert.equal(streamTokenRequests, 1);
  assert.equal(FakeWebSocket.instances.length, 1);

  const socket = FakeWebSocket.instances[0];
  socket.emit("open");
  socket.emit("message", {
    data: JSON.stringify({
      type: "telemetry",
      vehicle_id: baseStatus.vehicle_id,
      received_at: 200,
      payload: {
        state: "online",
        device_id: "c10-hub",
        session_id: "session",
        bridge_version: "test",
        telemetry: { batteryPercent: 72, speedKmh: 31 },
        capabilities: {
          vehicle_services: {
            autoSdk: { connected: true },
            commandsEnabled: true,
          },
        },
        cameras: [],
      },
    }),
  });
  await settle();

  assert.equal(renderedStatus.source, "hub_autosdk");
  assert.equal(renderedStatus.connected_via, "autosdk");
  assert.equal(renderedStatus.telemetry.batteryPercent, 72);
  assert.equal(renderedStatus.telemetry.speedKmh, 31);
  assert.equal(renderedStatus.hub_updated_at, 200);
  assert.equal(statusRequests, 1, "live refresh must not call the Worker status endpoint");

  await intervalCallbacks.get(intervalId)();
  assert.equal(statusRequests, 1, "periodic reads must use the live cache while WSS is healthy");

  socket.emit("close");
  await intervalCallbacks.get(intervalId)();
  assert.equal(statusRequests, 2, "HTTP polling must resume when the stream disconnects");

  pageListeners.get("pagehide")?.();
  console.log("realtime adapter transport test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
