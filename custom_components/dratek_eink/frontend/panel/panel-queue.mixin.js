export const queueMixin = {


  async _loadQueue(render = true) {
    if (!this._hass) return;
    try {
      this._queue = await this._hass.callWS({ type: "dratek_eink/queue/list" });
    } catch (err) {
      this._queue = { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0, error: this._message(err) };
    }
    if (render) {
      this._render();
      this._paint();
    }
    window.clearTimeout(this._queuePollTimer);
    if (["queue", "devices", "topology"].includes(this._activeTab)) {
      this._queuePollTimer = window.setTimeout(() => this._loadQueue(true), 1500);
    }
  },

  _renderQueue() {
    const queue = this._queue || { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0, skipped: 0, skipped_reasons: [], skipped_devices: [] };
    const allJobs = queue.jobs || [];
    const skippedReasons = queue.skipped_reasons || [];
    const skippedDevices = queue.skipped_devices || [];

    const searchQuery = (this._queueSearch || "").trim().toLowerCase();
    const statusFilter = this._queueStatusFilter || "all";
    const deviceFilter = this._queueDeviceFilter || "all";

    const filteredJobs = allJobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (deviceFilter !== "all" && String(job.address || "").toUpperCase() !== deviceFilter.toUpperCase()) return false;
      if (searchQuery) {
        const text = `${job.address} ${job.operation} ${job.transport_name} ${job.error || ""} ${job.log ? job.log.join(" ") : ""}`.toLowerCase();
        if (!text.includes(searchQuery)) return false;
      }
      return true;
    });

    const limit = Number(this._queueLimit === undefined ? 50 : this._queueLimit);
    const displayedJobs = limit > 0 ? filteredJobs.slice(0, limit) : filteredJobs;

    const stat = (icon, value, label, cls = "") => `
      <div class="card queue-stat">
        <ha-icon icon="${icon}"></ha-icon>
        <div><strong class="${cls}">${value || 0}</strong><span>${label}</span></div>
      </div>`;

    const devicesList = [...new Set(allJobs.map((j) => String(j.address || "").toUpperCase()))].sort();

    const skipWarningBanner = (queue.skipped > 0 || skippedReasons.length > 0) ? `
      <div class="card queue-skip-warning">
        <div class="warning-header">
          <ha-icon icon="mdi:alert-decagram-outline"></ha-icon>
          <div>
            <strong>Upozornění: Některé automatické zápisy byly přeskočeny (${queue.skipped})</strong>
            <small>K přeskočení dochází, pokud je interval zjišťování stavů kratší než doba zápisu na displej nebo při upřednostnění ručního zápisu z editoru.</small>
          </div>
        </div>
        ${skippedReasons.length ? `<div class="warning-reasons"><strong>Důvody přeskočení:</strong><ul>${skippedReasons.map((reason) => `<li>${this._escape(reason)}</li>`).join("")}</ul></div>` : ""}
        ${skippedDevices.length ? `<div class="warning-devices"><strong>Zasažené displeje:</strong> ${skippedDevices.map((addr) => `<span class="pill muted">${this._escape(addr)}</span>`).join(" ")}</div>` : ""}
        <div class="warning-tip"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon><strong>Tip:</strong> Zkraťte interval nahrávání v hlavním záhlaví (např. na 10 s nebo 15 s) nebo prodlužte interval odesílání v automatizaci.</div>
      </div>` : "";

    return `
    <style>
      .queue-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px; }
      .queue-stat { display: flex; align-items: center; gap: 10px; padding: 12px; }
      .queue-stat ha-icon { --mdc-icon-size: 28px; color: var(--dratek-teal); }
      .queue-stat strong { font-size: 20px; display: block; }
      .queue-stat span { font-size: 10px; color: var(--secondary-text-color); display: block; }
      .queue-stat .warn-signal { color: var(--dratek-orange); }
      .queue-stat .good-signal { color: #16803c; }
      .queue-stat .bad-signal { color: #c62828; }
      .queue-stat .skipped-signal { color: #d97706; }

      .queue-skip-warning { padding: 14px; margin-bottom: 14px; border: 1px solid rgba(217, 119, 6, 0.4); background: rgba(217, 119, 6, 0.07); border-radius: 12px; }
      .warning-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; color: #b45309; }
      .warning-header ha-icon { --mdc-icon-size: 28px; }
      .warning-header strong { font-size: 13px; display: block; }
      .warning-header small { font-size: 10px; color: var(--secondary-text-color); display: block; margin-top: 2px; }
      .warning-reasons { margin: 8px 0; font-size: 11px; }
      .warning-reasons ul { margin: 4px 0 0 16px; padding: 0; }
      .warning-devices { margin: 6px 0; font-size: 11px; }
      .warning-tip { display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 8px; background: var(--card-background-color); border-radius: 8px; font-size: 10px; }

      .queue-controls-bar { display: grid; grid-template-columns: minmax(180px, 1fr) auto auto auto auto auto; gap: 8px; align-items: center; margin-bottom: 12px; }
      .queue-controls-bar input, .queue-controls-bar select { padding: 7px 9px; font-size: 11px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
      .queue-row { display: grid; grid-template-columns: 36px minmax(130px, 1fr) minmax(130px, 1fr) auto auto; gap: 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--divider-color); font-size: 11px; }
      .queue-row:last-child { border-bottom: 0; }
      .queue-row.writing { background: rgba(255, 102, 0, 0.05); }
      .queue-row.skipped { opacity: 0.85; background: rgba(217, 119, 6, 0.04); }
      .queue-row.failed { background: rgba(198, 40, 40, 0.05); }
      .queue-row .queue-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: var(--secondary-background-color); color: var(--dratek-teal); }
      .queue-row.writing .queue-icon { color: var(--dratek-orange); }
      .queue-row.failed .queue-icon { color: #c62828; }
      .queue-row.skipped .queue-icon { color: #d97706; }
      .queue-meta-info { font-size: 10px; color: var(--secondary-text-color); margin-top: 2px; }
      .queue-row-log { grid-column: 1 / -1; margin-top: 4px; padding: 6px 9px; font-family: monospace; font-size: 9px; border-radius: 6px; background: var(--secondary-background-color); color: var(--secondary-text-color); max-height: 80px; overflow-y: auto; }
      @media(max-width:900px) { .queue-summary { grid-template-columns: repeat(3, 1fr); } .queue-controls-bar { grid-template-columns: 1fr 1fr; } }
    </style>

    <div class="queue-summary">
      ${stat("mdi:tray-full", queue.queued, "Ve frontě")}
      ${stat("mdi:progress-upload", queue.writing, "Zapisuje", queue.writing ? "warn-signal" : "")}
      ${stat("mdi:check-circle-outline", queue.succeeded, "Dokončeno", "good-signal")}
      ${stat("mdi:skip-next-circle-outline", queue.skipped, "Přeskočeno", queue.skipped ? "skipped-signal" : "")}
      ${stat("mdi:alert-circle-outline", queue.failed, "Selhalo", queue.failed ? "bad-signal" : "")}
    </div>

    ${skipWarningBanner}

    <div class="card">
      <div class="section-title">
        <div>
          <h2>Fronta a historie zápisů</h2>
          <small>Zobrazeno ${displayedJobs.length} z celkem ${filteredJobs.length} záznamů (${allJobs.length} celkem v paměti)</small>
        </div>
      </div>

      <div class="queue-controls-bar">
        <input id="queueSearch" value="${this._escape(this._queueSearch || "")}" placeholder="Hledat MAC, zařízení, chybu...">
        <select id="queueStatusFilter" title="Filtr stavu">
          <option value="all" ${statusFilter === "all" ? "selected" : ""}>Všechny stavy</option>
          <option value="writing" ${statusFilter === "writing" ? "selected" : ""}>Zapisuje</option>
          <option value="queued" ${statusFilter === "queued" ? "selected" : ""}>Ve frontě</option>
          <option value="succeeded" ${statusFilter === "succeeded" ? "selected" : ""}>Dokončeno</option>
          <option value="skipped" ${statusFilter === "skipped" ? "selected" : ""}>Přeskočeno</option>
          <option value="failed" ${statusFilter === "failed" ? "selected" : ""}>Selhalo</option>
        </select>
        <select id="queueDeviceFilter" title="Filtr zařízení">
          <option value="all" ${deviceFilter === "all" ? "selected" : ""}>Všechna zařízení</option>
          ${devicesList.map((addr) => `<option value="${this._escape(addr)}" ${deviceFilter.toUpperCase() === addr ? "selected" : ""}>${this._escape(addr)}</option>`).join("")}
        </select>
        <select id="queueLimit" title="Počet položek">
          <option value="20" ${limit === 20 ? "selected" : ""}>20 položek</option>
          <option value="50" ${limit === 50 ? "selected" : ""}>50 položek</option>
          <option value="100" ${limit === 100 ? "selected" : ""}>100 položek</option>
          <option value="0" ${limit === 0 ? "selected" : ""}>Všechny položky</option>
        </select>
        <button id="clearQueueHistory" class="secondary icon-btn" title="Vyčistit historii zápisů"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon></button>
        <button id="refreshQueue" class="secondary"><ha-icon icon="mdi:refresh"></ha-icon>Obnovit</button>
      </div>

      ${queue.error ? `<div class="pill bad">${this._escape(queue.error)}</div>` : ""}

      ${displayedJobs.length ? `
        <div class="queue-list">
          ${displayedJobs.map((job) => {
      const labels = { queued: "Ve frontě", writing: "Zapisuji", succeeded: "Dokončeno", failed: "Selhalo", skipped: "Přeskočeno" };
      const classes = { queued: "muted", writing: "warn", succeeded: "good", failed: "bad", skipped: "warn" };
      const icons = { queued: "mdi:tray-arrow-down", writing: "mdi:progress-upload", succeeded: "mdi:check", failed: "mdi:alert-circle-outline", skipped: "mdi:skip-next-circle-outline" };
      const operation = { design: "Návrh", partial_design: "Částečný zápis", text: "Text", service_text: "HA služba", entity_update: "Změna entity" }[job.operation] || job.operation;
      const logText = Array.isArray(job.log) && job.log.length ? job.log.slice(-3).join(" | ") : "";
      return `
            <div class="queue-row ${this._escape(job.status)}">
              <div class="queue-icon"><ha-icon icon="${icons[job.status] || "mdi:help"}"></ha-icon></div>
              <div class="queue-main">
                <strong>${this._escape(job.address)}</strong>
                <div class="queue-meta-info">${this._escape(operation)} · ${this._formatTime(job.created_at)}</div>
              </div>
              <div class="queue-route">
                <strong>${this._escape(job.transport_name)}</strong>
                <div class="queue-meta-info">${job.transport_type === "gateway" ? "DRATEK gateway" : "Home Assistant BLE"}</div>
              </div>
              <span class="pill ${classes[job.status] || "muted"}">${labels[job.status] || this._escape(job.status)}</span>
              <div>${job.finished_at ? `<span class="pill muted">${this._formatDuration(job.started_at, job.finished_at)}</span>` : ""}</div>
              ${(job.error || logText) ? `<div class="queue-row-log">${this._escape(job.error || logText)}</div>` : ""}
            </div>`;
    }).join("")}
        </div>` : `
        <div class="inspector-empty">
          <ha-icon icon="mdi:tray"></ha-icon>
          <p>${searchQuery || statusFilter !== "all" || deviceFilter !== "all" ? "Žádný záznam neodpovídá zvolenému vyhledávání a filtrům." : "Fronta je prázdná."}</p>
        </div>`}
    </div>`;
  },
};
