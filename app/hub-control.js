(function installLibremotorHubControl() {
  "use strict";

  if (window.__LIBREMOTOR_HUB_CONTROL__) return;
  window.__LIBREMOTOR_HUB_CONTROL__ = true;

  const API_ORIGIN = "https://api.libremotor.com";
  const SESSION_KEY = "libremotor.appSessionToken";
  const VEHICLE_KEY = "libremotor.appVehicleId";
  const LOCALE_KEY = "libremotor.appLocale";
  const MAX_APK_BYTES = 512 * 1024 * 1024;
  const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
  const MANAGED_APPS = ["youtube", "waze", "microg", "zlink"];
  let controller = null;
  let mountScheduled = false;

  const COPY = {
    en: {
      title: "Hub Control",
      overview: "Overview",
      apps: "Apps",
      apks: "APKs",
      jobs: "Jobs",
      settings: "Settings",
      tools: "Tools",
      online: "Online",
      offline: "Offline",
      connected: "Connected Hub",
      version: "Version",
      update: "Update",
      jobsLabel: "Recent jobs",
      uploadsLabel: "Private APKs",
      refresh: "Refresh",
      checkUpdate: "Check update",
      installUpdate: "Install update",
      refreshSources: "Refresh sources",
      diagnostics: "Diagnostics",
      inventory: "Camera inventory",
      installed: "Installed",
      notInstalled: "Not installed",
      unknown: "Waiting for Hub data",
      fetchPatch: "Fetch & patch",
      uploadPatch: "Upload & patch",
      launch: "Open in car",
      uninstall: "Uninstall",
      uploadApk: "Upload APK",
      rawInstall: "Install unchanged",
      remove: "Delete",
      universal: "Universal repackage",
      outputPackage: "Output package",
      selectRepackage: "Select APK & install",
      probe: "Package probe",
      buildProbe: "Build & install probe",
      noUploads: "No private APK uploads",
      noJobs: "No remote Hub jobs",
      file: "File",
      size: "Size",
      status: "Status",
      action: "Action",
      updated: "Updated",
      progress: "Progress",
      waiting: "Waiting for Android confirmation",
      failed: "Failed",
      succeeded: "Completed",
      running: "Running",
      queued: "Queued",
      ready: "Ready",
      uploading: "Uploading",
      consumed: "Assigned",
      driverCamera: "Driver camera sharing",
      autoUpdates: "Automatic Hub updates",
      updateDialog: "Update prompt in car",
      processRuntime: "Isolated patch runtime",
      versionSafeguard: "Compatible-version safeguard",
      hubRequired: "Install the latest Hub in the car to unlock remote controls.",
      uploadPrivate: "Encrypted transport and private temporary storage",
      officialSource: "Hub official source",
      localSource: "Browser upload",
      confirmInstall: "Send this install job to the paired car?",
      confirmUninstall: "Remove this app from the paired car?",
      confirmDelete: "Delete this private APK upload?",
      invalidApk: "Choose one base APK up to 512 MB.",
      invalidPackage: "Enter a valid Android package name.",
      uploadComplete: "APK upload is ready.",
      jobQueued: "Job queued in the car.",
      apiUnavailable: "Hub controls are temporarily unavailable.",
      source: "Source",
      patchInstall: "Patch & install",
      jobActivity: "Remote activity",
      privacy: "Internal package slots, signing keys, VIN, and activation credentials remain hidden in the car.",
    },
    pt: {
      title: "Controle do Hub",
      overview: "Visão geral",
      apps: "Apps",
      apks: "APKs",
      jobs: "Tarefas",
      settings: "Ajustes",
      tools: "Ferramentas",
      online: "Online",
      offline: "Offline",
      connected: "Hub conectado",
      version: "Versão",
      update: "Atualização",
      jobsLabel: "Tarefas recentes",
      uploadsLabel: "APKs privados",
      refresh: "Atualizar",
      checkUpdate: "Verificar atualização",
      installUpdate: "Instalar atualização",
      refreshSources: "Atualizar fontes",
      diagnostics: "Diagnóstico",
      inventory: "Inventário de câmeras",
      installed: "Instalado",
      notInstalled: "Não instalado",
      unknown: "Aguardando dados do Hub",
      fetchPatch: "Baixar e aplicar",
      uploadPatch: "Enviar e aplicar",
      launch: "Abrir no carro",
      uninstall: "Desinstalar",
      uploadApk: "Enviar APK",
      rawInstall: "Instalar sem alterar",
      remove: "Excluir",
      universal: "Reempacotamento universal",
      outputPackage: "Pacote de destino",
      selectRepackage: "Escolher APK e instalar",
      probe: "Teste de pacote",
      buildProbe: "Gerar e instalar teste",
      noUploads: "Nenhum APK privado enviado",
      noJobs: "Nenhuma tarefa remota do Hub",
      file: "Arquivo",
      size: "Tamanho",
      status: "Estado",
      action: "Ação",
      updated: "Atualizado",
      progress: "Progresso",
      waiting: "Aguardando confirmação do Android",
      failed: "Falhou",
      succeeded: "Concluído",
      running: "Executando",
      queued: "Na fila",
      ready: "Pronto",
      uploading: "Enviando",
      consumed: "Associado",
      driverCamera: "Compartilhar câmera do motorista",
      autoUpdates: "Atualizações automáticas do Hub",
      updateDialog: "Aviso de atualização no carro",
      processRuntime: "Patches em processo isolado",
      versionSafeguard: "Proteção de versão compatível",
      hubRequired: "Instale o Hub mais recente no carro para liberar os controles remotos.",
      uploadPrivate: "Transporte criptografado e armazenamento privado temporário",
      officialSource: "Fonte oficial do Hub",
      localSource: "Envio pelo navegador",
      confirmInstall: "Enviar esta instalação para o carro pareado?",
      confirmUninstall: "Remover este app do carro pareado?",
      confirmDelete: "Excluir este APK privado?",
      invalidApk: "Escolha um APK base de até 512 MB.",
      invalidPackage: "Digite um nome de pacote Android válido.",
      uploadComplete: "O APK está pronto.",
      jobQueued: "Tarefa enviada ao carro.",
      apiUnavailable: "Os controles do Hub estão temporariamente indisponíveis.",
      source: "Fonte",
      patchInstall: "Aplicar e instalar",
      jobActivity: "Atividade remota",
      privacy: "Pacotes internos, chaves de assinatura, VIN e credenciais de ativação permanecem ocultos no carro.",
    },
  };

  function locale() {
    return localStorage.getItem(LOCALE_KEY) === "pt" ? "pt" : "en";
  }

  function text(key) {
    return COPY[locale()][key] || COPY.en[key] || key;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function formatTime(value) {
    const raw = Number(value || 0);
    if (!raw) return "--";
    return new Intl.DateTimeFormat(locale() === "pt" ? "pt-BR" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(raw * 1000));
  }

  function friendlyStatus(value) {
    const key = String(value || "").toLowerCase();
    return text(key) || key;
  }

  async function sha256Hex(buffer) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  class HubControl {
    constructor(screen) {
      this.screen = screen;
      this.root = document.createElement("div");
      this.root.className = "hub-control-root";
      this.root.dataset.libremotorHubControl = "true";
      this.activeTab = "overview";
      this.data = null;
      this.notice = "";
      this.error = "";
      this.busy = new Set();
      this.uploadProgress = null;
      this.universalPackage = "";
      this.probePackage = "";
      this.pendingSettings = new Map();
      this.destroyed = false;
      this.onClick = this.onClick.bind(this);
      this.onChange = this.onChange.bind(this);
      this.onInput = this.onInput.bind(this);
      this.root.addEventListener("click", this.onClick);
      this.root.addEventListener("change", this.onChange);
      this.root.addEventListener("input", this.onInput);
      this.attach();
      this.render();
      this.refresh();
      this.timer = window.setInterval(() => this.refresh({ quiet: true }), 2500);
      window.addEventListener("libremotor:command-result", this.onCommandResult = () => {
        this.refresh({ quiet: true });
      });
    }

    attach() {
      for (const child of this.screen.children) {
        if (child !== this.root) child.classList.add("hub-native-hidden");
      }
      if (!this.root.isConnected) this.screen.append(this.root);
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      window.clearInterval(this.timer);
      window.removeEventListener("libremotor:command-result", this.onCommandResult);
      this.root.removeEventListener("click", this.onClick);
      this.root.removeEventListener("change", this.onChange);
      this.root.removeEventListener("input", this.onInput);
      for (const child of this.screen.children) child.classList.remove("hub-native-hidden");
      this.root.remove();
    }

    context() {
      return {
        token: localStorage.getItem(SESSION_KEY) || "",
        vehicleId: localStorage.getItem(VEHICLE_KEY) || "",
      };
    }

    async request(path, options = {}) {
      const { token } = this.context();
      if (!token) throw new Error("Session expired");
      const headers = new Headers(options.headers || {});
      headers.set("Authorization", `Bearer ${token}`);
      let body = options.body;
      if (body && !(body instanceof ArrayBuffer) && !(body instanceof Blob)) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(body);
      }
      const response = await fetch(`${API_ORIGIN}${path}`, {
        method: options.method || "GET",
        headers,
        body,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || "Request failed");
      return payload;
    }

    vehiclePath(suffix = "") {
      const { vehicleId } = this.context();
      if (!vehicleId) throw new Error("No paired vehicle selected");
      return `/v1/app/vehicles/${encodeURIComponent(vehicleId)}/hub${suffix}`;
    }

    async refresh({ quiet = false } = {}) {
      if (this.destroyed || this.busy.has("refresh")) return;
      this.busy.add("refresh");
      try {
        this.data = await this.request(this.vehiclePath());
        const reportedSettings = this.data?.controls?.settings || {};
        for (const [key, pending] of this.pendingSettings) {
          if (reportedSettings[key] === pending.value || Date.now() - pending.createdAt > 60_000) {
            this.pendingSettings.delete(key);
          }
        }
        if (!quiet) this.error = "";
      } catch (error) {
        if (!quiet || !this.data) this.error = error.message || text("apiUnavailable");
      } finally {
        this.busy.delete("refresh");
        if (!this.destroyed) this.render();
      }
    }

    async queueJob(request, label, { confirm = true } = {}) {
      if (!this.data?.online) throw new Error(text("hubRequired"));
      if (confirm && !window.confirm(text("confirmInstall"))) return null;
      const key = `job:${request.operation}:${request.app_id || request.output_package || ""}`;
      if (this.busy.has(key)) return null;
      this.busy.add(key);
      this.notice = label || text("jobQueued");
      this.error = "";
      this.render();
      try {
        const job = await this.request(this.vehiclePath("/jobs"), {
          method: "POST",
          body: { ...request, confirmed: true },
        });
        this.activeTab = "jobs";
        this.notice = text("jobQueued");
        await this.refresh({ quiet: true });
        return job;
      } catch (error) {
        this.error = error.message || "Job could not be queued";
        throw error;
      } finally {
        this.busy.delete(key);
        this.render();
      }
    }

    async upload(file) {
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".apk") || file.size <= 0 || file.size > MAX_APK_BYTES) {
        throw new Error(text("invalidApk"));
      }
      const key = "upload";
      if (this.busy.has(key)) throw new Error(text("uploading"));
      this.busy.add(key);
      this.error = "";
      this.notice = "";
      let upload = null;
      try {
        upload = await this.request(this.vehiclePath("/uploads"), {
          method: "POST",
          body: { file_name: file.name, size_bytes: file.size },
        });
        for (let index = 0; index < upload.chunk_count; index += 1) {
          const start = index * upload.chunk_size;
          const end = Math.min(start + upload.chunk_size, file.size);
          const buffer = await file.slice(start, end).arrayBuffer();
          const hash = await sha256Hex(buffer);
          await this.request(this.vehiclePath(`/uploads/${encodeURIComponent(upload.upload_id)}/chunks/${index}`), {
            method: "PUT",
            headers: { "X-Libremotor-Chunk-SHA256": hash },
            body: buffer,
          });
          this.uploadProgress = {
            name: file.name,
            current: end,
            total: file.size,
          };
          this.render();
        }
        const ready = await this.request(this.vehiclePath(`/uploads/${encodeURIComponent(upload.upload_id)}/complete`), {
          method: "POST",
          body: {},
        });
        this.notice = text("uploadComplete");
        await this.refresh({ quiet: true });
        return ready;
      } catch (error) {
        this.error = error.message || "APK upload failed";
        if (upload?.upload_id) {
          this.request(this.vehiclePath(`/uploads/${encodeURIComponent(upload.upload_id)}`), { method: "DELETE" }).catch(() => {});
        }
        throw error;
      } finally {
        this.uploadProgress = null;
        this.busy.delete(key);
        this.render();
      }
    }

    async uploadAndPatch(file, appId) {
      if (!window.confirm(text("confirmInstall"))) return;
      const upload = await this.upload(file);
      await this.queueJob({ operation: "patch_install", app_id: appId, upload_id: upload.upload_id }, text("patchInstall"), { confirm: false });
    }

    async uploadAndRepackage(file) {
      const outputPackage = this.universalPackage.trim();
      if (!PACKAGE_PATTERN.test(outputPackage)) throw new Error(text("invalidPackage"));
      if (!window.confirm(text("confirmInstall"))) return;
      const upload = await this.upload(file);
      await this.queueJob({ operation: "repackage_install", output_package: outputPackage, upload_id: upload.upload_id }, text("universal"), { confirm: false });
    }

    async onClick(event) {
      const button = event.target.closest("button[data-action], button[data-tab]");
      if (!button || !this.root.contains(button) || button.disabled) return;
      if (button.dataset.tab) {
        this.activeTab = button.dataset.tab;
        this.render();
        return;
      }
      const action = button.dataset.action;
      this.error = "";
      try {
        switch (action) {
          case "refresh":
            await this.refresh();
            break;
          case "pick-managed":
            this.root.querySelector(`input[data-managed-file="${CSS.escape(button.dataset.appId)}"]`)?.click();
            break;
          case "managed-fetch":
            await this.queueJob({ operation: "patch_install", app_id: button.dataset.appId }, text("fetchPatch"));
            break;
          case "launch":
            await this.queueJob({ operation: "app_launch", app_id: button.dataset.appId }, text("launch"), { confirm: false });
            break;
          case "uninstall":
            if (window.confirm(text("confirmUninstall"))) {
              await this.queueJob({ operation: "app_uninstall", app_id: button.dataset.appId }, text("uninstall"), { confirm: false });
            }
            break;
          case "pick-upload":
            this.root.querySelector("#hub-apk-upload")?.click();
            break;
          case "raw-install":
            await this.queueJob({ operation: "install_apk", upload_id: button.dataset.uploadId }, text("rawInstall"));
            break;
          case "delete-upload":
            if (window.confirm(text("confirmDelete"))) {
              await this.request(this.vehiclePath(`/uploads/${encodeURIComponent(button.dataset.uploadId)}`), { method: "DELETE" });
              await this.refresh({ quiet: true });
            }
            break;
          case "pick-repackage":
            if (!PACKAGE_PATTERN.test(this.universalPackage.trim())) throw new Error(text("invalidPackage"));
            this.root.querySelector("#hub-repackage-upload")?.click();
            break;
          case "probe":
            if (!PACKAGE_PATTERN.test(this.probePackage.trim())) throw new Error(text("invalidPackage"));
            await this.queueJob({ operation: "probe_install", output_package: this.probePackage.trim() }, text("probe"));
            break;
          case "check-update":
            await this.queueJob({ operation: "hub_update_check" }, text("checkUpdate"), { confirm: false });
            break;
          case "install-update":
            await this.queueJob({ operation: "hub_update_install" }, text("installUpdate"));
            break;
          case "refresh-sources":
            await this.queueJob({ operation: "sources_refresh" }, text("refreshSources"), { confirm: false });
            break;
          case "diagnostics":
            await this.queueJob({ operation: "diagnostics_snapshot" }, text("diagnostics"), { confirm: false });
            break;
          case "inventory":
            await this.queueJob({ operation: "inventory_refresh" }, text("inventory"), { confirm: false });
            break;
        }
      } catch (error) {
        this.error = error.message || "Action failed";
        this.render();
      }
    }

    async onChange(event) {
      const input = event.target;
      if (input.matches("input[data-managed-file]")) {
        const file = input.files?.[0];
        input.value = "";
        if (file) {
          try {
            await this.uploadAndPatch(file, input.dataset.managedFile);
          } catch (error) {
            this.error = error.message || "Action failed";
            this.render();
          }
        }
        return;
      }
      if (input.id === "hub-apk-upload") {
        const file = input.files?.[0];
        input.value = "";
        if (file) {
          try {
            await this.upload(file);
          } catch {}
        }
        return;
      }
      if (input.id === "hub-repackage-upload") {
        const file = input.files?.[0];
        input.value = "";
        if (file) {
          try {
            await this.uploadAndRepackage(file);
          } catch (error) {
            this.error = error.message || "Action failed";
            this.render();
          }
        }
        return;
      }
      if (input.matches("input[data-setting]")) {
        const key = input.dataset.setting;
        const value = input.checked;
        this.pendingSettings.set(key, { value, createdAt: Date.now() });
        try {
          await this.queueJob({ operation: "settings_update", settings: { [key]: value } }, text("settings"), { confirm: false });
          this.activeTab = "settings";
          this.render();
        } catch {
          this.pendingSettings.delete(key);
          this.render();
        }
      }
    }

    onInput(event) {
      if (event.target.id === "hub-output-package") this.universalPackage = event.target.value;
      if (event.target.id === "hub-probe-package") this.probePackage = event.target.value;
    }

    render() {
      if (this.destroyed) return;
      this.attach();
      const data = this.data || { controls: {}, uploads: [], jobs: [], online: false };
      const controls = data.controls || {};
      const features = controls.features || {};
      const capable = features.apk_uploads === true;
      const online = data.online === true;
      const jobs = data.jobs || [];
      const uploads = data.uploads || [];
      const tabs = ["overview", "apps", "apks", "jobs", "settings", "tools"];
      this.root.innerHTML = `
        <section class="hub-console" aria-label="${escapeHtml(text("title"))}">
          <header class="hub-console-head">
            <div>
              <span class="hub-kicker">LIBREMOTOR</span>
              <h1>${escapeHtml(text("title"))}</h1>
            </div>
            <div class="hub-head-actions">
              <span class="hub-connection ${online ? "online" : "offline"}"><i></i>${escapeHtml(online ? text("online") : text("offline"))}</span>
              <button class="hub-icon-button" type="button" data-action="refresh" title="${escapeHtml(text("refresh"))}" aria-label="${escapeHtml(text("refresh"))}">↻</button>
            </div>
          </header>
          <nav class="hub-tabs" aria-label="Hub sections">
            ${tabs.map((tab) => `<button type="button" data-tab="${tab}" class="${this.activeTab === tab ? "active" : ""}">${escapeHtml(text(tab))}</button>`).join("")}
          </nav>
          ${this.notice ? `<div class="hub-notice success">${escapeHtml(this.notice)}</div>` : ""}
          ${this.error ? `<div class="hub-notice error">${escapeHtml(this.error)}</div>` : ""}
          ${!capable ? `<div class="hub-notice warning">${escapeHtml(text("hubRequired"))}</div>` : ""}
          ${this.uploadProgress ? this.renderUploadProgress(this.uploadProgress) : ""}
          <div class="hub-console-body">
            ${this.activeTab === "overview" ? this.renderOverview(data, controls, uploads, jobs) : ""}
            ${this.activeTab === "apps" ? this.renderApps(controls, online && capable) : ""}
            ${this.activeTab === "apks" ? this.renderApks(uploads, online && capable) : ""}
            ${this.activeTab === "jobs" ? this.renderJobs(jobs) : ""}
            ${this.activeTab === "settings" ? this.renderSettings(controls, online && capable) : ""}
            ${this.activeTab === "tools" ? this.renderTools(controls, online && capable) : ""}
          </div>
          <footer class="hub-privacy">${escapeHtml(text("privacy"))}</footer>
        </section>
      `;
    }

    renderUploadProgress(progress) {
      const percent = Math.max(0, Math.min(100, Math.round(progress.current / progress.total * 100)));
      return `<div class="hub-upload-progress"><div><strong>${escapeHtml(progress.name)}</strong><span>${percent}% · ${formatBytes(progress.current)} / ${formatBytes(progress.total)}</span></div><progress max="100" value="${percent}">${percent}%</progress></div>`;
    }

    renderOverview(data, controls, uploads, jobs) {
      const latest = jobs[0];
      return `
        <div class="hub-summary-grid">
          ${this.summary(text("connected"), data.online ? text("online") : text("offline"), data.online ? "green" : "red")}
          ${this.summary(text("version"), controls.version_name || "--", "blue")}
          ${this.summary(text("uploadsLabel"), String(uploads.length), "amber")}
          ${this.summary(text("jobsLabel"), String(jobs.length), "violet")}
        </div>
        <section class="hub-band">
          <div class="hub-section-head"><div><span>${escapeHtml(text("jobActivity"))}</span><h2>${escapeHtml(latest ? operationLabel(latest.operation) : text("noJobs"))}</h2></div>${latest ? `<span class="hub-state ${escapeHtml(latest.status)}">${escapeHtml(friendlyStatus(latest.status))}</span>` : ""}</div>
          ${latest ? this.jobProgress(latest) : ""}
        </section>
        <div class="hub-quick-actions">
          ${this.actionButton("check-update", text("checkUpdate"), !data.online)}
          ${this.actionButton("refresh-sources", text("refreshSources"), !data.online)}
          ${this.actionButton("diagnostics", text("diagnostics"), !data.online)}
          ${this.actionButton("inventory", text("inventory"), !data.online)}
        </div>
      `;
    }

    summary(label, value, color) {
      return `<article class="hub-summary ${color}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
    }

    renderApps(controls, enabled) {
      const reported = new Map((controls.apps || []).map((app) => [app.id, app]));
      const rows = [
        ...MANAGED_APPS.map((id) => reported.get(id) || { id, label: appLabel(id), installed: false, version: "" }),
        reported.get("hub") || { id: "hub", label: "Libremotor Hub", installed: true, version: controls.version_name || "" },
      ];
      return `<div class="hub-app-list">${rows.map((app) => this.renderApp(app, enabled)).join("")}</div>`;
    }

    renderApp(app, enabled) {
      const managed = MANAGED_APPS.includes(app.id);
      return `
        <article class="hub-app-row">
          <div class="hub-app-mark">${escapeHtml(String(app.label || appLabel(app.id)).slice(0, 1).toUpperCase())}</div>
          <div class="hub-app-copy"><strong>${escapeHtml(app.label || appLabel(app.id))}</strong><span>${escapeHtml(app.installed ? text("installed") : text("notInstalled"))}${app.version ? ` · ${escapeHtml(app.version)}` : ""}</span></div>
          <div class="hub-app-actions">
            ${managed ? `<button type="button" data-action="managed-fetch" data-app-id="${escapeHtml(app.id)}" ${enabled ? "" : "disabled"}>${escapeHtml(text("fetchPatch"))}</button><button type="button" data-action="pick-managed" data-app-id="${escapeHtml(app.id)}" ${enabled ? "" : "disabled"}>${escapeHtml(text("uploadPatch"))}</button><input class="hub-file-input" type="file" accept=".apk,application/vnd.android.package-archive" data-managed-file="${escapeHtml(app.id)}" />` : ""}
            ${app.installed ? `<button class="secondary" type="button" data-action="launch" data-app-id="${escapeHtml(app.id)}" ${enabled ? "" : "disabled"}>${escapeHtml(text("launch"))}</button>` : ""}
            ${app.installed && app.id !== "hub" ? `<button class="danger" type="button" data-action="uninstall" data-app-id="${escapeHtml(app.id)}" ${enabled ? "" : "disabled"}>${escapeHtml(text("uninstall"))}</button>` : ""}
            ${app.id === "hub" ? `<button type="button" data-action="check-update" ${enabled ? "" : "disabled"}>${escapeHtml(text("checkUpdate"))}</button>${controlsUpdateButton(this.data?.controls, enabled)}` : ""}
          </div>
        </article>
      `;
    }

    renderApks(uploads, enabled) {
      return `
        <section class="hub-upload-zone">
          <div><span>${escapeHtml(text("uploadPrivate"))}</span><strong>${escapeHtml(text("uploadApk"))}</strong></div>
          <button type="button" data-action="pick-upload">${escapeHtml(text("uploadApk"))}</button>
          <input id="hub-apk-upload" class="hub-file-input" type="file" accept=".apk,application/vnd.android.package-archive" />
        </section>
        <div class="hub-upload-list">
          ${uploads.length ? uploads.map((upload) => this.renderUpload(upload, enabled)).join("") : `<div class="hub-empty">${escapeHtml(text("noUploads"))}</div>`}
        </div>
        <div class="hub-tool-grid">
          <section class="hub-tool-panel">
            <div class="hub-section-head"><div><span>APK</span><h2>${escapeHtml(text("universal"))}</h2></div></div>
            <label class="hub-field"><span>${escapeHtml(text("outputPackage"))}</span><input id="hub-output-package" value="${escapeHtml(this.universalPackage)}" autocomplete="off" spellcheck="false" placeholder="com.example.app" /></label>
            <button type="button" data-action="pick-repackage" ${enabled ? "" : "disabled"}>${escapeHtml(text("selectRepackage"))}</button>
            <input id="hub-repackage-upload" class="hub-file-input" type="file" accept=".apk,application/vnd.android.package-archive" />
          </section>
          <section class="hub-tool-panel">
            <div class="hub-section-head"><div><span>APK</span><h2>${escapeHtml(text("probe"))}</h2></div></div>
            <label class="hub-field"><span>${escapeHtml(text("outputPackage"))}</span><input id="hub-probe-package" value="${escapeHtml(this.probePackage)}" autocomplete="off" spellcheck="false" placeholder="com.example.probe" /></label>
            <button type="button" data-action="probe" ${enabled ? "" : "disabled"}>${escapeHtml(text("buildProbe"))}</button>
          </section>
        </div>
      `;
    }

    renderUpload(upload, enabled) {
      return `<article class="hub-upload-row"><div><strong>${escapeHtml(upload.file_name)}</strong><span>${formatBytes(upload.size_bytes)} · ${escapeHtml(friendlyStatus(upload.status))} · ${escapeHtml(formatTime(upload.updated_at))}</span></div><div><button type="button" data-action="raw-install" data-upload-id="${escapeHtml(upload.upload_id)}" ${enabled && ["ready", "consumed"].includes(upload.status) ? "" : "disabled"}>${escapeHtml(text("rawInstall"))}</button><button class="danger" type="button" data-action="delete-upload" data-upload-id="${escapeHtml(upload.upload_id)}">${escapeHtml(text("remove"))}</button></div></article>`;
    }

    renderJobs(jobs) {
      if (!jobs.length) return `<div class="hub-empty">${escapeHtml(text("noJobs"))}</div>`;
      return `<div class="hub-job-list">${jobs.map((job) => `<article class="hub-job-row"><div class="hub-job-head"><div><span>#${Number(job.id)} · ${escapeHtml(formatTime(job.updated_at))}</span><strong>${escapeHtml(operationLabel(job.operation, job.app_id))}</strong></div><span class="hub-state ${escapeHtml(job.status)}">${escapeHtml(friendlyStatus(job.status))}</span></div>${this.jobProgress(job)}${job.error ? `<div class="hub-job-error">${escapeHtml(job.error)}</div>` : ""}</article>`).join("")}</div>`;
    }

    jobProgress(job) {
      const current = Number(job.progress_current);
      const total = Number(job.progress_total);
      const percent = Number.isFinite(current) && Number.isFinite(total) && total > 0 ? Math.max(0, Math.min(100, Math.round(current / total * 100))) : null;
      return `<div class="hub-job-progress"><div><span>${escapeHtml(stageLabel(job.stage))}</span><strong>${percent == null ? escapeHtml(job.message || friendlyStatus(job.status)) : `${percent}%`}</strong></div><div class="hub-progress-track"><i style="width:${percent == null ? (job.status === "succeeded" ? 100 : job.status === "queued" ? 4 : 32) : percent}%"></i></div>${job.message && percent != null ? `<small>${escapeHtml(job.message)}</small>` : ""}</div>`;
    }

    renderSettings(controls, enabled) {
      const settings = controls.settings || {};
      const rows = [
        ["driver_camera_sharing_enabled", "driverCamera"],
        ["manager_auto_updates", "autoUpdates"],
        ["show_update_dialog", "updateDialog"],
        ["use_process_runtime", "processRuntime"],
        ["suggested_version_safeguard", "versionSafeguard"],
      ];
      return `<div class="hub-settings-list">${rows.map(([key, label]) => {
        const pending = this.pendingSettings.get(key);
        const value = pending ? pending.value : settings[key] === true;
        return `<label class="hub-setting ${pending ? "pending" : ""}"><span>${escapeHtml(text(label))}</span><input type="checkbox" data-setting="${key}" ${value ? "checked" : ""} ${enabled && !pending ? "" : "disabled"} /><i></i></label>`;
      }).join("")}</div>`;
    }

    renderTools(controls, enabled) {
      return `
        <div class="hub-tool-grid">
          <section class="hub-tool-panel"><div class="hub-section-head"><div><span>${escapeHtml(text("version"))}</span><h2>${escapeHtml(controls.version_name || "--")}</h2></div>${controls.update_available ? `<span class="hub-state queued">${escapeHtml(text("update"))}</span>` : ""}</div><div class="hub-button-row">${this.actionButton("check-update", text("checkUpdate"), !enabled)}${this.actionButton("install-update", text("installUpdate"), !enabled || !controls.update_available)}</div></section>
          <section class="hub-tool-panel"><div class="hub-section-head"><div><span>${escapeHtml(text("source"))}</span><h2>${escapeHtml(text("refreshSources"))}</h2></div></div>${this.actionButton("refresh-sources", text("refreshSources"), !enabled)}</section>
          <section class="hub-tool-panel"><div class="hub-section-head"><div><span>C10</span><h2>${escapeHtml(text("diagnostics"))}</h2></div></div>${this.actionButton("diagnostics", text("diagnostics"), !enabled)}</section>
          <section class="hub-tool-panel"><div class="hub-section-head"><div><span>DVR</span><h2>${escapeHtml(text("inventory"))}</h2></div></div>${this.actionButton("inventory", text("inventory"), !enabled)}</section>
        </div>
      `;
    }

    actionButton(action, label, disabled) {
      return `<button type="button" data-action="${action}" ${disabled ? "disabled" : ""}>${escapeHtml(label)}</button>`;
    }
  }

  function appLabel(id) {
    return { youtube: "YouTube", waze: "Waze", microg: "microG", zlink: "ZLink", hub: "Libremotor Hub" }[id] || id;
  }

  function operationLabel(operation, appId = "") {
    const labels = {
      install_apk: text("rawInstall"),
      patch_install: `${text("patchInstall")}${appId ? ` · ${appLabel(appId)}` : ""}`,
      repackage_install: text("universal"),
      probe_install: text("probe"),
      hub_update_check: text("checkUpdate"),
      hub_update_install: text("installUpdate"),
      sources_refresh: text("refreshSources"),
      inventory_refresh: text("inventory"),
      diagnostics_snapshot: text("diagnostics"),
      settings_update: text("settings"),
      app_launch: `${text("launch")}${appId ? ` · ${appLabel(appId)}` : ""}`,
      app_uninstall: `${text("uninstall")}${appId ? ` · ${appLabel(appId)}` : ""}`,
    };
    return labels[operation] || operation || text("jobs");
  }

  function stageLabel(stage) {
    const clean = String(stage || "").replaceAll("_", " ").replaceAll(".", " ");
    return clean ? clean.replace(/\b\w/g, (letter) => letter.toUpperCase()) : text("progress");
  }

  function controlsUpdateButton(controls, enabled) {
    return controls?.update_available
      ? `<button type="button" data-action="install-update" ${enabled ? "" : "disabled"}>${escapeHtml(text("installUpdate"))}</button>`
      : "";
  }

  function ensureMount() {
    mountScheduled = false;
    const screen = document.querySelector(".apps-screen");
    if (!screen) {
      if (controller) {
        controller.destroy();
        controller = null;
      }
      return;
    }
    if (controller && controller.screen === screen && controller.root.isConnected) {
      controller.attach();
      return;
    }
    if (controller) controller.destroy();
    controller = new HubControl(screen);
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    window.requestAnimationFrame(ensureMount);
  }

  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", scheduleMount, true);
  window.addEventListener("popstate", scheduleMount);
  scheduleMount();
})();
