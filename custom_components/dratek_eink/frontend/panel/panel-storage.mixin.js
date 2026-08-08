export const storageMixin = {


  _loadUiPreference(key, fallback) {
    try {
      const value = window.localStorage.getItem(`dratek-eink-${key}`);
      return ["auto", "full", "large", "compact", "list", "cs", "en"].includes(value) ? value : fallback;
    } catch (_err) {
      return fallback;
    }
  },

  _saveUiPreference(key, value) {
    try { window.localStorage.setItem(`dratek-eink-${key}`, value); } catch (_err) { /* Browser storage can be disabled. */ }
  },

  _loadCachedScanResult() {
    try {
      const cached = JSON.parse(window.localStorage.getItem("dratek-eink-device-cache") || "null");
      if (!cached || !Array.isArray(cached.devices) || !cached.devices.length) return null;
      this._deviceCacheLoadedAt = Number(cached.saved_at) || 0;
      return { devices: cached.devices, debug: ["Displeje obnovené z lokální cache."], ble_devices: [] };
    } catch (_err) {
      return null;
    }
  },

  _saveCachedScanResult(result) {
    const devices = Array.isArray(result?.devices) ? result.devices : [];
    this._deviceCacheLoadedAt = Date.now();
    try {
      window.localStorage.setItem("dratek-eink-device-cache", JSON.stringify({ saved_at: this._deviceCacheLoadedAt, devices }));
    } catch (_err) { /* Browser storage can be disabled. */ }
  },

  _loadCachedDeviceDrafts() {
    try {
      const cached = JSON.parse(window.localStorage.getItem("dratek-eink-device-drafts-cache") || "{}");
      if (!cached || typeof cached !== "object" || Array.isArray(cached)) return {};
      return Object.fromEntries(Object.entries(cached).map(([address, draft]) => {
        if (!draft || typeof draft !== "object" || Array.isArray(draft)) return [address, null];
        const source = { ...draft };
        source.objects = Array.isArray(source.objects)
          ? source.objects.filter((item) => item && typeof item === "object" && !Array.isArray(item))
          : source.objects && typeof source.objects === "object"
            ? Object.values(source.objects).filter((item) => item && typeof item === "object" && !Array.isArray(item))
            : [];
        if (!source.variables || typeof source.variables !== "object" || Array.isArray(source.variables)) source.variables = {};
        return [String(address).toUpperCase(), source];
      }));
    } catch (_err) {
      return {};
    }
  },

  _saveCachedDeviceDrafts() {
    try {
      window.localStorage.setItem("dratek-eink-device-drafts-cache", JSON.stringify(this._deviceDrafts || {}));
    } catch (_err) { /* Large image drafts can exceed browser storage; server data remains authoritative. */ }
  },

  _mergeScanResult(nextResult, graceMs = 5 * 60 * 1000) {
    const now = Date.now();
    const previousDevices = new Map((this._result?.devices || []).map((device) => [String(device.address || "").toUpperCase(), device]));
    const devices = [];
    const seen = new Set();
    for (const source of nextResult?.devices || []) {
      const address = String(source.address || "").toUpperCase();
      if (!address || seen.has(address)) continue;
      seen.add(address);
      const previous = previousDevices.get(address);
      const lastSeenMs = source.temporarily_unseen
        ? Number(source.last_seen_at || 0) * 1000 || Number(previous?._last_seen_ms || this._deviceCacheLoadedAt || now)
        : now;
      devices.push({ ...previous, ...source, address: source.address || address, _last_seen_ms: lastSeenMs });
    }
    for (const [address, previous] of previousDevices) {
      if (seen.has(address)) continue;
      const lastSeenMs = Number(previous._last_seen_ms || Number(previous.last_seen_at || 0) * 1000 || this._deviceCacheLoadedAt || 0);
      if (lastSeenMs && now - lastSeenMs <= graceMs) {
        devices.push({ ...previous, temporarily_unseen: true, _last_seen_ms: lastSeenMs });
      }
    }
    return { ...(nextResult || {}), devices };
  },

  _hasFreshDeviceCache(maxAgeMs = 10 * 60 * 1000) {
    return Boolean(this._result?.devices?.length) && Date.now() - this._deviceCacheLoadedAt < maxAgeMs;
  },

  _defaultGatewayName() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = `${pad(now.getMinutes())}${pad(now.getHours())}${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
    return `dratek-eink-gateway_${stamp}`;
  },

  _emptyDeviceDraft(device = this._device()) {
    const size = this._displaySize(device);
    const code = device && device.physical_code ? device.physical_code : "novy-displej";
    return {
      version: 1,
      name: `Navrh ${code}`,
      device_address: device ? device.address : this._selectedDeviceAddress,
      sdk_type: device ? Number(device.sdk_type) : 75,
      orientation: this._orientation,
      display_transform: this._displayTransform,
      refresh_interval_seconds: 60,
      refresh_trigger_mode: "both",
      invert_colors: false,
      background_color: "white",
      width: size.width,
      height: size.height,
      variables: {},
      rgb_led: { mode: "off", color: "#00a2a5", flash_time: 10 },
      objects: [],
    };
  },

  _storedRecordList(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (value && typeof value === "object") return Object.values(value).filter((item) => item && typeof item === "object" && !Array.isArray(item));
    return [];
  },

  _normalizeStoredDraft(draft) {
    if (Array.isArray(draft)) return { ...this._emptyDeviceDraft(), objects: this._storedRecordList(draft) };
    if (!draft || typeof draft !== "object") return null;
    const source = { ...draft };
    source.objects = this._storedRecordList(source.objects);
    source.variables = source.variables && typeof source.variables === "object" && !Array.isArray(source.variables)
      ? source.variables
      : {};
    return source;
  },
};
