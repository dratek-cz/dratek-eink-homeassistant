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
    const seconds = Math.max(30, Math.min(86400, Number(automation.refresh_interval_seconds) || 60));
    const presets = [
      [30, "30 s"], [60, "1 min"], [300, "5 min"], [600, "10 min"],
      [900, "15 min"], [1800, "30 min"], [3600, "1 hod"], [7200, "2 hod"],
      [21600, "6 hod"], [43200, "12 hod"], [86400, "24 hod"],
    ];
    return `<label class="automation-interval-field"><span>Jak často zapisovat</span><div><ha-icon icon="mdi:timer-refresh-outline"></ha-icon><select data-automation-interval="${this._escape(automation.address)}" ${this._automationBusyAddress === automation.address ? "disabled" : ""}>${presets.map(([value, label]) => `<option value="${value}" ${seconds === value ? "selected" : ""}>${label}</option>`).join("")}</select></div></label>`;
  },

  _automationTriggerLabel(mode) {
    return ({
      both: "Při změně entity i pravidelně",
      change_only: "Jen při změně entity",
      interval_only: "Jen pravidelně podle intervalu",
    })[mode] || "Při změně entity i pravidelně";
  },

  _renderAutomations() {
    const automations = this._automations || [];
    const status = this._automationsError
      ? `<div class="automation-notice bad"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${this._escape(this._automationsError)}</div>`
      : this._automationsResult
        ? `<div class="automation-notice good"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${this._escape(this._automationsResult)}</div>`
        : "";
    if (this._automationsLoading && !automations.length) {
      return `<div class="card automation-empty"><ha-icon class="spin" icon="mdi:loading"></ha-icon><h2>Načítám automatické zápisy</h2></div>`;
    }
    const cards = automations.map((automation) => {
      const device = this._automationDevice(automation.address);
      const name = device?.display_name || device?.name || "eInk displej";
      const entities = Array.isArray(automation.entity_ids) ? automation.entity_ids : [];
      const route = automation.transport_name
        || (automation.route_type === "gateway" ? "DRATEK eInk gateway" : "Home Assistant Bluetooth");
      const busy = this._automationBusyAddress === automation.address;
      return `<article class="automation-card ${busy ? "is-busy" : ""}">
        <div class="automation-card-head"><span class="automation-device-icon"><ha-icon icon="mdi:monitor-dashboard"></ha-icon></span><div><strong>${this._escape(name)}</strong><small>${this._escape(automation.address)}</small></div><span class="pill good">Aktivní</span></div>
        <div class="automation-facts">
          <span><ha-icon icon="mdi:swap-horizontal"></ha-icon><span><small>Spouštění</small><strong>${this._escape(this._automationTriggerLabel(automation.refresh_trigger_mode))}</strong></span></span>
          <span><ha-icon icon="mdi:access-point-network"></ha-icon><span><small>Trasa zápisu</small><strong>${this._escape(route)}</strong></span></span>
        </div>
        <div class="automation-entities"><small>Napojené entity (${entities.length || Number(automation.binding_count || 0)})</small><div>${entities.length ? entities.map((entityId) => `<code>${this._escape(entityId)}</code>`).join("") : `<span class="automation-no-entities">Interní nebo složené datové vazby</span>`}</div></div>
        <div class="automation-card-actions">${this._automationIntervalSelect(automation)}<button class="danger automation-delete" data-automation-delete="${this._escape(automation.address)}" ${busy ? "disabled" : ""}><ha-icon icon="mdi:delete-outline"></ha-icon>Smazat automatický zápis</button></div>
      </article>`;
    }).join("");
    return `<div class="automations-page">
      <section class="card automations-hero"><div><span class="eyebrow">Plánované obnovy displejů</span><h2>Automatické zápisy</h2><p>Každý záznam patří ke konkrétnímu displeji. Změna intervalu se uloží okamžitě; smazáním se zastaví všechny jeho další automatické obnovy.</p></div><div class="automations-hero-actions"><span class="automation-count"><strong>${automations.length}</strong><small>${automations.length === 1 ? "aktivní zápis" : "aktivních zápisů"}</small></span><button id="refreshAutomations" class="secondary" ${this._automationsLoading ? "disabled" : ""}><ha-icon class="${this._automationsLoading ? "spin" : ""}" icon="mdi:refresh"></ha-icon>Obnovit</button></div></section>
      ${status}
      ${cards ? `<section class="automation-grid">${cards}</section>` : `<section class="card automation-empty"><ha-icon icon="mdi:calendar-remove-outline"></ha-icon><h2>Žádné automatické zápisy</h2><p>Automatický zápis vznikne po odeslání návrhu, který obsahuje napojené entity.</p></section>`}
    </div>`;
  },

  _bindAutomationEvents() {
    this.shadowRoot.querySelector("#refreshAutomations")?.addEventListener("click", () => this._loadAutomations(true));
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
