export const variablesMixin = {


  _normalizeVariableName(value) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^([0-9])/, "_$1")
      .replace(/_+/g, "_");
    return cleaned || "variable";
  },

  _uniqueVariableName(value, objectId) {
    const base = this._normalizeVariableName(value);
    const used = new Set(
      this._objects
        .filter((object) => object.id !== objectId && ["text", "chart"].includes(object.type) && object.variable && object.variableName)
        .map((object) => object.variableName)
    );
    if (!used.has(base)) return base;
    let index = 2;
    while (used.has(`${base}_${index}`)) index++;
    return `${base}_${index}`;
  },

  _entityRawValue(object) {
    const entityId = object?.entityId || object?.entity_id || this._customElementForm?.entity_id;
    if (!entityId) return undefined;
    const state = this._hass?.states?.[entityId];
    if (!state) return undefined;
    const attrKey = object?.entityAttribute || object?.entity_attribute || object?.target_attribute || object?.value_field || object?.target_value || this._customElementForm?.entity_attribute;
    return attrKey ? state.attributes?.[attrKey] : state.state;
  },

  _entityValue(object) {
    const value = this._entityRawValue(object);
    if (value === undefined || value === null) return "";
    if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
    const unit = object.type === "text" && !object.entityAttribute
      ? this._hass?.states?.[object.entityId]?.attributes?.unit_of_measurement
      : "";
    return `${value}${unit ? ` ${unit}` : ""}`;
  },

  _entityStateLabel(object) {
    if (!object?.entityId) return "Ruční hodnota";
    const state = this._hass?.states?.[object.entityId];
    if (!state) return "Entita nebyla nalezena";
    const friendlyName = state.attributes?.friendly_name || object.entityId;
    const value = this._entityValue(object);
    return `${friendlyName}: ${value || "-"}`;
  },

  _variableDefs() {
    for (const object of this._objects.filter((item) => item.type === "chart")) {
      object.variable = true;
      object.variableName = this._uniqueVariableName(object.variableName || "data_grafu", object.id);
      if (this._variables[object.variableName] === undefined) this._variables[object.variableName] = object.data || "";
      if (!object.barColor) object.barColor = "red";
      if (!Number(object.legendFontSize)) object.legendFontSize = 12;
    }
    return this._objects
      .filter((object) => ["text", "chart"].includes(object.type) && object.variable && object.variableName)
      .map((object) => ({
        id: object.id,
        name: object.variableName,
        type: object.type,
        entityId: object.entityId || "",
        entityAttribute: object.entityAttribute || "",
        entityLabel: this._entityStateLabel(object),
        defaultValue: object.type === "chart" ? (object.data || "") : (object.text || ""),
        value: this._variables[object.variableName] ?? (object.type === "chart" ? object.data : object.text) ?? "",
      }));
  },

  _renderVariablesDialog() {
    if (!this._variablesDialogOpen) return "";
    const variables = this._variableDefs();
    return `<div class="modal-backdrop"><div class="editor-dialog">
      <div class="section-title"><div><h2>Proměnné návrhu</h2><div class="subtitle">Ke každému textu, grafu nebo datovému prvku můžete přímo vybrat entitu či Pomocníka Home Assistantu.</div></div><button id="variablesDialogClose" class="icon-btn secondary" title="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button></div>
      ${variables.length ? `<div class="variable-list">${variables.map((variable) => `<div class="variable-card">
        <div class="variable-card-head"><strong>${this._escape(variable.name)}</strong><span class="pill ${variable.entityId ? "good" : "muted"}">${variable.entityId ? "Entita HA" : variable.type === "chart" ? "Ruční pole" : "Ruční text"}</span></div>
        <div class="field"><label>Entita nebo Pomocník Home Assistantu</label><ha-selector data-variable-entity-picker="${this._escape(variable.id)}"></ha-selector></div>
        ${variable.entityId ? `<div class="field"><label>Atribut entity (volitelné)</label><input data-variable-entity-attribute="${this._escape(variable.id)}" value="${this._escape(variable.entityAttribute)}" placeholder="Prázdné pole použije hlavní stav entity"></div><div class="entity-current"><ha-icon icon="mdi:home-assistant"></ha-icon><div><strong>${this._escape(variable.entityLabel)}</strong><small>${this._escape(variable.entityId)}${variable.entityAttribute ? ` · atribut ${this._escape(variable.entityAttribute)}` : ""}</small></div></div>` : `<div class="entity-source-divider"><span>nebo ruční hodnota</span></div>${variable.type === "chart" ? `<textarea data-variable="${this._escape(variable.name)}" rows="4">${this._escape(variable.value)}</textarea>` : `<input data-variable="${this._escape(variable.name)}" value="${this._escape(variable.value)}">`}`}
        ${variable.type === "chart" && !variable.entityId ? `<div class="format-help"><ha-icon icon="mdi:code-json"></ha-icon><div><strong>Datový formát</strong><div>Zdroj musí vrátit pole čísel v pořadí zleva doprava. Doporučený je JSON; podporovaný je také seznam oddělený čárkami. Pro desetinnou čárku oddělujte hodnoty středníkem.</div><code>[1.62, 1.48, 1.36] &nbsp; nebo &nbsp; 1,62; 1,48; 1,36</code></div></div>` : ""}
      </div>`).join("")}</div>` : `<div class="inspector-empty"><ha-icon icon="mdi:variable-box"></ha-icon><p>Návrh zatím neobsahuje žádnou proměnnou. Označte text jako proměnný nebo vložte graf.</p></div>`}
    </div></div>`;
  },

  _renderEntityBinding(object) {
    const state = object.entityId ? this._hass?.states?.[object.entityId] : null;
    const friendlyName = state?.attributes?.friendly_name || object.entityId || "";
    const value = object.entityId ? this._entityValue(object) : "";
    return `<div class="entity-source">
      <div class="entity-source-title"><ha-icon icon="mdi:home-assistant"></ha-icon><div><strong>Home Assistant</strong><small>Entita, pomocník nebo atribut</small></div></div>
      <div class="field"><label>Vybrat entitu nebo Pomocníka</label><ha-selector data-entity-picker="${this._escape(object.id)}"></ha-selector></div>
      <div class="entity-source-divider"><span>nebo zadejte ID ručně</span></div>
      <div class="field"><label>Entity ID</label><input data-entity-input="${this._escape(object.id)}" value="${this._escape(object.entityId || "")}" placeholder="sensor.teplota nebo input_number.hodnota"><small>Ruční vstup funguje i pro vlastní entity, které picker nenabízí.</small></div>
      <div class="field"><label>Atribut entity (volitelné)</label><input data-prop="entityAttribute" value="${this._escape(object.entityAttribute || "")}" placeholder="Například prices"><small>Prázdné pole použije hlavní stav entity.</small></div>
      <div class="entity-auto-update"><ha-icon icon="mdi:gesture-tap-button"></ha-icon><span>Hodnota se načte pro náhled, ale na displej se odešle jen ručně.</span></div>
      ${object.entityId ? `<div class="entity-current"><ha-icon icon="mdi:check-circle-outline"></ha-icon><div><strong>${this._escape(value || "Bez hodnoty")}</strong><small>${this._escape(friendlyName)} · ${this._escape(object.entityId)}${object.entityAttribute ? ` · ${this._escape(object.entityAttribute)}` : ""}</small></div></div>` : `<div class="entity-current is-empty"><ha-icon icon="mdi:database-off-outline"></ha-icon><div><strong>Ruční náhled</strong><small>Dokud nevyberete entitu, používá se hodnota nastavená v objektu.</small></div></div>`}
    </div>`;
  },

  _automaticTextBindings() {
    return [];
  },

  _canonicalRenderObjects() {
    const automaticIds = new Set(this._automaticTextBindings().map((object) => object.id));
    return this._objects.filter((object) => object.type === "text" || automaticIds.has(object.id));
  },

  _entityAutomationPayload(device = this._device(), sizeOverride = null) {
    return { enabled: false };
  },
};
