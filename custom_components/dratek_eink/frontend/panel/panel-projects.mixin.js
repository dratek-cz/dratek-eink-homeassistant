export const projectsMixin = {


  async _loadProjects() {
    if (!this._hass) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/projects/list" });
      this._projects = result.projects || [];
      this._render();
      this._paint();
    } catch (err) {
      this._error = this._message(err);
      this._render();
    }
  },

  _applyDraft(draft) {
    this._restoringDraft = true;
    const device = this._device();
    const source = this._normalizeStoredDraft(draft) || this._emptyDeviceDraft(device);
    this._orientation = source.orientation === "portrait" ? "portrait" : "landscape";
    this._displayTransform = source.display_transform || "rotate_cw";
    this._refreshIntervalSeconds = Math.max(30, Math.min(86400, Number(source.refresh_interval_seconds) || 60));
    this._invertColors = false;
    this._backgroundColor = ["white", "black", "red"].includes(source.background_color) ? source.background_color : "white";
    const size = this._displaySize(device);
    this._objects = structuredClone(source.objects);
    this._variables = structuredClone(source.variables);
    const led = source.rgb_led || {};
    this._rgbLed = {
      mode: ["off", "on", "flash"].includes(led.mode) ? led.mode : "off",
      color: /^#[0-9a-f]{6}$/i.test(led.color || "") ? led.color.toLowerCase() : "#00a2a5",
      flashTime: Math.max(1, Math.min(255, Number(led.flash_time) || 10)),
    };
    this._ledResult = null;
    this._selectedIds = [];
    this._selectedProjectId = source.id || "";
    this._projectName = source.name || (device ? `Navrh ${this._deviceTitle(device)}` : "Novy navrh");
    this._nextId = this._nextObjectId();
    if ((source.width && source.width !== size.width) || (source.height && source.height !== size.height)) {
      this._scaleDesign({ width: source.width || size.width, height: source.height || size.height }, size);
      this._selectedProjectId = "";
    }
    this._restoringDraft = false;
  },

  async _loadDeviceDraft(address) {
    if (!this._hass || !address) {
      this._applyDraft(null);
      return;
    }
    this._loadingDraft = true;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/device_drafts/load", address });
      this._deviceDrafts[String(address).toUpperCase()] = result.draft || null;
      this._saveCachedDeviceDrafts();
      this._applyDraft(result.draft || null);
      this._loadedDraftAddress = String(address).toUpperCase();
    } catch (err) {
      // Do NOT clear the canvas here. _applyDraft(null) would blank it, and the
      // next edit would then autosave that blank over the stored design - one
      // dropped websocket call (HA restarting, connection blip) used to destroy
      // the saved layout permanently. Leaving _loadedDraftAddress empty also
      // blocks autosave for this device until a load actually succeeds.
      this._loadedDraftAddress = "";
      this._sendResult = {
        ok: false,
        error: `Nepodarilo se nacist navrh displeje: ${this._message(err)}. Ulozeny navrh zustava zachovan, zkuste displej otevrit znovu.`,
        log: [],
      };
    } finally {
      this._loadingDraft = false;
    }
  },

  async _loadDevicePreviewDrafts(devices) {
    if (!this._hass || !Array.isArray(devices) || !devices.length) return;
    this._deviceDraftsLoading = true;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/device_drafts/list" });
      this._deviceDrafts = { ...this._deviceDrafts, ...(result.drafts || {}) };
    } catch (_bulkError) {
      const entries = await Promise.all(devices.map(async (device) => {
        const address = String(device.address || "").toUpperCase();
        if (!address) return null;
        try {
          const result = await this._hass.callWS({ type: "dratek_eink/device_drafts/load", address });
          return [address, result.draft || null];
        } catch (_err) {
          return null;
        }
      }));
      for (const entry of entries.filter(Boolean)) this._deviceDrafts[entry[0]] = entry[1];
    } finally {
      this._deviceDraftsLoading = false;
      this._saveCachedDeviceDrafts();
    }
  },

  /**
   * True once this device's stored draft has actually been read back.
   *
   * Autosave must never run before that: the canvas still holds whatever was
   * there previously (or nothing at all), and writing it out would overwrite
   * the design saved for this display.
   */
  _draftIsLoadedForSelectedDevice() {
    const selected = String(this._selectedDeviceAddress || "").toUpperCase();
    return !!selected && this._loadedDraftAddress === selected;
  },

  _scheduleDraftSave() {
    if (this._restoringDraft || !this._hass || !this._selectedDeviceAddress) return;
    if (!this._draftIsLoadedForSelectedDevice()) return;
    const device = this._device();
    if (device) this._deviceDrafts[String(device.address).toUpperCase()] = structuredClone(this._projectPayload(device));
    window.clearTimeout(this._draftSaveTimer);
    this._draftSaveTimer = window.setTimeout(() => this._saveCurrentDeviceDraft(), 700);
  },

  async _saveCurrentDeviceDraft() {
    if (this._restoringDraft || !this._hass || !this._selectedDeviceAddress) return;
    if (!this._draftIsLoadedForSelectedDevice()) return;
    window.clearTimeout(this._draftSaveTimer);
    this._draftSaveTimer = null;
    const device = this._device();
    if (!device) return;
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/device_drafts/save",
        address: device.address,
        draft: this._projectPayload(device),
      });
      this._deviceDrafts[String(device.address).toUpperCase()] = result.draft || this._projectPayload(device);
      this._saveCachedDeviceDrafts();
    } catch (err) {
      this._error = `Nepodarilo se ulozit pracovni navrh displeje: ${this._message(err)}`;
    }
  },

  _newProject() {
    this._fileMenuOpen = false;
    this._newProjectDialogOpen = true;
    this._render();
    this._paint();
  },

  _createBlankProject() {
    if (this._objects.length && !confirm("Nahradit aktualni navrh prazdnym projektem?")) return;
    this._pushHistory();
    this._objects = [];
    this._selectedIds = [];
    this._variables = {};
    this._invertColors = false;
    this._backgroundColor = "white";
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    this._nextId = 1;
    this._newProjectDialogOpen = false;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _clearDesign() {
    if (!this._objects.length || !confirm("Smazat vsechny objekty?")) return;
    this._pushHistory();
    this._objects = [];
    this._selectedIds = [];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _projectPayload(device = this._device()) {
    const size = this._displaySize(device);
    return {
      id: this._selectedProjectId || undefined,
      version: 1,
      name: this._projectName || "DRATEK eInk projekt",
      device_address: device ? device.address : this._selectedDeviceAddress,
      physical_code: device ? device.physical_code : "",
      sdk_type: device ? Number(device.sdk_type) : 75,
      orientation: this._orientation,
      display_transform: this._displayTransform,
      refresh_interval_seconds: this._refreshIntervalSeconds,
      invert_colors: this._invertColors,
      background_color: this._backgroundColor,
      width: size.width,
      height: size.height,
      variables: this._variables,
      rgb_led: {
        mode: this._rgbLed.mode,
        color: this._rgbLed.color,
        flash_time: this._rgbLed.flashTime,
      },
      objects: this._objects.map(({ _img, ...object }) => object),
    };
  },

  async _saveProject() {
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/projects/save", project: this._projectPayload() });
      this._selectedProjectId = result.project.id;
      this._projectName = result.project.name;
      await this._loadProjects();
    } catch (err) {
      alert(`Projekt se nepodarilo ulozit: ${this._message(err)}`);
    }
  },

  _downloadProjectFile() {
    const project = this._projectPayload();
    delete project.id;
    project.format = "dratek-eink-project";
    project.exported_at = new Date().toISOString();
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = String(project.name || "dratek-eink-projekt").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "dratek-eink-projekt";
    link.href = url;
    link.download = `${safeName}.dratek-eink.json`;
    link.click();
    URL.revokeObjectURL(url);
    this._fileMenuOpen = false;
    this._render();
    this._paint();
  },

  async _importProjectFile(file) {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text());
      if (!project || !Array.isArray(project.objects) || !Number(project.width) || !Number(project.height)) {
        throw new Error("Soubor neobsahuje platny editovatelny projekt DRATEK eInk.");
      }
      const orientation = project.orientation === "portrait" ? "portrait" : "landscape";
      const previousOrientation = this._orientation;
      this._orientation = orientation;
      const size = this._displaySize();
      if (Number(project.width) !== size.width || Number(project.height) !== size.height) {
        this._orientation = previousOrientation;
        throw new Error(`Projekt je pro rozliseni ${project.width}x${project.height}, aktualni displej ma ${size.width}x${size.height}.`);
      }
      this._orientation = previousOrientation;
      if (this._objects.length && !confirm("Nahradit aktualni navrh projektem ze souboru?")) {
        return;
      }
      this._pushHistory();
      this._orientation = orientation;
      this._objects = structuredClone(project.objects);
      this._variables = structuredClone(project.variables || {});
      this._displayTransform = project.display_transform || "rotate_cw";
      this._invertColors = false;
      this._backgroundColor = ["white", "black", "red"].includes(project.background_color) ? project.background_color : "white";
      this._projectName = project.name || "Importovany navrh";
      this._selectedProjectId = "";
      this._selectedIds = [];
      this._nextId = this._nextObjectId();
      this._fileMenuOpen = false;
      this._fitZoom();
      this._render();
      this._paint();
      this._scheduleDraftSave();
    } catch (err) {
      alert(`Projekt se nepodarilo otevrit: ${this._message(err)}`);
    }
  },

  async _loadSelectedProject() {
    if (!this._selectedProjectId) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/projects/load", project_id: this._selectedProjectId });
      const project = result.project;
      const previousOrientation = this._orientation;
      const previousTransform = this._displayTransform;
      this._orientation = project.orientation === "portrait" ? "portrait" : "landscape";
      this._displayTransform = project.display_transform || "rotate_cw";
      this._invertColors = false;
      this._backgroundColor = ["white", "black", "red"].includes(project.background_color) ? project.background_color : "white";
      const size = this._displaySize();
      if (project.width !== size.width || project.height !== size.height) {
        this._orientation = previousOrientation;
        this._displayTransform = previousTransform;
        alert(`Projekt je pro rozliseni ${project.width}x${project.height}, aktualni displej ma ${size.width}x${size.height}.`);
        return;
      }
      this._objects = Array.isArray(project.objects) ? project.objects : [];
      this._variables = project.variables || {};
      this._projectName = project.name || "DRATEK eInk projekt";
      this._selectedIds = [];
      this._nextId = this._nextObjectId();
      this._render();
      this._paint();
      this._scheduleDraftSave();
    } catch (err) {
      alert(`Projekt se nepodarilo nacist: ${this._message(err)}`);
    }
  },

  async _deleteProject() {
    if (!this._selectedProjectId || !confirm("Smazat ulozeny projekt z Home Assistantu?")) return;
    await this._hass.callWS({ type: "dratek_eink/projects/delete", project_id: this._selectedProjectId });
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    await this._loadProjects();
  },
};
