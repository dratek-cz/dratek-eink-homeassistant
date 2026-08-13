const STATUS_LABELS = {
  queued: "Ve frontě",
  writing: "Zapisuje",
  succeeded: "Dokončeno",
  skipped: "Přeskočeno",
  failed: "Selhalo",
};

const STATUS_ICONS = {
  queued: "mdi:tray-arrow-down",
  writing: "mdi:progress-upload",
  succeeded: "mdi:check-circle-outline",
  skipped: "mdi:skip-next-circle-outline",
  failed: "mdi:alert-circle-outline",
};

const STATUS_PILLS = {
  queued: "muted",
  writing: "warn",
  succeeded: "good",
  skipped: "warn",
  failed: "bad",
};

const OPERATION_LABELS = {
  design: "Návrh",
  partial_design: "Částečný zápis",
  text: "Text",
  service_text: "HA služba",
  entity_update: "Změna entity",
};

const OPERATION_ICONS = {
  design: "mdi:palette-outline",
  partial_design: "mdi:square-edit-outline",
  text: "mdi:format-text",
  service_text: "mdi:cog-transfer-outline",
  entity_update: "mdi:sync",
};

// Klíč filtru -> vlastnost stavu panelu.
const FILTER_KEYS = {
  device: "_queueDeviceFilter",
  transport: "_queueTransportFilter",
  operation: "_queueOperationFilter",
  limit: "_queueLimit",
};

