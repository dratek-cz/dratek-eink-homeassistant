export const automationsMixin = {
  async _loadAutomations(render = true) {
    if (!this._hass || this._automationsLoading) return;
    this._automationsLoading = true;
    this._automationsError = "";
    if (render) this._render();
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/automations/list" });
      this._automations = Array.isArray(result?.automations) ? result.automations : [];
    } catch (err) {
      this._automationsError = this._message(err);
    } finally {
      this._automationsLoading = false;
      if (render) {
        this._render();
        this._paint();
      }
    }
  },

  _automationDevice(address) {
    const normalized = String(address || "").toUpperCase();
    return (this._result?.devices || []).find(
      (device) => String(device.address || "").toUpperCase() === normalized
    );
  },

  _automationIntervalSelect(automation) {
    const seconds = Math.max(30, Math.min(86400, Number(automation.refresh_interval_seconds) || 600));
    const presets = [
      [30, "30 s"], [60, "1 min"], [300, "5 min"], [600, "10 min"],
      [900, "15 min"], [1800, "30 min"], [3600, "1 hod"], [7200, "2 hod"],
      [21600, "6 hod"], [43200, "12 hod"], [86400, "24 hod"],
    ];
    return `<label class="automation-interval-field"><span>Interval obnovy</span><div><ha-icon icon="mdi:timer-cog-outline"></ha-icon><select aria-label="Interval automatického zápisu" data-automation-interval="${this._escape(automation.address)}" ${this._automationBusyAddress === automation.address ? "disabled" : ""}>${presets.map(([value, label]) => `<option value="${value}" ${seconds === value ? "selected" : ""}>Každých ${label}</option>`).join("")}</select><ha-icon class="automation-select-chevron" icon="mdi:chevron-down"></ha-icon></div></label>`;
  },

  _automationIntervalLabel(automation) {
    const seconds = Math.max(30, Math.min(86400, Number(automation.refresh_interval_seconds) || 600));
    if (seconds < 60) return `${seconds} sekund`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${Math.round(seconds / 3600)} hod`;
  },

  _automationTriggerLabel(mode) {
    return ({
      both: "Při změně entity i pravidelně",
      change_only: "Jen při změně entity",
      interval_only: "Jen pravidelně podle intervalu",
    })[mode] || "Při změně entity i pravidelně";
  },

  _automationTriggerSelect(automation) {
    const mode = ["both", "change_only", "interval_only"].includes(automation.refresh_trigger_mode)
      ? automation.refresh_trigger_mode
      : "interval_only";
    const options = [
      ["both", "Při změně i pravidelně"],
      ["change_only", "Jen při změně entity"],
      ["interval_only", "Jen pravidelně (podle intervalu)"],
    ];
    return `<label class="automation-interval-field"><span>Co spouští obnovu</span><div><ha-icon icon="mdi:swap-horizontal"></ha-icon><select aria-label="Co spouští automatickou obnovu" data-automation-trigger="${this._escape(automation.address)}" ${this._automationBusyAddress === automation.address ? "disabled" : ""}>${options.map(([value, label]) => `<option value="${value}" ${mode === value ? "selected" : ""}>${label}</option>`).join("")}</select><ha-icon class="automation-select-chevron" icon="mdi:chevron-down"></ha-icon></div></label>`;
  },

  _renderAutomationCountdown(automation, isWriting = false) {
    if (automation.enabled === false) return "";
    const interval = Math.max(10, Number(automation.refresh_interval_seconds) || 600);
    const nextTime = Number(automation.next_refresh_time) * 1000 || 0;
    const now = Date.now();
    let remainingSec = 0;
    if (nextTime > now) {
      remainingSec = Math.round((nextTime - now) / 1000);
    } else if (Number.isFinite(automation.remaining_seconds)) {
      remainingSec = Math.max(0, Number(automation.remaining_seconds));
    }
    const percent = Math.max(0, Math.min(100, Math.round((remainingSec / interval) * 100)));
    const tone = percent > 50 ? "good" : percent > 20 ? "warn" : "critical";

    return `<div class="automation-countdown-widget ${isWriting ? "is-writing" : ""} tone-${tone}" data-automation-countdown="${this._escape(automation.address)}" data-next-time="${nextTime}" data-interval="${interval}">
      <div class="automation-countdown-header">
        <span class="countdown-badge"><ha-icon icon="${isWriting ? "mdi:progress-upload" : "mdi:clock-fast"}"></ha-icon>${isWriting ? "Probíhá nahrávání..." : "Další nahrátí za"}</span>
        <strong class="countdown-digital">${isWriting ? "Zápis" : this._formatCountdownTime(remainingSec)}</strong>
      </div>
      <div class="automation-progress-track">
        <div class="automation-progress-fill" style="width: ${isWriting ? 100 : percent}%;"></div>
      </div>
    </div>`;
  },

  _renderAutomations() {
    const automations = this._automations || [];
    const writingAddresses = new Set(
      (this._queue?.jobs || [])
        .filter((job) => job.status === "writing" && job.operation === "entity_update")
        .map((job) => String(job.address || "").toUpperCase()),
    );
    const entityCount = automations.reduce(
      (total, item) => total + Math.max(
        Array.isArray(item.entity_ids) ? item.entity_ids.length : 0,
        Number(item.binding_count || 0),
      ),
      0,
    );
    const gatewayCount = automations.filter((item) => item.route_type === "gateway").length;
    const activeCount = automations.filter((item) => item.enabled !== false).length;
    const stat = (icon, value, label, cls = "") => `<div class="stat-tile ${cls} ${Number(value || 0) ? "" : "is-zero"}"><span class="stat-tile-icon"><ha-icon icon="${icon}"></ha-icon></span><span class="stat-tile-copy"><strong>${value || 0}</strong><small>${label}</small></span></div>`;
    const status = this._automationsError
      ? `<div class="automation-notice bad"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${this._escape(this._automationsError)}</div>`
      : this._automationsResult
        ? `<div class="automation-notice good"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${this._escape(this._automationsResult)}</div>`
        : "";
    if (this._automationsLoading && !automations.length) {
      return `<div class="card automation-empty"><ha-icon class="spin" icon="mdi:loading"></ha-icon><h2>Načítám automatické zápisy</h2></div>`;
    }
    const cards = automations.map((automation, index) => {
      const device = this._automationDevice(automation.address);
      const name = device?.display_name || device?.name || "eInk displej";
      const entities = Array.isArray(automation.entity_ids) ? automation.entity_ids : [];
      const bindings = Math.max(entities.length, Number(automation.binding_count || 0));
      const cycleImages = Math.max(0, Number(automation.image_cycle_count || 0));
      const templates = Array.isArray(automation.template_ids) ? automation.template_ids.length : 0;
      const route = automation.transport_name
        || (automation.route_type === "gateway" ? "DRATEK eInk gateway" : "Home Assistant Bluetooth");
      const viaGateway = automation.route_type === "gateway";
      const triggerIcon = automation.refresh_trigger_mode === "change_only"
        ? "mdi:lightning-bolt-outline"
        : automation.refresh_trigger_mode === "interval_only"
          ? "mdi:clock-outline"
          : "mdi:sync";
      const busy = this._automationBusyAddress === automation.address;
      const writing = writingAddresses.has(String(automation.address || "").toUpperCase());
      const enabled = automation.enabled !== false;
      return `<article class="automation-card ${busy ? "is-busy" : ""} ${writing ? "is-writing" : ""} ${enabled ? "" : "is-paused"}">
        <span class="automation-card-accent"></span>
        ${busy ? `<span class="automation-card-working"><ha-icon class="spin" icon="mdi:loading"></ha-icon>Ukládám změnu</span>` : ""}
        <header class="automation-card-head">
          <div class="automation-card-title"><span class="automation-card-kicker">Automatický zápis ${String(index + 1).padStart(2, "0")}</span><strong>${this._escape(name)}</strong><small>${this._escape(automation.address)}</small></div>
          <span class="automation-head-state">${writing ? `<span class="automation-live is-writing"><ha-icon icon="mdi:progress-upload"></ha-icon>Právě zapisuje</span>` : ""}<button type="button" class="automation-power ${enabled ? "is-on" : "is-off"}" data-automation-enabled="${this._escape(automation.address)}" data-automation-next-enabled="${enabled ? "0" : "1"}" aria-pressed="${enabled ? "true" : "false"}" title="${enabled ? "Pozastavit automatické aktualizace" : "Zapnout automatické aktualizace"}" ${busy ? "disabled" : ""}><ha-icon icon="mdi:${enabled ? "toggle-switch" : "toggle-switch-off-outline"}"></ha-icon><span>${enabled ? "ON" : "OFF"}</span></button></span>
        </header>
        <section class="automation-card-overview">
          <div class="automation-display-preview">${device ? this._renderDevicePreview(device, "mini") : `<span class="automation-preview-missing"><ha-icon icon="mdi:monitor-off"></ha-icon></span>`}</div>
          <span class="automation-schedule-copy"><small>Nastavený interval</small><strong>Každých ${this._escape(this._automationIntervalLabel(automation))}</strong><span><ha-icon icon="${enabled ? triggerIcon : "mdi:pause-circle-outline"}"></ha-icon>${enabled ? this._escape(this._automationTriggerLabel(automation.refresh_trigger_mode)) : "Aktualizace je pozastavená"}</span>${enabled ? this._renderAutomationCountdown(automation, writing) : ""}</span>
        </section>
        <footer class="automation-card-actions">${this._automationIntervalSelect(automation)}<button type="button" class="automation-delete" title="Smazat automatický zápis" data-automation-delete="${this._escape(automation.address)}" ${busy ? "disabled" : ""}><ha-icon icon="mdi:trash-can-outline"></ha-icon><span>Smazat zápis</span></button></footer>
        <details class="automation-entity-details">
          <summary><span><ha-icon icon="mdi:${cycleImages ? "image-sync-outline" : "database-sync-outline"}"></ha-icon>${cycleImages ? "Obrázky v cyklu" : "Aktualizované entity"}</span><b>${cycleImages || bindings}</b><ha-icon class="automation-details-chevron" icon="mdi:chevron-down"></ha-icon></summary>
          <div class="automation-details-body">
            <div class="automation-entities">${cycleImages ? `<span class="automation-no-entities"><ha-icon icon="mdi:image-multiple-outline"></ha-icon>Pravidelné střídání předrenderovaných obrázků</span>` : entities.length ? entities.map((entityId) => `<code><i></i>${this._escape(entityId)}</code>`).join("") : `<span class="automation-no-entities"><ha-icon icon="mdi:vector-combine"></ha-icon>Interní nebo složené datové vazby</span>`}</div>
            <div class="automation-detail-facts">
              <span><small>Trasa zápisu</small><strong><ha-icon icon="mdi:${viaGateway ? "router-wireless" : "bluetooth"}"></ha-icon>${this._escape(route)}</strong></span>
              <span><small>Obsah záznamu</small><strong>${cycleImages ? `${cycleImages} ${cycleImages === 1 ? "obrázek" : cycleImages < 5 ? "obrázky" : "obrázků"} v cyklu` : `${bindings} ${bindings === 1 ? "datová vazba" : "datových vazeb"}`}${templates ? ` · ${templates} ${templates === 1 ? "šablona" : "šablony"}` : ""}</strong></span>
            </div>
            ${this._automationTriggerSelect(automation)}
          </div>
        </details>
      </article>`;
    }).join("");
    return `<div class="automations-page">
      <div class="stat-tiles" aria-label="Souhrn automatických zápisů">
        ${stat("mdi:calendar-sync", activeCount, activeCount === 1 ? "Aktivní zápis" : "Aktivní zápisy", "is-good")}
        ${stat("mdi:database-sync-outline", entityCount, entityCount === 1 ? "Datová vazba" : "Datové vazby")}
        ${stat("mdi:router-wireless", gatewayCount, "Přes gateway", "is-warn")}
      </div>
      ${status}
      ${cards ? `<section class="automation-grid">${cards}</section>` : `<section class="card automation-empty"><span class="automation-empty-icon"><ha-icon icon="mdi:calendar-blank-outline"></ha-icon></span><h2>Zatím žádné automatické zápisy</h2><p>Odešlete do displeje návrh s napojenými entitami. Jeho pravidelná obnova se potom objeví právě tady.</p></section>`}
    </div>`;
  },

  _bindAutomationEvents() {
    this.shadowRoot.querySelectorAll("[data-automation-enabled]").forEach((button) => {
      button.addEventListener("click", async () => {
        const address = button.dataset.automationEnabled;
        const enabled = button.dataset.automationNextEnabled === "1";
        this._automationBusyAddress = address;
        this._automationsError = "";
        this._automationsResult = "";
        this._render(); this._paint();
        try {
          await this._hass.callWS({
            type: "dratek_eink/automations/update_enabled",
            address,
            enabled,
          });
          this._automationsResult = enabled
            ? "Automatické aktualizace byly zapnuty."
            : "Automatické aktualizace byly pozastaveny.";
          await this._loadAutomations(false);
        } catch (err) {
          this._automationsError = this._message(err);
        } finally {
          this._automationBusyAddress = "";
          this._render(); this._paint();
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-automation-interval]").forEach((select) => {
      select.addEventListener("change", async () => {
        const address = select.dataset.automationInterval;
        this._automationBusyAddress = address;
        this._automationsError = "";
        this._automationsResult = "";
        this._render(); this._paint();
        try {
          await this._hass.callWS({
            type: "dratek_eink/automations/update_interval",
            address,
            refresh_interval_seconds: Number(select.value),
          });
          this._automationsResult = "Interval automatického zápisu byl uložen.";
          await this._loadAutomations(false);
        } catch (err) {
          this._automationsError = this._message(err);
        } finally {
          this._automationBusyAddress = "";
          this._render(); this._paint();
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-automation-trigger]").forEach((select) => {
      select.addEventListener("change", async () => {
        const address = select.dataset.automationTrigger;
        this._automationBusyAddress = address;
        this._automationsError = "";
        this._automationsResult = "";
        this._render(); this._paint();
        try {
          await this._hass.callWS({
            type: "dratek_eink/automations/update_trigger_mode",
            address,
            refresh_trigger_mode: select.value,
          });
          this._automationsResult = "Způsob spouštění obnovy byl uložen.";
          await this._loadAutomations(false);
        } catch (err) {
          this._automationsError = this._message(err);
        } finally {
          this._automationBusyAddress = "";
          this._render(); this._paint();
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-automation-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        const address = button.dataset.automationDelete;
        const device = this._automationDevice(address);
        const label = device?.display_name || address;
        if (!window.confirm(`Opravdu smazat automatický zápis pro ${label}?`)) return;
        this._automationBusyAddress = address;
        this._automationsError = "";
        this._automationsResult = "";
        this._render(); this._paint();
        try {
          await this._hass.callWS({ type: "dratek_eink/automations/delete", address });
          this._automationsResult = `Automatický zápis pro ${label} byl smazán.`;
          await this._loadAutomations(false);
        } catch (err) {
          this._automationsError = this._message(err);
        } finally {
          this._automationBusyAddress = "";
          this._render(); this._paint();
        }
      });
    });
  },
};
