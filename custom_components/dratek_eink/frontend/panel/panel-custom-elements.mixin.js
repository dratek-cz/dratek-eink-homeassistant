export const customElementsMixin = {


  async _loadCustomElements(render = true) {
    if (!this._hass) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/custom_elements/list" });
      this._customElements = this._storedRecordList(result.elements).map((element) => this._normalizeStoredCustomElement(element));
      this._saveCachedCustomElements();
      (this._customElements || []).forEach((element) => this._syncCustomElementToAllObjects(element));
    } catch (err) {
      this._customElementResult = { ok: false, error: this._message(err) };
    }
    if (render) {
      if (this._activeTab === "custom") this._stableCustomRender();
      else {
        this._render();
        this._paint();
      }
    }
  },

  _syncCustomElementToAllObjects(element) {
    if (!element || !element.id) return;
    const syncObj = (obj) => {
      if (obj.customElementId !== element.id) return;
      if (obj.type === "layered" || element.element_type === "layered") {
        obj.customLayers = structuredClone(element.layers || []);
        obj.customCanvasWidth = Number(element.canvas_width || 296);
        obj.customCanvasHeight = Number(element.canvas_height || 128);
        obj.conditionRules = structuredClone((element.condition_rules || []).map((rule) => ({
          operator: rule.operator,
          value: rule.value || "",
          symbol: rule.layer_id || rule.symbol || "",
        })));
        obj.defaultSymbol = element.default_layer_id || element.layers?.[0]?.id || "";
      }
      if (element.entity_id) {
        obj.entityId = element.entity_id;
        obj.entityAttribute = element.entity_attribute || "";
      }
      if (element.element_type === "icon" && element.icon_image) {
        obj.image = element.icon_image;
      }
      if (element.element_type === "chart") {
        obj.chartType = element.chart_type || obj.chartType || "line";
        obj.maxPoints = Number(element.history_points || obj.maxPoints || 24);
        obj.historyMode = element.history_mode || obj.historyMode || "rolling";
      }
      if (element.element_type === "status") {
        obj.statusOnSymbol = element.on_symbol || obj.statusOnSymbol;
        obj.statusOffSymbol = element.off_symbol || obj.statusOffSymbol;
        obj.statusOnValues = element.on_values || obj.statusOnValues;
        obj.defaultSymbol = element.default_symbol || obj.defaultSymbol;
        obj.conditionRules = structuredClone(element.condition_rules || obj.conditionRules || []);
      }
    };

    (this._objects || []).forEach(syncObj);

    if (this._projects && typeof this._projects === "object") {
      Object.values(this._projects).forEach((project) => {
        if (project && Array.isArray(project.objects)) {
          project.objects.forEach(syncObj);
        }
      });
    }

    if (this._deviceDrafts && typeof this._deviceDrafts === "object") {
      Object.values(this._deviceDrafts).forEach((draft) => {
        if (draft && Array.isArray(draft.objects)) {
          draft.objects.forEach(syncObj);
        }
      });
    }
  },

  async _saveCustomElement() {
    if (!this._hass || this._customElementBusy || !this._customElementFormValid()) return;
    this._customElementBusy = true;
    this._customElementResult = null;
    this._stableCustomRender();
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/custom_elements/save", element: this._customElementForm });
      this._customElementForm = { ...this._emptyCustomElementForm(), ...structuredClone(result.element) };
      await this._loadCustomElements(false);
      this._syncCustomElementToAllObjects(result.element);
      if (typeof this._saveCachedDeviceDrafts === "function") this._saveCachedDeviceDrafts();
      const device = this._device();
      if (device) {
        await this._saveCurrentDeviceDraft();
      }
      const scheduledCount = Array.isArray(result.scheduled_displays) ? result.scheduled_displays.length : 0;
      this._customElementResult = {
        ok: true,
        message: scheduledCount
          ? `Prvek „${result.element.name}“ je uložený. ${scheduledCount === 1 ? "Displej byl zařazen" : `${scheduledCount} displejů bylo zařazeno`} k automatické aktualizaci.`
          : `Prvek „${result.element.name}“ je uložený. Změny byly promítnuty do uložených návrhů.`,
      };
    } catch (err) {
      this._customElementResult = { ok: false, error: this._message(err) };
    } finally {
      this._customElementBusy = false;
      this._render();
      this._paint();
      this._stableCustomRender();
    }
  },

  _customMappingPath(collectionPath, field) {
    if (!field) return "";
    if (!collectionPath) return field === "$value" ? "" : field;
    return field === "$value" ? `${collectionPath}[]` : `${collectionPath}[].${field}`;
  },

  _applyCustomMappingPaths() {
    const form = this._customElementForm;
    form.json_path = this._customMappingPath(form.collection_path, form.value_field);
    form.label_json_path = form.element_type === "chart" ? this._customMappingPath(form.collection_path, form.label_field) : "";
  },

  _adoptCustomInspection(collections) {
    const form = this._customElementForm;
    const mappings = collections.flatMap((collection) => (collection.fields || []).map((field) => ({ collection, field, path: this._customMappingPath(collection.path, field.key) })));
    const existing = mappings.find((item) => item.path === form.json_path && (form.element_type !== "chart" || item.field.kind === "number"));
    if (existing) {
      form.collection_path = existing.collection.path;
      form.value_field = existing.field.key;
      const label = mappings.find((item) => item.path === form.label_json_path && item.collection.path === existing.collection.path);
      form.label_field = label?.field?.key || "";
      this._applyCustomMappingPaths();
      return;
    }
    const preferred = form.element_type === "chart"
      ? collections.find((collection) => Number(collection.count) > 1 && (collection.fields || []).some((field) => field.kind === "number"))
      : collections.find((collection) => (collection.fields || []).length);
    const collection = preferred || collections.find((item) => (item.fields || []).length);
    if (!collection) return;
    const fields = collection.fields || [];
    const value = form.element_type === "chart" ? fields.find((field) => field.kind === "number") : fields[0];
    const label = form.element_type === "chart" ? fields.find((field) => field.kind === "text") : null;
    form.collection_path = collection.path || "";
    form.value_field = value?.key || "";
    form.label_field = label?.key || "";
    this._applyCustomMappingPaths();
  },

  async _fetchCustomElementUrl(inspect = true) {
    if (!this._hass || this._customElementBusy || !this._customElementForm.url.trim()) return;
    this._customElementBusy = true;
    this._customElementResult = null;
    this._render();
    try {
      const request = (discovery = false) => this._hass.callWS({
        type: "dratek_eink/custom_elements/fetch_url",
        url: this._customElementForm.url,
        json_path: discovery ? "" : this._customElementForm.json_path || "",
        label_json_path: discovery ? "" : this._customElementForm.label_json_path || "",
      });
      let result;
      if (inspect) {
        const inspection = await request(true);
        this._customElementFields = Array.isArray(inspection.fields) ? inspection.fields : [];
        this._customElementInspection = { collections: Array.isArray(inspection.collections) ? inspection.collections : [] };
        this._adoptCustomInspection(this._customElementInspection.collections);
      }
      result = await request(false);
      if (!inspect && Array.isArray(result.collections)) this._customElementInspection = { collections: result.collections };
      this._customElementForm.sample_data = result.value || "";
      this._customElementForm.sample_labels = this._chartLabelsText(result.labels || "");
      this._customElementResult = result.mapping_error
        ? { ok: false, error: `API bylo načteno, ale přiřazení není platné: ${result.mapping_error}` }
        : { ok: true, message: `API načteno. Používám ${this._customElementForm.json_path || "celou odpověď"}${this._customElementForm.label_json_path ? ` a popisky ${this._customElementForm.label_json_path}` : ""}.` };
    } catch (err) {
      this._customElementResult = { ok: false, error: this._message(err) };
    } finally {
      this._customElementBusy = false;
      this._render();
      this._paint();
    }
  },

  async _refreshCustomUrlObjects() {
    return;
    const objects = this._objects.filter((object) => object.customSourceUrl);
    for (const object of objects) {
      const result = await this._hass.callWS({
        type: "dratek_eink/custom_elements/fetch_url",
        url: object.customSourceUrl,
        json_path: object.customJsonPath || "",
        label_json_path: object.customLabelJsonPath || "",
      });
      const value = result.value || "";
      if (object.type === "chart") {
        object.data = value;
        object.chartLabels = this._chartLabelsText(result.labels || "");
      }
      else object.text = value;
      if (object.variableName) this._variables[object.variableName] = value;
    }
  },

  _chartLabelsText(value) {
    try {
      const parsed = JSON.parse(String(value || ""));
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(",");
    } catch (_err) { /* Keep plain text below. */ }
    return String(value || "");
  },

  async _deleteCustomElement(elementId) {
    if (!this._hass || !elementId || !confirm("Smazat tento vlastní prvek z knihovny?")) return;
    await this._hass.callWS({ type: "dratek_eink/custom_elements/delete", element_id: elementId });
    if (this._customElementForm.id === elementId) this._customElementForm = this._emptyCustomElementForm();
    await this._loadCustomElements();
  },

  _customElementObject(element, size, id = `obj-${this._nextId++}`) {
    const width = Math.max(24, Math.round(size.width * (Number(element.width_percent) || 55) / 100));
    const height = Math.max(24, Math.round(size.height * (Number(element.height_percent) || 35) / 100));
    const entityId = element.entity_id || "";
    const sample = String(element.sample_data || this._customElementCurrentValue(element) || "");
    if (element.element_type === "layered") {
      const ratio = Math.max(0.2, Number(element.canvas_width || 296) / Math.max(1, Number(element.canvas_height || 128)));
      let layerWidth = Math.max(48, Math.round(size.width * 0.62));
      let layerHeight = Math.round(layerWidth / ratio);
      if (layerHeight > size.height * 0.72) {
        layerHeight = Math.round(size.height * 0.72);
        layerWidth = Math.round(layerHeight * ratio);
      }
      return {
        id, type: "layered", x: Math.round((size.width - layerWidth) / 2), y: Math.round((size.height - layerHeight) / 2),
        w: layerWidth, h: layerHeight, rotation: 0, flipH: false,
        entityId, entityAttribute: element.entity_attribute || "", autoUpdate: true,
        customElementId: element.id || "", customLayers: structuredClone(element.layers || []),
        customCanvasWidth: Number(element.canvas_width || 296), customCanvasHeight: Number(element.canvas_height || 128),
        conditionRules: structuredClone((element.condition_rules || []).map((rule) => ({ operator: rule.operator, value: rule.value || "", symbol: rule.layer_id || "" }))),
        defaultSymbol: element.default_layer_id || element.layers?.[0]?.id || "",
      };
    }
    if (element.element_type === "icon") {
      const side = Math.max(24, Math.round(Math.min(size.width, size.height) * (Number(element.width_percent) || 55) / 100));
      return {
        id, type: "image", x: Math.round((size.width - side) / 2), y: Math.round((size.height - side) / 2),
        w: side, h: side, rotation: 0, flipH: false, image: element.icon_image || "", keepRatio: true,
        customElementId: element.id || "",
      };
    }
    if (element.element_type === "chart") {
      return {
        id, type: "chart", x: Math.round((size.width - width) / 2), y: Math.round((size.height - height) / 2),
        w: width, h: height, rotation: 0, flipH: false, color: element.color || "black",
        backgroundColor: "white", chartType: element.chart_type || "line", data: sample || "1,2,3,2,4",
        chartLabels: element.sample_labels || "", chartTitle: element.label || element.name || "Graf", xLabel: "", yLabel: element.unit || "",
        chartMin: "", chartMax: "", maxPoints: Number(element.history_points || 24), historyMode: element.history_mode || "rolling", showAxes: true, showGrid: true, showValues: false,
        barColor: element.color || "red", graphColor: "black", legendFontSize: 8,
        variable: !entityId, variableName: this._uniqueVariableName(`custom_${String(element.name || "graf").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, id),
        entityId, entityAttribute: element.entity_attribute || "", customElementId: element.id || "",
      };
    }
    const status = element.element_type === "status";
    const label = element.label ? `${element.label}${status ? "\n" : ": "}` : "";
    return {
      id, type: "text", x: Math.round((size.width - width) / 2), y: Math.round((size.height - height) / 2),
      w: width, h: height, rotation: 0, flipH: false, color: element.color || "black",
      text: status ? (element.default_symbol || "?") : `${label}${sample || "Hodnota"}${element.unit ? ` ${element.unit}` : ""}`,
      fontSize: Math.max(16, Math.round(Math.min(size.width, size.height) * (status ? 0.2 : 0.12))),
      fontFamily: "Arial", minFontSize: 11, bold: true, variable: true,
      variableName: this._uniqueVariableName(`custom_${String(element.name || "prvek").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, id),
      entityId, entityAttribute: element.entity_attribute || "", textAlign: "center", verticalAlign: "middle", autoFit: true,
      autoUpdate: !!entityId, valuePrefix: status ? "" : label, valueSuffix: status || !element.unit ? "" : ` ${element.unit}`,
      statusIcons: status, statusOnSymbol: element.on_symbol || "●", statusOffSymbol: element.off_symbol || "○",
      statusOnValues: element.on_values || "on,true,1,open,home", customElementId: element.id || "",
      conditionRules: structuredClone(element.condition_rules || []), defaultSymbol: element.default_symbol || "?",
    };
  },

  async _insertCustomElement(element, openDesigner = true) {
    const device = this._device() || this._result?.devices?.[0];
    if (!device) {
      this._customElementResult = { ok: false, error: "Nejprve musí být nalezen alespoň jeden displej." };
      this._render();
      return;
    }
    if (device.address !== this._selectedDeviceAddress) await this._selectDevice(device.address, { saveCurrent: true, render: false });
    this._pushHistory();
    const object = this._customElementObject(element, this._displaySize(device));
    this._objects.push(object);
    if (object.variable && object.variableName) this._variables[object.variableName] = object.data || object.text || "";
    this._selectedIds = [object.id];
    this._projectName = this._projectName === "Novy navrh" ? `Návrh ${this._deviceTitle(device)}` : this._projectName;
    await this._saveCurrentDeviceDraft();
    if (openDesigner) this._activeTab = "designer";
    this._customElementResult = { ok: true, message: `Prvek „${element.name}“ byl vložen do návrhu displeje ${this._deviceTitle(device)}.` };
    this._render();
    this._paint();
  },

  async _applyCustomElementToAll(element) {
    const devices = this._result?.devices || [];
    if (!devices.length || this._customElementBusy) return;
    if (!confirm(`Přidat prvek „${element.name}“ do uloženého návrhu všech ${devices.length} displejů?`)) return;
    this._customElementBusy = true;
    this._render();
    try {
      for (let index = 0; index < devices.length; index++) {
        const device = devices[index];
        const address = String(device.address || "").toUpperCase();
        const loaded = await this._hass.callWS({ type: "dratek_eink/device_drafts/load", address });
        const base = this._baseDisplaySize(device);
        const draft = loaded.draft || {
          version: 1, name: `Návrh ${this._deviceTitle(device)}`, device_address: address,
          sdk_type: Number(device.sdk_type), orientation: "landscape", display_transform: "rotate_cw",
          refresh_interval_seconds: 60,
          invert_colors: false, background_color: "white", width: Math.max(base.width, base.height),
          height: Math.min(base.width, base.height), variables: {}, objects: [],
        };
        const size = { width: Number(draft.width) || Math.max(base.width, base.height), height: Number(draft.height) || Math.min(base.width, base.height) };
        const object = this._customElementObject(element, size, `custom-${Date.now()}-${index}`);
        draft.objects = [...(Array.isArray(draft.objects) ? draft.objects : []), object];
        draft.variables = { ...(draft.variables || {}) };
        if (object.variable && object.variableName) draft.variables[object.variableName] = object.data || object.text || "";
        const saved = await this._hass.callWS({ type: "dratek_eink/device_drafts/save", address, draft });
        this._deviceDrafts[address] = saved.draft;
      }
      this._saveCachedDeviceDrafts();
      if (this._selectedDeviceAddress) await this._loadDeviceDraft(this._selectedDeviceAddress);
      this._customElementResult = { ok: true, message: `Prvek byl přidán do návrhů ${devices.length} displejů.` };
    } catch (err) {
      this._customElementResult = { ok: false, error: this._message(err) };
    } finally {
      this._customElementBusy = false;
      this._render();
      this._paint();
    }
  },

  _setCustomIconFile(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      this._customElementResult = { ok: false, error: "Vyberte obrázek ve formátu PNG, JPG, WebP nebo GIF." };
      this._stableCustomRender();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this._customElementResult = { ok: false, error: "Obrázek může mít maximálně 10 MB." };
      this._stableCustomRender();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
        this._customElementForm.icon_image = canvas.toDataURL("image/png");
        this._customElementResult = { ok: true, message: "Ikona je připravená. Po vložení ji můžete v designeru přesouvat a měnit její velikost." };
        this._stableCustomRender();
      };
      image.onerror = () => {
        this._customElementResult = { ok: false, error: "Obrázek se nepodařilo načíst." };
        this._stableCustomRender();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  },

  _customElementMeta(type) {
    return ({
      value: { label: "Hodnota", icon: "mdi:card-text-outline", description: "Textová hodnota senzoru, ceny nebo spotřeby." },
      status: { label: "Stavová ikona", icon: "mdi:power-socket-eu", description: "Symbol se změní podle stavu entity, například zásuvky." },
      chart: { label: "Graf", icon: "mdi:chart-line", description: "Graf z hodnot senzoru nebo číselného atributu Home Assistantu." },
      icon: { label: "Vlastní ikona", icon: "mdi:image-plus-outline", description: "Vlastní obrázek, který po vložení libovolně přesunete a změníte jeho velikost." },
    })[type] || { label: "Prvek", icon: "mdi:puzzle-outline", description: "Vlastní prvek displeje." };
  },

  _customElementCurrentValue(element) {
    if (element.entity_id) {
      const state = this._hass?.states?.[element.entity_id];
      const value = element.entity_attribute ? state?.attributes?.[element.entity_attribute] : state?.state;
      if (value !== undefined && value !== null) return typeof value === "string" ? value : JSON.stringify(value);
    }
    return String(element.sample_data || "");
  },

  _customConditionMatches(value, operator, target) {
    const current = String(value ?? "").trim().toLowerCase();
    const expected = String(target ?? "").trim().toLowerCase();
    const onValues = new Set(["on", "true", "1", "open", "home", "active", "heat", "heating", "playing", "unlocked"]);
    const offValues = new Set(["off", "false", "0", "closed", "not_home", "idle", "unavailable", "unknown", "locked"]);
    if (operator === "is_on") return onValues.has(current);
    if (operator === "is_off") return offValues.has(current);
    if (operator === "contains") return current.includes(expected);
    if (operator === "time_between") {
      const toMinutes = (input) => {
        const match = String(input || "").match(/(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
      };
      const [startText, endText] = String(target || "").split("|");
      const currentMinutes = toMinutes(current);
      const startMinutes = toMinutes(startText);
      const endMinutes = toMinutes(endText);
      if (currentMinutes === null || startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;
      return startMinutes < endMinutes
        ? currentMinutes >= startMinutes && currentMinutes < endMinutes
        : currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    if (["greater", "greater_equal", "less", "less_equal"].includes(operator)) {
      const currentNumber = Number(value);
      const targetNumber = Number(target);
      if (!Number.isFinite(currentNumber) || !Number.isFinite(targetNumber)) return false;
      return operator === "greater"
        ? currentNumber > targetNumber
        : operator === "greater_equal"
          ? currentNumber >= targetNumber
          : operator === "less"
            ? currentNumber < targetNumber
            : currentNumber <= targetNumber;
    }
    const equal = current === expected;
    return operator === "not_equals" ? !equal : equal;
  },

  _customConditionSymbol(element, value) {
    const rules = Array.isArray(element.condition_rules) ? element.condition_rules : [];
    const match = rules.find((rule) => this._customConditionMatches(value, rule.operator || "equals", rule.value || ""));
    if (match) return match.symbol || "●";
    if (rules.length) return element.default_symbol || "?";
    const active = new Set(String(element.on_values || "on,true,1,open,home").split(",").map((item) => item.trim().toLowerCase())).has(String(value).trim().toLowerCase());
    return active ? element.on_symbol || "●" : element.off_symbol || "○";
  },

  _customChartPreview(value) {
    let values = [];
    try {
      const parsed = JSON.parse(String(value || ""));
      if (Array.isArray(parsed)) values = parsed.map(Number).filter(Number.isFinite);
    } catch (_err) { /* Parse text below. */ }
    if (!values.length) values = String(value || "").split(/[;,\s]+/).map((item) => Number(item.replace(",", "."))).filter(Number.isFinite);
    values = values.slice(-16);
    if (!values.length) values = [2, 4, 3, 6, 5, 8, 7];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    return `<div class="custom-chart-bars">${values.map((item) => `<i style="height:${Math.max(10, Math.round(((item - min) / span) * 80 + 15))}%"></i>`).join("")}</div>`;
  },

  _renderCustomElementVisual(element) {
    const meta = this._customElementMeta(element.element_type);
    const value = this._customElementCurrentValue(element);
    if (element.element_type === "icon") {
      return `<div class="custom-visual icon">${element.icon_image ? `<img src="${this._escape(element.icon_image)}" alt="${this._escape(element.name || "Vlastní ikona")}">` : `<span class="custom-icon-empty"><ha-icon icon="mdi:image-plus-outline"></ha-icon><small>Přetáhněte sem obrázek</small></span>`}</div>`;
    }
    if (element.element_type === "chart") return `<div class="custom-visual chart"><small>${this._escape(element.label || element.name || "Graf")}</small>${this._customChartPreview(value)}</div>`;
    if (element.element_type === "status") {
      const symbol = this._customConditionSymbol(element, value);
      return `<div class="custom-visual status"><strong>${this._escape(symbol)}</strong><span>${this._escape(element.label || meta.label)}</span><small>Aktuálně: ${this._escape(value || "bez hodnoty")}</small></div>`;
    }
    return `<div class="custom-visual value"><small>${this._escape(element.label || meta.label)}</small><strong>${this._escape(value || "Hodnota")}${element.unit ? ` <em>${this._escape(element.unit)}</em>` : ""}</strong></div>`;
  },

  _renderCustomElementsWorkspace() {
    return this._renderLayeredHaDesigner();
    const form = this._customElementForm;
    const meta = this._customElementMeta(form.element_type);
    const result = this._customElementResult ? `<div class="custom-result ${this._customElementResult.ok ? "good" : "bad"}"><ha-icon icon="${this._customElementResult.ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${this._escape(this._customElementResult.message || this._customElementResult.error || "")}</div>` : "";
    const collections = this._customElementInspection?.collections || [];
    const selectedCollection = collections.find((item) => item.path === form.collection_path) || collections[0] || null;
    const collectionFields = selectedCollection?.fields || [];
    const valueFields = form.element_type === "chart" ? collectionFields.filter((field) => field.kind === "number") : collectionFields;
    const labelFields = collectionFields.filter((field) => field.kind === "text" || field.kind === "number");
    const columnOption = (field, selected) => `<option value="${this._escape(field.key)}" ${field.key === selected ? "selected" : ""}>${this._escape(field.key === "$value" ? "Přímo hodnoty seznamu" : field.key)} · ukázka: ${this._escape((field.preview || []).join(", "))}</option>`;
    const apiMapper = form.source_type === "url" ? `<div class="api-mapper"><div class="api-steps"><span class="done"><b>1</b>Adresa API</span><span class="${collections.length ? "done" : "active"}"><b>2</b>Datová sada</span><span class="${form.value_field ? "done" : ""}"><b>3</b>Přiřazení</span><span class="${form.sample_data ? "done" : ""}"><b>4</b>Náhled</span></div>${collections.length ? `<div class="api-mapping-grid"><div class="field"><label>1. Který seznam chcete použít?</label><select id="customCollectionPath"><option value="">Kořen odpovědi</option>${collections.map((collection) => `<option value="${this._escape(collection.path)}" ${collection.path === form.collection_path ? "selected" : ""}>${this._escape(collection.label)} · ${collection.count} ${Number(collection.count) === 1 ? "záznam" : "záznamů"}</option>`).join("")}</select></div><div class="field"><label>2. Co se má zobrazit${form.element_type === "chart" ? " jako hodnota grafu" : ""}?</label><select id="customValueField">${valueFields.length ? valueFields.map((field) => columnOption(field, form.value_field)).join("") : `<option value="">V této sadě není číselná hodnota</option>`}</select></div>${form.element_type === "chart" ? `<div class="field"><label>3. Co bude popisovat osu X?</label><select id="customLabelField"><option value="">Bez popisků</option>${labelFields.map((field) => columnOption(field, form.label_field)).join("")}</select></div>` : ""}</div><div class="api-mapping-summary"><ha-icon icon="mdi:check-decagram-outline"></ha-icon><div><strong>Výsledné přiřazení</strong><span>Hodnoty: <code>${this._escape(form.json_path || "—")}</code>${form.element_type === "chart" ? ` · Popisky: <code>${this._escape(form.label_json_path || "bez popisků")}</code>` : ""}</span></div></div>` : `<div class="api-mapper-empty"><ha-icon icon="mdi:database-search-outline"></ha-icon><div><strong>Nejdřív načtěte strukturu API</strong><span>Rozšíření samo rozdělí odpověď na seznamy a sloupce. Nemusíte znát ani psát JSON cestu.</span></div></div>`}</div>` : "";
    return `<div class="custom-elements-page">
      <section class="card custom-elements-hero"><div><span class="eyebrow">Knihovna pro všechny displeje</span><h2>Vytvořit vlastní prvek Home Assistantu</h2><p>Propojte eInk návrhy s entitou Home Assistantu nebo JSON adresou. Uložený prvek potom vložíte do jednoho návrhu nebo do všech nalezených displejů.</p></div><span class="custom-hero-icon"><ha-icon icon="mdi:puzzle-plus-outline"></ha-icon></span></section>
      ${result}
      <div class="custom-elements-layout">
        <section class="card custom-builder">
          <div class="section-title"><div><h2>Editor prvku</h2><div class="subtitle">${this._escape(meta.description)}</div></div><button id="customElementNew" class="secondary"><ha-icon icon="mdi:plus"></ha-icon>Nový</button></div>
          <div class="custom-type-grid">${["value", "status", "chart"].map((type) => { const item = this._customElementMeta(type); return `<button class="custom-type ${form.element_type === type ? "selected" : ""}" data-custom-type="${type}"><ha-icon icon="${item.icon}"></ha-icon><span>${item.label}</span></button>`; }).join("")}</div>
          <div class="field"><label>Název prvku</label><input data-custom-element-field="name" value="${this._escape(form.name)}" placeholder="Například Zásuvka v kuchyni"></div>
          <div class="row"><div class="field"><label>Zdroj dat</label><select data-custom-element-field="source_type"><option value="entity" ${form.source_type === "entity" ? "selected" : ""}>Entita Home Assistantu</option><option value="url" ${form.source_type === "url" ? "selected" : ""}>Webová adresa / JSON API</option></select></div><div class="field"><label>Barva</label><select data-custom-element-field="color"><option value="black" ${form.color === "black" ? "selected" : ""}>Černá</option><option value="red" ${form.color === "red" ? "selected" : ""}>Červená</option></select></div></div>
          ${form.source_type === "entity" ? `<div class="field"><label>Entita nebo Pomocník Home Assistantu</label><ha-entity-picker id="customElementEntity"></ha-entity-picker></div><div class="field"><label>Atribut entity (volitelné)</label><input data-custom-element-field="entity_attribute" value="${this._escape(form.entity_attribute)}" placeholder="Například prices"></div>` : `<div class="field"><label>HTTP/HTTPS adresa</label><input data-custom-element-field="url" value="${this._escape(form.url)}" placeholder="https://example.cz/data.json"></div><button id="customElementFetch" class="api-load-button" ${this._customElementBusy || !form.url ? "disabled" : ""}><ha-icon icon="mdi:database-import-outline"></ha-icon><span><strong>${this._customElementBusy ? "Načítám API..." : collections.length ? "Načíst strukturu znovu" : "Načíst strukturu API"}</strong><small>Bez ručního zadávání JSON cesty</small></span></button>${apiMapper}`}
          <div class="row"><div class="field"><label>Popisek</label><input data-custom-element-field="label" value="${this._escape(form.label)}" placeholder="Spotřeba"></div><div class="field"><label>Jednotka</label><input data-custom-element-field="unit" value="${this._escape(form.unit)}" placeholder="kWh"></div></div>
          ${form.element_type === "status" ? `<div class="row"><div class="field"><label>Symbol zapnuto</label><input data-custom-element-field="on_symbol" value="${this._escape(form.on_symbol)}"></div><div class="field"><label>Symbol vypnuto</label><input data-custom-element-field="off_symbol" value="${this._escape(form.off_symbol)}"></div></div><div class="field"><label>Hodnoty znamenající zapnuto</label><input data-custom-element-field="on_values" value="${this._escape(form.on_values)}"><small>Oddělujte čárkou, například on,true,1,open.</small></div>` : ""}
          ${form.element_type === "chart" ? `<div class="field"><label>Typ grafu</label><select data-custom-element-field="chart_type"><option value="line" ${form.chart_type === "line" ? "selected" : ""}>Spojnicový</option><option value="bar" ${form.chart_type === "bar" ? "selected" : ""}>Sloupcový</option><option value="area" ${form.chart_type === "area" ? "selected" : ""}>Plošný</option></select></div>` : ""}
          <div class="field"><label>Ukázková hodnota / data</label><textarea data-custom-element-field="sample_data" rows="3" placeholder="${form.element_type === "chart" ? "[1.2, 1.8, 1.4, 2.1]" : "Ukázka"}">${this._escape(form.sample_data)}</textarea></div>
          <div class="row"><div class="field"><label>Šířka prvku <strong>${form.width_percent} %</strong></label><input data-custom-element-field="width_percent" type="range" min="10" max="100" value="${form.width_percent}"></div><div class="field"><label>Výška prvku <strong>${form.height_percent} %</strong></label><input data-custom-element-field="height_percent" type="range" min="10" max="100" value="${form.height_percent}"></div></div>
          <div class="custom-builder-actions"><button id="customElementSave" ${this._customElementBusy || !form.name.trim() ? "disabled" : ""}><ha-icon icon="mdi:content-save-outline"></ha-icon>${form.id ? "Uložit změny" : "Přidat do knihovny"}</button></div>
        </section>
        <aside class="custom-side">
          <section class="card custom-live-preview"><div class="section-title"><h2>Živý náhled</h2><span class="pill muted">eInk</span></div>${this._renderCustomElementVisual(form)}</section>
          <section class="card custom-library"><div class="section-title"><div><h2>Moje prvky</h2><div class="subtitle">Dostupné ve všech návrzích</div></div><span class="pill muted">${this._customElements.length}</span></div>
            ${this._customElements.length ? `<div class="custom-library-list">${this._customElements.map((element) => { const item = this._customElementMeta(element.element_type); return `<article class="custom-library-item"><div class="custom-library-head"><span><ha-icon icon="${item.icon}"></ha-icon></span><div><strong>${this._escape(element.name)}</strong><small>${item.label} · ${element.source_type === "url" ? "URL" : this._escape(element.entity_id || "bez entity")}</small></div></div>${this._renderCustomElementVisual(element)}<div class="custom-library-actions"><button data-custom-insert="${element.id}"><ha-icon icon="mdi:vector-square-plus"></ha-icon>Do designeru</button><button class="secondary" data-custom-all="${element.id}"><ha-icon icon="mdi:monitor-multiple"></ha-icon>Do všech</button><button class="secondary icon-btn" data-custom-edit="${element.id}" title="Upravit"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button class="secondary icon-btn" data-custom-delete="${element.id}" title="Smazat"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div></article>`; }).join("")}</div>` : `<div class="inspector-empty"><ha-icon icon="mdi:puzzle-outline"></ha-icon><p>Zatím nemáte žádný vlastní prvek.</p></div>`}
          </section>
        </aside>
      </div>
    </div>`;
  },
};