export const queueMixin = {


  async _loadQueue(render = true) {
    if (!this._hass) return;
    window.clearTimeout(this._queuePollTimer);
    const previousActive = new Set(
      (this._queue?.jobs || [])
        .filter((job) => ["queued", "writing"].includes(job.status))
        .map((job) => job.id)
    );
    try {
      this._queue = await this._hass.callWS({ type: "dratek_eink/queue/list" });
      const completedWrite = (this._queue?.jobs || []).some((job) =>
        previousActive.has(job.id) && job.status === "succeeded"
      );
      if (completedWrite && this._result?.devices?.length) {
        await this._loadDevicePreviewDrafts(this._result.devices);
      }
    } catch (err) {
      this._queue = {
        ...(this._queue || { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0 }),
        error: this._message(err),
      };
    }
    if (render) {
      this._renderQueueKeepingFocus();
    }
    if (Number(this._queue?.queued || 0) + Number(this._queue?.writing || 0) > 0 || this._activeTab === "automations") {
      this._queuePollTimer = window.setTimeout(() => {
        const visible = ["queue", "devices", "topology", "gateways", "automations"].includes(this._activeTab);
        this._loadQueue(visible);
      }, 1000);
    }
  },

  // Vlastní rozbalovací filtr. Nativní <select> tu nešel použít: fronta se
  // překresluje každou 1,5 s a otevřený systémový seznam se tím zavřel dřív,
  // než šlo kliknout. Navíc jeho položky nejdou nastylovat.
  _renderQueueMenu(key, label, icon, current, options) {
    const open = this._queueOpenMenu === key;
    const selected = options.find((option) => String(option.value) === String(current)) || options[0];
    const filtering = String(selected.value) !== "all" && key !== "limit";
    return `<div class="queue-filter ${filtering ? "is-active" : ""} ${open ? "is-open" : ""}">
      <button class="queue-select" data-queue-menu="${key}" aria-haspopup="listbox" aria-expanded="${open ? "true" : "false"}" title="${this._escape(label)}">
        <ha-icon class="queue-select-icon" icon="${icon}"></ha-icon>
        <span>${this._escape(selected.label)}</span>
        <ha-icon class="queue-select-caret" icon="mdi:chevron-down"></ha-icon>
      </button>
      <div class="queue-menu" role="listbox" aria-label="${this._escape(label)}" ${open ? "" : "hidden"}>
        <div class="queue-menu-title">${this._escape(label)}</div>
        ${options.map((option) => {
          const active = String(option.value) === String(selected.value);
          return `<button class="queue-menu-item ${active ? "active" : ""}" role="option" aria-selected="${active ? "true" : "false"}" data-queue-filter="${key}" data-queue-value="${this._escape(String(option.value))}">
            <ha-icon icon="${option.icon}"></ha-icon><span>${this._escape(option.label)}</span>${active ? `<ha-icon class="queue-menu-check" icon="mdi:check"></ha-icon>` : ""}
          </button>`;
        }).join("")}
      </div>
    </div>`;
  },

  _setQueueFilter(key, value) {
    const property = FILTER_KEYS[key];
    if (!property) return;
    this[property] = key === "limit" ? Number(value) : value;
    this._queueOpenMenu = "";
    this._render();
    this._paint();
  },

  _toggleQueueMenu(key) {
    this._queueOpenMenu = this._queueOpenMenu === key ? "" : key;
    this._render();
    this._paint();
  },

  // Fronta se překresluje každou sekundu. _render() vymění celý shadow strom,
  // takže bez tohohle by psaní do hledání po pár znacích ztratilo fokus.
  _renderQueueKeepingFocus() {
    // Otevřenou nabídku by pravidelné překreslení zavřelo pod rukama. Data už
    // jsou uložená, seznam se dorovná při prvním dalším překreslení.
    if (this._queueOpenMenu) return;
    const openLogs = new Set(
      [...this.shadowRoot.querySelectorAll("details[data-queue-log][open]")]
        .map((details) => details.dataset.queueLog)
    );
    this._renderKeepingSearchFocus();
    this.shadowRoot.querySelectorAll("details[data-queue-log]").forEach((details) => {
      details.open = openLogs.has(details.dataset.queueLog);
    });
  },

  _renderKeepingSearchFocus() {
    const active = this.shadowRoot.activeElement;
    const searchIds = new Set(["deviceSearch", "queueSearch", "symbolSearch", "displayTemplateSearch"]);
    const activeId = searchIds.has(active?.id) ? active.id : "";
    const selectionStart = activeId ? active.selectionStart : null;
    const selectionEnd = activeId ? active.selectionEnd : null;
    const selectionDirection = activeId ? active.selectionDirection : "none";
    this._render();
    this._paint();
    if (!activeId) return;
    const next = this.shadowRoot.querySelector(`#${activeId}`);
    if (!next) return;
    next.focus({ preventScroll: true });
    try {
      next.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    } catch (_err) {
      // Některé typy inputu neumí rozsah výběru, samotný fokus stačí.
    }
  },

  _queueFilters() {
    return {
      search: (this._queueSearch || "").trim().toLowerCase(),
      status: this._queueStatusFilter || "all",
      device: this._queueDeviceFilter || "all",
      transport: this._queueTransportFilter || "all",
      operation: this._queueOperationFilter || "all",
      limit: Number(this._queueLimit === undefined ? 50 : this._queueLimit),
    };
  },

  _queueFiltersActive() {
    const { search, status, device, transport, operation } = this._queueFilters();
    return Boolean(search) || status !== "all" || device !== "all" || transport !== "all" || operation !== "all";
  },

  _matchingQueueJobs(jobs, filters) {
    return jobs.filter((job) => {
      if (filters.status !== "all" && job.status !== filters.status) return false;
      if (filters.device !== "all" && String(job.address || "").toUpperCase() !== filters.device.toUpperCase()) return false;
      if (filters.transport !== "all" && String(job.transport_type || "local") !== filters.transport) return false;
      if (filters.operation !== "all" && String(job.operation || "") !== filters.operation) return false;
      if (filters.search) {
        // Řádek ukazuje pojmenování displeje, takže se podle něj musí dát i hledat.
        const label = OPERATION_LABELS[job.operation] || "";
        const text = `${this._queueDeviceLabel(String(job.address || "").toUpperCase())} ${job.operation} ${label} ${job.transport_name} ${job.error || ""} ${job.log ? job.log.join(" ") : ""}`.toLowerCase();
        if (!text.includes(filters.search)) return false;
      }
      return true;
    });
  },

  _renderQueue() {
    const queue = this._queue || { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0, skipped: 0, skipped_reasons: [], skipped_devices: [] };
    const allJobs = queue.jobs || [];
    const filters = this._queueFilters();
    const filtersActive = this._queueFiltersActive();

    const filteredJobs = this._matchingQueueJobs(allJobs, filters);
    const displayedJobs = filters.limit > 0 ? filteredJobs.slice(0, filters.limit) : filteredJobs;

    const deviceAddresses = [...new Set(allJobs.map((job) => String(job.address || "").toUpperCase()))].filter(Boolean).sort();
    const operations = [...new Set(allJobs.map((job) => String(job.operation || "")))].filter(Boolean).sort();

    // Metriky jsou zároveň filtr stavu - proto už pod hledáním nejsou žádné
    // čipy se stejnými stavy, jen zbylé filtry.
    // Barvu nese stav, ne jeho počet. Nulová dlaždice se jen ztlumí, takže
    // prázdná fronta nesvítí pěti barvami a plná je čitelná na první pohled.
    const stat = (status, icon, value, label, cls = "") => `
      <button class="stat-tile ${filters.status === status ? "active" : ""} ${cls} ${Number(value || 0) ? "" : "is-zero"}" data-queue-status="${status}" title="Zobrazit jen ${label.toLowerCase()}">
        <span class="stat-tile-icon"><ha-icon icon="${icon}"></ha-icon></span>
        <span class="stat-tile-copy"><strong>${value || 0}</strong><small>${label}</small></span>
      </button>`;

    return `
    <div class="queue-page">
      <div class="queue-controls-locked">
        <div class="stat-tiles">
          ${stat("queued", "mdi:tray-full", queue.queued, "Ve frontě")}
          ${stat("writing", "mdi:progress-upload", queue.writing, "Zapisuje", "is-warn")}
          ${stat("succeeded", "mdi:check-circle-outline", queue.succeeded, "Dokončeno", "is-good")}
          ${stat("skipped", "mdi:skip-next-circle-outline", queue.skipped, "Přeskočeno", "is-skipped")}
          ${stat("failed", "mdi:alert-circle-outline", queue.failed, "Selhalo", "is-bad")}
        </div>

        <div class="card devices-toolbar-card">
          <div class="devices-toolbar">
          <div class="device-search"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" id="queueSearch" placeholder="Hledat displej, trasu nebo chybu..." value="${this._escape(this._queueSearch || "")}"></div>
          <button id="resetQueueView" class="reset-icon-btn" title="Zrušit hledání i filtry a obnovit"><ha-icon icon="mdi:refresh"></ha-icon></button>
          <div class="queue-filter-row">
            ${this._renderQueueMenu("device", "Displej", "mdi:tablet-dashboard", filters.device, [
              { value: "all", label: "Všechny displeje", icon: "mdi:select-all" },
              ...deviceAddresses.map((addr) => ({ value: addr, label: this._queueDeviceLabel(addr), icon: "mdi:tablet-dashboard" })),
            ])}
            ${this._renderQueueMenu("transport", "Trasa", "mdi:transit-connection-variant", filters.transport, [
              { value: "all", label: "Všechny trasy", icon: "mdi:select-all" },
              { value: "gateway", label: "DRATEK gateway", icon: "mdi:router-wireless" },
              { value: "local", label: "Home Assistant Bluetooth", icon: "mdi:home-assistant" },
            ])}
            ${this._renderQueueMenu("operation", "Operace", "mdi:cog-outline", filters.operation, [
              { value: "all", label: "Všechny operace", icon: "mdi:select-all" },
              ...operations.map((operation) => ({ value: operation, label: OPERATION_LABELS[operation] || operation, icon: OPERATION_ICONS[operation] || "mdi:cog-outline" })),
            ])}
            ${this._renderQueueMenu("limit", "Počet", "mdi:format-list-numbered", String(filters.limit), [
              { value: "20", label: "20 položek", icon: "mdi:numeric" },
              { value: "50", label: "50 položek", icon: "mdi:numeric" },
              { value: "100", label: "100 položek", icon: "mdi:numeric" },
              { value: "0", label: "Bez omezení", icon: "mdi:infinity" },
            ])}
          </div>
          <div class="devices-toolbar-spacer"></div>
          <button id="exportQueueLog" class="secondary" style="margin-right: 8px;"><ha-icon icon="mdi:download-outline"></ha-icon>Stáhnout protokol</button>
          <button id="clearQueueHistory" class="danger"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Vyčistit historii</button>
          </div>
        </div>
      </div>

      <div class="card queue-list-card">
        <div class="section-title">
          <div>
            <h2>Fronta a historie zápisů</h2>
            <small>Zobrazeno ${displayedJobs.length} z ${filteredJobs.length} odpovídajících záznamů · ${allJobs.length} celkem v paměti · backend v${this._escape(queue.backend_version || "starší")}</small>
          </div>
          ${filtersActive ? `<button id="clearQueueFilters" class="secondary"><ha-icon icon="mdi:filter-remove-outline"></ha-icon>Zrušit filtry</button>` : ""}
        </div>

        ${queue.error ? `<div class="pill bad">${this._escape(queue.error)}</div>` : ""}

        ${displayedJobs.length ? `<div class="queue-list">${displayedJobs.map((job) => this._renderQueueJob(job)).join("")}</div>` : `
          <div class="inspector-empty">
            <ha-icon icon="${filtersActive ? "mdi:filter-remove-outline" : "mdi:tray"}"></ha-icon>
            <p>${filtersActive ? "Žádný záznam neodpovídá zvolenému hledání a filtrům." : "Fronta je prázdná. Jakmile se začne zapisovat na displej, objeví se tu záznam."}</p>
          </div>`}
      </div>
    </div>`;
  },

  _exportQueueLog() {
    const jobs = this._queue?.jobs || [];
    if (!jobs.length) {
      alert("Fronta je prázdná.");
      return;
    }
    const lines = [
      "=== DRATEK eInk Transfer Queue Log Dump ===",
      `Exported: ${new Date().toLocaleString()}`,
      `Backend Version: v${this._queue?.backend_version || "unknown"}`,
      `Total Jobs: ${jobs.length}`,
      "===========================================\n",
    ];
    for (const job of jobs) {
      const created = job.created_at ? new Date(job.created_at * 1000).toLocaleString() : "Unknown";
      const finished = job.finished_at ? new Date(job.finished_at * 1000).toLocaleString() : (job.started_at ? "Running" : "Queued");
      lines.push(`--- JOB ${job.id} ---`);
      lines.push(`Address: ${job.address}`);
      lines.push(`Operation: ${job.operation}`);
      lines.push(`Transport: ${job.transport_name || job.transport_type}`);
      lines.push(`Status: ${job.status}`);
      lines.push(`Created: ${created}`);
      lines.push(`Finished: ${finished}`);
      if (job.error) lines.push(`Error: ${job.error}`);
      const logLines = Array.isArray(job.log) ? job.log : [];
      if (logLines.length) {
        lines.push(`Log trace (${logLines.length} lines):`);
        for (const line of logLines) {
          lines.push(`  ${line}`);
        }
      }
      lines.push("");
    }
    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dratek_eink_queue_log_${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  },

  _queueDeviceLabel(address) {
    const device = (this._result?.devices || []).find((item) => String(item.address || "").toUpperCase() === address);
    const name = device ? this._deviceTitle(device) : "";
    return name && name !== address ? `${name} · ${address}` : address;
  },

  _renderQueueJob(job) {
    const status = String(job.status || "");
    const address = String(job.address || "").toUpperCase();
    const device = (this._result?.devices || []).find((item) => String(item.address || "").toUpperCase() === address);
    const operation = OPERATION_LABELS[job.operation] || job.operation;
    const gateway = job.transport_type === "gateway";
    const logLines = Array.isArray(job.log) ? job.log : [];
    const logText = logLines.length ? logLines.slice(-3).join(" | ") : "";
    return `<article class="queue-row ${this._escape(status)}">
      <span class="queue-icon"><ha-icon icon="${STATUS_ICONS[status] || "mdi:help"}"></ha-icon></span>
      <div class="queue-main">
        <strong>${this._escape(device ? this._deviceTitle(device) : address)}</strong>
        <small>${this._escape(address)} · ${this._escape(operation)}</small>
      </div>
      <div class="queue-route">
        <span class="queue-route-icon"><ha-icon icon="${gateway ? "mdi:router-wireless" : "mdi:home-assistant"}"></ha-icon></span>
        <div><strong>${this._escape(job.transport_name || (gateway ? "DRATEK gateway" : "Home Assistant"))}</strong>${job.transport_name ? `<small>${gateway ? "DRATEK gateway" : "Home Assistant Bluetooth"}</small>` : ""}</div>
      </div>
      <div class="queue-timing">
        <small>${this._formatTime(job.created_at)}</small>
        ${job.finished_at ? `<small class="queue-duration"><ha-icon icon="mdi:timer-outline"></ha-icon>${this._formatDuration(job.started_at, job.finished_at)}</small>` : ""}
      </div>
      <div class="queue-row-end">
        <span class="pill ${STATUS_PILLS[status] || "muted"}">${STATUS_LABELS[status] || this._escape(status)}</span>
        ${status === "queued" ? `<button type="button" class="tile-icon-btn queue-cancel-btn" data-cancel-queue-job="${this._escape(job.id || "")}" title="Zrušit frontu"><ha-icon icon="mdi:close-circle-outline"></ha-icon></button>` : ""}
      </div>
      ${(job.error || logText) ? `<div class="queue-row-log">${this._escape(job.error || logText)}</div>` : ""}
      ${logLines.length ? `<details class="queue-row-details" data-queue-log="${this._escape(job.id || "")}">
        <summary><ha-icon icon="mdi:text-box-search-outline"></ha-icon>Zobrazit celý protokol (${logLines.length} řádků)</summary>
        <pre>${this._escape(logLines.join("\n"))}</pre>
      </details>` : ""}
    </article>`;
  },
};
