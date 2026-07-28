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
      if (!Number(object.legendFontSize)) object.legendFontSize = 8;
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
      <div class="section-title"><div><h2>Proměnné návrhu</h2><div class="subtitle">Ruční hodnoty upravíte zde. Zdroj z entity nebo Pomocníka Home Assistantu vyberete v Inspectoru konkrétního objektu.</div></div><button id="variablesDialogClose" class="icon-btn secondary" title="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button></div>
      ${variables.length ? `<div class="variable-list">${variables.map((variable) => `<div class="variable-card"><div class="variable-card-head"><strong>${this._escape(variable.name)}</strong><span class="pill ${variable.entityId ? "good" : "muted"}">${variable.entityId ? "Entita HA" : variable.type === "chart" ? "Ruční pole" : "Ruční text"}</span></div>${variable.entityId ? `<div class="entity-current"><ha-icon icon="mdi:home-assistant"></ha-icon><div><strong>${this._escape(variable.entityLabel)}</strong><small>${this._escape(variable.entityId)}${variable.entityAttribute ? ` · atribut ${this._escape(variable.entityAttribute)}` : ""}</small></div></div>` : variable.type === "chart" ? `<textarea data-variable="${this._escape(variable.name)}" rows="4">${this._escape(variable.value)}</textarea>` : `<input data-variable="${this._escape(variable.name)}" value="${this._escape(variable.value)}">`}${variable.type === "chart" ? `<div class="format-help"><ha-icon icon="mdi:code-json"></ha-icon><div><strong>Datový formát</strong><div>Zdroj musí vrátit pole čísel v pořadí zleva doprava. Doporučený je JSON; podporovaný je také seznam oddělený čárkami. Pro desetinnou čárku oddělujte hodnoty středníkem.</div><code>[1.62, 1.48, 1.36] &nbsp; nebo &nbsp; 1,62; 1,48; 1,36</code></div></div>` : ""}</div>`).join("")}</div>` : `<div class="inspector-empty"><ha-icon icon="mdi:variable-off"></ha-icon><p>Návrh zatím neobsahuje žádnou proměnnou. Označte text jako proměnný nebo vložte graf.</p></div>`}
    </div></div>`;
  },

  _renderEntityBinding(object) {
    const state = object.entityId ? this._hass?.states?.[object.entityId] : null;
    const friendlyName = state?.attributes?.friendly_name || object.entityId || "";
    const value = object.entityId ? this._entityValue(object) : "";
    const entityIds = Object.keys(this._hass?.states || {}).sort();
    const listId = `entity-list-${String(object.id || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
    return `<div class="entity-source">
      <div class="entity-source-title"><ha-icon icon="mdi:home-assistant"></ha-icon><div><strong>Home Assistant</strong><small>Entita, pomocník nebo atribut</small></div></div>
      <div class="field"><label>Vybrat entitu nebo Pomocníka</label><ha-entity-picker data-entity-picker="${this._escape(object.id)}"></ha-entity-picker></div>
      <div class="entity-source-divider"><span>nebo zadejte ID ručně</span></div>
      <div class="field"><label>Entity ID</label><input data-entity-input="${this._escape(object.id)}" list="${listId}" value="${this._escape(object.entityId || "")}" placeholder="sensor.teplota nebo input_number.hodnota"><datalist id="${listId}">${entityIds.map((entityId) => `<option value="${this._escape(entityId)}"></option>`).join("")}</datalist><small>Ruční vstup funguje i pro vlastní entity, které picker nenabízí.</small></div>
      <div class="field"><label>Atribut entity (volitelné)</label><input data-prop="entityAttribute" value="${this._escape(object.entityAttribute || "")}" placeholder="Například prices"><small>Prázdné pole použije hlavní stav entity.</small></div>
      <label class="entity-auto-update"><input data-prop="autoUpdate" type="checkbox" ${object.autoUpdate !== false ? "checked" : ""}> <span>Automaticky odeslat při změně</span></label>
      ${object.entityId ? `<div class="entity-current"><ha-icon icon="mdi:check-circle-outline"></ha-icon><div><strong>${this._escape(value || "Bez hodnoty")}</strong><small>${this._escape(friendlyName)} · ${this._escape(object.entityId)}${object.entityAttribute ? ` · ${this._escape(object.entityAttribute)}` : ""}</small></div></div>` : `<div class="entity-current is-empty"><ha-icon icon="mdi:database-off-outline"></ha-icon><div><strong>Ruční náhled</strong><small>Dokud nevyberete entitu, používá se hodnota nastavená v objektu.</small></div></div>`}
    </div>`;
  },

  _automaticTextBindings() {
    return this._objects.filter((object) => ["text", "chart", "layered", "bar_gauge", "pie", "slider", "gauge", "potentiometer"].includes(object.type) && object.entityId && object.autoUpdate !== false);
  },

  _canonicalRenderObjects() {
    const automaticIds = new Set(this._automaticTextBindings().map((object) => object.id));
    return this._objects.filter((object) => object.type === "text" || automaticIds.has(object.id));
  },

  _entityAutomationPayload(device = this._device(), sizeOverride = null) {
    const objects = this._canonicalRenderObjects();
    if (!objects.length) return { enabled: false };
    const size = sizeOverride || this._displaySize(device);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    this._drawScene(canvas.getContext("2d", { willReadFrequently: true }), size.width, size.height, false, new Set(objects.map((object) => object.id)));
    const effectiveColor = (color) => {
      if (!this._invertColors || color === "red") return color || "black";
      return color === "white" ? "black" : "white";
    };
    return {
      enabled: true,
      base_image: canvas.toDataURL("image/png"),
      refresh_interval_seconds: this._refreshIntervalSeconds,
      bindings: objects.map((object) => {
        if (["bar_gauge", "pie", "slider", "gauge", "potentiometer"].includes(object.type)) {
          const layerId = `widget-${object.id}`;
          const widget = structuredClone(object);
          widget.x = 0;
          widget.y = 0;
          widget.w = Number(object.w || 1);
          widget.h = Number(object.h || 1);
          widget.rotation = 0;
          widget.entity_id = object.entityId;
          widget.entity_attribute = object.entityAttribute || "";
          return {
            id: object.id, type: "layered", entity_id: object.entityId,
            entity_ids: [object.entityId], entity_attribute: object.entityAttribute || "",
            include_unit: false, fallback: layerId,
            x: Number(object.x || 0), y: Number(object.y || 0),
            w: Number(object.w || 1), h: Number(object.h || 1),
            rotation: Number(object.rotation || 0), flipH: !!object.flipH,
            canvas_width: Number(object.w || 1), canvas_height: Number(object.h || 1),
            layers: [{ id: layerId, name: object.label || "Ukazatel", objects: [widget] }],
            condition_rules: [], default_symbol: layerId,
          };
        }
        if (object.type === "layered") {
          const master = object.customElementId ? (this._customElements || []).find((e) => e.id === object.customElementId) : null;
          const layers = this._storedRecordList(master?.layers || object.customLayers);
          const canvasW = Number(master?.canvas_width || object.customCanvasWidth || 296);
          const canvasH = Number(master?.canvas_height || object.customCanvasHeight || 128);
          const conditionRules = master
            ? this._storedRecordList(master.condition_rules).map((rule) => ({ operator: rule.operator, value: rule.value || "", symbol: rule.layer_id || rule.symbol || "" }))
            : this._storedRecordList(object.conditionRules);
          const defaultSymbol = master?.default_layer_id || object.defaultSymbol || layers[0]?.id || "";
          const entityId = master?.entity_id || object.entityId || "";
          const entityAttr = master?.entity_attribute || object.entityAttribute || "";
          const entityIds = [...new Set([
            entityId,
            ...layers.flatMap((layer) => this._storedRecordList(layer.objects).map((item) => item.entity_id || item.entityId || "")),
          ].filter(Boolean))];
          return {
            id: object.id, type: "layered", entity_id: entityId,
            custom_element_id: object.customElementId || "",
            entity_ids: entityIds,
            entity_attribute: entityAttr, include_unit: false, fallback: defaultSymbol,
            x: Number(object.x || 0), y: Number(object.y || 0), w: Number(object.w || 1), h: Number(object.h || 1),
            rotation: Number(object.rotation || 0), flipH: !!object.flipH,
            canvas_width: canvasW, canvas_height: canvasH,
            layers: structuredClone(layers),
            condition_rules: structuredClone(conditionRules), default_symbol: defaultSymbol,
          };
        }
        if (object.type === "chart") {
          const chartType = object.chartType || "line";
          return {
            id: object.id, type: "chart", entity_id: object.entityId,
            custom_element_id: object.customElementId || "",
            entity_attribute: object.entityAttribute || "", include_unit: false, fallback: object.data || "",
            x: Number(object.x || 0), y: Number(object.y || 0), w: Number(object.w || 1), h: Number(object.h || 1),
            chartType, chartTitle: object.chartTitle || "", chartLabels: object.chartLabels || "",
            xLabel: object.xLabel || "", yLabel: object.yLabel || "",
            chartMin: object.chartMin ?? "", chartMax: object.chartMax ?? "",
            maxPoints: Number(object.maxPoints || 48), legendFontSize: Number(object.legendFontSize || 8),
            showAxes: object.showAxes !== false, showGrid: object.showGrid !== false, showValues: !!object.showValues,
            backgroundColor: object.backgroundColor || "white", graphColor: object.graphColor || "black",
            history_mode: object.historyMode || "rolling",
            color: chartType === "bar" ? (object.barColor || "red") : (object.color || "black"),
            strokeWidth: Number(object.strokeWidth || 2),
          };
        }
        return {
          id: object.id,
          custom_element_id: object.customElementId || "",
          entity_id: object.entityId && object.autoUpdate !== false ? object.entityId : "",
          entity_attribute: object.entityAttribute || "",
          include_unit: !object.entityAttribute && !object.valueSuffix,
          fallback: this._textObjectValue(object),
          x: Number(object.x || 0), y: Number(object.y || 0),
          w: Number(object.w || 1), h: Number(object.h || 1),
          rotation: Number(object.rotation || 0), flipH: !!object.flipH,
          color: effectiveColor(object.color), fontSize: Number(object.fontSize || 16),
          minFontSize: Number(object.minFontSize || this._readableMinFontSize(size)),
          bold: !!object.bold, textAlign: object.textAlign || "left",
          verticalAlign: object.verticalAlign || "middle", autoFit: object.autoFit !== false,
          padding: Number(object.padding || 0),
          value_prefix: object.valuePrefix || "", value_suffix: object.valueSuffix || "",
          status_icons: !!object.statusIcons, status_on_symbol: object.statusOnSymbol || "●",
          status_off_symbol: object.statusOffSymbol || "○", status_on_values: object.statusOnValues || "on,true,1,open,home",
          condition_rules: structuredClone(object.conditionRules || []), default_symbol: object.defaultSymbol || "?",
        };
      }),
    };
  },
};
