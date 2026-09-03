import { DRATEK_EINK_VERSION } from "./panel-constants.js?v=0.1.360";
import { DISPLAY_TEMPLATES, DISPLAY_TEMPLATE_CATALOG, DISPLAY_TEMPLATES_BY_ID } from "./templates/index.js?v=thermostat-live-dial-1";

// Generation of the graphic-row capture written into every series()/ratio()/
// day()/event()/transit binding. Bumped whenever the recorded box could move,
// so render.py can tell a trustworthy capture from one it must not clear and
// redraw blind. Must stay in step with GRAPHIC_BINDING_CAPTURE_VERSION in
// render.py.
//   1 - implied by its absence: boxes measured without `compact`, so inset a
//       few pixels from where the row was actually drawn (fixed in 0.1.346).
//   2 - boxes measured in the layout the document is really built from.
const GRAPHIC_BINDING_CAPTURE_VERSION = 2;
// Mirrors DISCOVERY_UNSEEN_GRACE_SECONDS in const.py. Only used when the
// backend payload predates out_of_range; the backend's own answer wins.
const DISPLAY_UNSEEN_GRACE_SECONDS = 3 * 60;

// The standard Czech civil name-day calendar, indexed [month][day - 1]
// (getMonth() is already 0-based). Days with no name day (state/religious
// holidays only, e.g. 1.1, 24.12) are "". Sourced from the public domain
// calendar data used by the WebChemistry/svatky project
// (github.com/WebChemistry/svatky), with holiday labels (Štědrý den, Den
// vítězství, ...) filtered out, keeping only person names. Mirrors
// automation.py's _CZECH_NAME_DAYS so a manual preview and an automatic
// refresh always agree.
const CZECH_NAME_DAYS = [
  ["", "Karina", "Radmila", "Diana", "Dalimil", "", "Vilma", "Čestmír", "Vladan", "Břetislav", "Bohdana", "Pravoslav", "Edita", "Radovan", "Alice", "Ctirad", "Drahoslav", "Vladislav", "Doubravka", "Ilona", "Běla", "Slavomír", "Zdeněk", "Milena", "Miloš", "Zora", "Ingrid", "Otýlie", "Zdislava", "Robin", "Marika"],
  ["Hynek", "Nela", "Blažej", "Jarmila", "Dobromila", "Vanda", "Veronika", "Milada", "Apolena", "Mojmír", "Božena", "Slavěna", "Věnceslav", "Valentýn", "Jiřina", "Ljuba", "Miloslava", "Gizela", "Patrik", "Oldřich", "Lenka", "Petr", "Svatopluk", "Matěj", "Liliana", "Dorota", "Alexandr", "Lumír", "Horymír"],
  ["Bedřich", "Anežka", "Kamil", "Stela", "Kazimír", "Miroslav", "Tomáš", "Gabriela", "Františka", "Viktorie", "Anděla", "Řehoř", "Růžena", "Rút, Matylda", "Ida", "Elena, Herbert", "Vlastimil", "Eduard", "Josef", "Světlana", "Radek", "Leona", "Ivona", "Gabriel", "Marián", "Emanuel", "Dita", "Soňa", "Taťána", "Arnošt", "Kvido"],
  ["Hugo", "Erika", "Richard", "Ivana", "Miroslava", "Vendula", "Heřman, Hermína", "Ema", "Dušan", "Darja", "Izabela", "Julius", "Aleš", "Vincenc", "Anastázie", "Irena", "Rudolf", "Valérie", "Rostislav", "Marcela", "Alexandra", "Evženie", "Vojtěch", "Jiří", "Marek", "Oto", "Jaroslav", "Vlastislav", "Robert", "Blahoslav"],
  ["", "Zikmund", "Alexej", "Květoslav", "Klaudie", "Radoslav", "Stanislav", "", "Ctibor", "Blažena", "Svatava", "Pankrác", "Servác", "Bonifác", "Žofie", "Přemysl", "Aneta", "Nataša", "Ivo", "Zbyšek", "Monika", "Emil", "Vladimír", "Jana", "Viola", "Filip", "Valdemar", "Vilém", "Maxmilián", "Ferdinand", "Kamila"],
  ["Laura", "Jarmil", "Tamara", "Dalibor", "Dobroslav", "Norbert", "Iveta, Slavoj", "Medard", "Stanislav", "Gita", "Bruno", "Antonie", "Antonín", "Roland", "Vít", "Zbyněk", "Adolf", "Milan", "Leoš", "Květa", "Alois", "Pavla", "Zdeňka", "Jan", "Ivan", "Adriana", "Ladislav", "Lubomír", "Petr, Pavel", "Šárka"],
  ["Jaroslava", "Patricie", "Radomír", "Prokop", "", "", "Bohuslava", "Nora", "Drahoslava", "Libuše, Amálie", "Olga", "Bořek", "Markéta", "Karolína", "Jindřich", "Luboš", "Martina", "Drahomíra", "Čeněk", "Ilja", "Vítězslav", "Magdeléna", "Libor", "Kristýna", "Jakub", "Anna", "Věroslav", "Viktor", "Marta", "Bořivoj", "Ignác"],
  ["Oskar", "Gustav", "Miluše", "Dominik", "Kristián", "Oldřiška", "Lada", "Soběslav", "Roman", "Vavřinec", "Zuzana", "Klára", "Alena", "Alan", "Hana", "Jáchym", "Petra", "Helena", "Ludvík", "Bernard", "Johana", "Bohuslav", "Sandra", "Bartoloměj", "Radim", "Luděk", "Otakar", "Augustýn", "Evelína", "Vladěna", "Pavlína"],
  ["Linda, Samuel", "Adéla", "Bronislav", "Jindřiška", "Boris", "Boleslav", "Regína", "Mariana", "Daniela", "Irma", "Denisa", "Marie", "Lubor", "Radka", "Jolana", "Ludmila", "Naděžda", "Kryštof", "Zita", "Oleg", "Matouš", "Darina", "Berta", "Jaromír", "Zlata", "Andrea", "Jonáš", "Václav", "Michal", "Jeroným"],
  ["Igor", "Olívie", "Bohumil", "František", "Eliška", "Hanuš", "Justýna", "Věra", "Štefan, Sára", "Marina", "Andrej", "Marcel", "Renáta", "Agáta", "Tereza", "Havel", "Hedvika", "Lukáš", "Michaela", "Vendelín", "Brigita", "Sabina", "Teodor", "Nina", "Beáta", "Erik", "Šarlota, Zoe", "", "Silvie", "Tadeáš", "Štěpánka"],
  ["Felix", "", "Hubert", "Karel", "Miriam", "Liběna", "Saskie", "Bohumír", "Bohdan", "Evžen", "Martin", "Benedikt", "Tibor", "Sáva", "Leopold", "Otmar", "Mahulena", "Romana", "Alžběta", "Nikola", "Albert", "Cecílie", "Klement", "Emílie", "Kateřina", "Artur", "Xenie", "René", "Zina", "Ondřej"],
  ["Iva", "Blanka", "Svatoslav", "Barbora", "Jitka", "Mikuláš", "Ambrož, Benjamín", "Květoslava", "Vratislav", "Julie", "Dana", "Simona", "Lucie", "Lýdie", "Radana", "Albína", "Daniel", "Miloslav", "Ester", "Dagmar", "Natálie", "Šimon", "Vlasta", "Adam, Eva", "", "Štěpán", "Žaneta", "Bohumila", "Judita", "David", "Silvestr"],
];

export const devicesMixin = {

  async _scan({ background = false } = {}) {
    if (!this._hass || this._scanInProgress) return;
    this._scanInProgress = true;
    if (!background) {
      this._loading = true;
      this._error = "";
      this._renderKeepingSearchFocus();
    }
    try {
      const scannedResult = await this._hass.callWS({ type: "dratek_eink/scan" });
      const nextResult = this._mergeScanResult(scannedResult);
      this._saveCachedScanResult(nextResult);
      const changed = this._deviceAddressSignature(this._result) !== this._deviceAddressSignature(nextResult);
      const presenceChanged = this._devicePresenceSignature(this._result) !== this._devicePresenceSignature(nextResult);
      const statusChanged = this._deviceStatusSignature(this._result) !== this._deviceStatusSignature(nextResult);
      this._result = nextResult;
      if (changed) await this._loadDevicePreviewDrafts(this._result.devices || []);
      if (background && (changed || presenceChanged || statusChanged)) {
        this._pendingDeviceBackgroundRender = true;
      }
      const found = (this._result?.devices || []).some((device) => device.address === this._selectedDeviceAddress);
      if (!found) this._selectedDeviceAddress = "";
      this._selectPreferredRoute(this._device());
    } catch (err) {
      if (!background) this._error = this._message(err);
    } finally {
      this._scanInProgress = false;
      if (!background) this._loading = false;
      const signature = this._deviceStatusSignature(this._result);
      const shouldRender = !background || signature !== this._lastRenderedDeviceSignature || this._pendingDeviceBackgroundRender;
      if (shouldRender && (!background || this._backgroundUiCanRender?.() !== false)) {
        this._pendingDeviceBackgroundRender = false;
        this._lastRenderedDeviceSignature = signature;
        this._renderKeepingSearchFocus();
      } else if (shouldRender) {
        this._pendingDeviceBackgroundRender = true;
      }
    }
  },

  _scheduleDeviceStatusPoll(delay = 30000) {
    window.clearTimeout(this._deviceStatusPollTimer);
    if (!this.isConnected || !this._hass) return;
    this._deviceStatusPollTimer = window.setTimeout(async () => {
      this._deviceStatusPollTimer = null;
      if (["devices", "topology"].includes(this._activeTab)) {
        await this._scan({ background: true });
      }
      this._scheduleDeviceStatusPoll();
    }, delay);
  },

  _deviceAddressSignature(result = this._result) {
    return (result?.devices || [])
      .map((device) => String(device.address || "").toUpperCase())
      .filter(Boolean)
      .sort()
      .join("|");
  },

  _devicePresenceSignature(result = this._result) {
    return (result?.devices || [])
      .map((device) => `${String(device.address || "").toUpperCase()}:${device.temporarily_unseen ? "stale" : "seen"}`)
      .sort()
      .join("|");
  },

  _deviceStatusSignature(result = this._result) {
    const scanner = Object.prototype.hasOwnProperty.call(result || {}, "scanner_count")
      ? `scanner:${Number(result.scanner_count || 0)}`
      : "scanner:unchecked";
    const devices = (result?.devices || [])
      .map((device) => {
        const preferredPath = device.preferred_path || null;
        return JSON.stringify({
          address: String(device.address || "").toUpperCase(),
          battery: device.battery ?? null,
          battery_percent: device.battery_percent ?? null,
          battery_voltage: device.battery_voltage ?? null,
          rssi: device.rssi ?? null,
          temporarily_unseen: !!device.temporarily_unseen,
          gateway_selection: device.gateway_selection || "",
          selected_gateway_id: device.selected_gateway_id || "",
          path_type: preferredPath?.type || "",
          path_id: preferredPath?.id || "",
          path_name: preferredPath?.name || "",
          path_rssi: preferredPath?.rssi ?? null,
          path_unavailable: !!preferredPath?.unavailable,
          topology_paths: (device.observed_paths || device.paths || [])
            .map((path) => `${path.type || ""}:${path.id || path.gateway_id || path.host || path.name || ""}:${path.rssi ?? ""}:${path.temporarily_unseen ? 1 : 0}`)
            .sort(),
        });
      })
      .sort()
      .join("|");
    return `${scanner}|${devices}`;
  },

  _device() {
    const devices = this._result ? this._result.devices : [];
    // _renderTemplatePhysicalDevicePreview scopes _renderingDeviceAddress to
    // whichever device's preview is actually being drawn (a device list can
    // render several at once). Every palette/size lookup here goes through
    // this same _device(), so without this it silently used whatever device
    // happens to be globally "selected" instead - e.g. a BWR-only display's
    // card showing yellow because a BWRY display was selected elsewhere.
    const address = this._renderingDeviceAddress || this._selectedDeviceAddress;
    return devices.find((device) => device.address === address) || null;
  },

  // The display the user has actually opened, never the one some render happens
  // to be scoped to. _device() deliberately answers "whose palette and size is
  // this drawing pass using", which is the right question for a preview and the
  // wrong one for a write: a leaked render scope made _saveCurrentDeviceDraft
  // address the wrong display and store the open display's settings - its
  // meteoradar country among them - under another display's address. Anything
  // that persists, sends or decides which draft is being edited resolves the
  // device here instead.
  _selectedDevice() {
    const devices = this._result ? this._result.devices : [];
    const address = this._selectedDeviceAddress;
    return devices.find((device) => device.address === address) || null;
  },

  // Render scopes nest and, because the renderers are async, overlap: two
  // repaints of the same display can both be inside _renderCurrentDisplayTemplateImage
  // at once. Saving the previous value and restoring it in a `finally` cannot
  // survive that - the second run captures the first run's value as "previous"
  // and puts it back after the first run has already restored null, leaving
  // _renderingDeviceAddress permanently pinned to a display nobody is looking
  // at. A stack of tokens removed by identity always unwinds to empty however
  // the runs interleave.
  _pushRenderingDevice(address) {
    const token = { address: address || null };
    (this._renderingDeviceStack ||= []).push(token);
    this._renderingDeviceAddress = token.address;
    return token;
  },

  _popRenderingDevice(token) {
    const stack = this._renderingDeviceStack || [];
    const index = stack.lastIndexOf(token);
    if (index >= 0) stack.splice(index, 1);
    this._renderingDeviceAddress = stack.length ? stack[stack.length - 1].address : null;
  },

  // Seconds since this display was last actually heard, from whichever source
  // heard it. Zero while it is being seen in every scan.
  _displayUnseenFor(device) {
    const reported = Number(device?.unseen_for);
    if (Number.isFinite(reported) && reported >= 0) return reported;
    if (!device?.temporarily_unseen) return 0;
    const lastSeen = Number(device?.last_seen_at || 0);
    if (!lastSeen) return 0;
    return Math.max(0, Math.round(Date.now() / 1000) - lastSeen);
  },

  // Whether the user should be told the display is unreachable. The backend
  // decides this against its own settle window; the fallback covers a payload
  // from an older backend that only carried temporarily_unseen.
  _displayIsOutOfRange(device) {
    if (typeof device?.out_of_range === "boolean") return device.out_of_range;
    if (!device?.temporarily_unseen) return false;
    return this._displayUnseenFor(device) > DISPLAY_UNSEEN_GRACE_SECONDS;
  },

  _displayReachabilityTitle(device) {
    if (!this._displayIsOutOfRange(device)) {
      const unseenFor = this._displayUnseenFor(device);
      return unseenFor
        ? `Displej je dostupný – naposledy se ohlásil před ${this._formatUnseenFor(unseenFor)}`
        : "Displej je dostupný";
    }
    return `Displej se neohlásil ${this._formatUnseenFor(this._displayUnseenFor(device))}`;
  },

  _formatUnseenFor(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    if (value < 90) return `${value} s`;
    const minutes = Math.round(value / 60);
    if (minutes < 90) return `${minutes} min`;
    return `${Math.round(minutes / 60)} h`;
  },

  _deviceTitle(device) {
    if (!device) return "Neni vybran displej";
    return device.display_name || device.physical_code || device.address;
  },

  async _saveDeviceName(address, name = this._deviceNameDraft) {
    const device = (this._result?.devices || []).find((item) => item.address === address);
    if (!device || !this._hass) return;
    this._deviceNameDraft = String(name ?? "");
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/devices/set_name",
        address,
        name: this._deviceNameDraft,
      });
      device.display_name = result.name || "";
      this._editingDeviceAddress = "";
      this._deviceNameDraft = "";
    } catch (err) {
      this._error = this._message(err);
    }
    this._render();
    this._paint();
  },

  async _saveDeviceGateway(address, gatewayId) {
    const device = (this._result?.devices || []).find((item) => item.address === address);
    if (!device || !this._hass) return;
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/devices/set_gateway",
        address,
        gateway_id: gatewayId || "",
      });
      device.gateway_selection = result.gateway_selection;
      device.selected_gateway_id = result.gateway_id || "";
      const gatewayPaths = (device.paths || [])
        .filter((path) => path.type === "gateway")
        .sort((left, right) => Number(right.rssi ?? -999) - Number(left.rssi ?? -999));
      if (result.gateway_id) {
        const gateway = (this._gateways || []).find((item) => String(item.id) === String(result.gateway_id));
        device.preferred_path = gatewayPaths.find((path) => String(path.id) === String(result.gateway_id)) || {
          type: "gateway",
          id: result.gateway_id,
          name: result.transport_name || gateway?.name || gateway?.host || "DRATEK eInk gateway",
          rssi: null,
          unavailable: true,
        };
      } else {
        device.preferred_path = gatewayPaths[0] || (device.paths || [])[0] || null;
      }
      device.rssi = device.preferred_path?.rssi;
      this._selectPreferredRoute(device);
      this._render();
      this._paint();
    } catch (err) {
      this._error = this._message(err);
      this._render();
      this._paint();
    }
  },

  _selectPreferredRoute(device) {
    const preferred = device && device.preferred_path;
    this._selectedGatewayId = preferred && preferred.type === "gateway" ? preferred.id : "";
  },

  _baseDisplaySize(device = this._device()) {
    const sdk = device ? Number(device.sdk_type) : 75;
    const sizes = {
      8: [212, 104], 11: [212, 104],
      40: [296, 128], 43: [296, 128], 46: [296, 128], 48: [296, 128], 51: [296, 128],
      64: [400, 300], 66: [400, 300], 72: [400, 300], 75: [400, 300], 78: [400, 300],
      104: [640, 384], 106: [640, 384], 122: [640, 384],
      136: [960, 640], 139: [960, 640], 142: [960, 640], 155: [960, 640],
      160: [250, 132], 192: [196, 96], 224: [640, 360],
      264: [250, 128], 267: [250, 128], 270: [250, 128],
      296: [800, 480], 299: [800, 480], 302: [800, 480], 310: [800, 480], 315: [800, 480], 318: [800, 480],
      328: [280, 480], 379: [1360, 480], 384: [168, 384], 386: [168, 384],
      480: [384, 168], 482: [384, 168], 552: [240, 416], 555: [240, 416], 558: [240, 416],
      654: [528, 768], 686: [200, 200], 2635: [960, 680], 2667: [792, 272],
      2670: [792, 272], 2699: [272, 792], 2702: [272, 792], 4408: [800, 480],
      4412: [800, 480], 4514: [210, 480], 4556: [1024, 576], 4610: [480, 210],
      4684: [400, 600], 4716: [1600, 1200],
    };
    const size = sizes[sdk] || [250, 128];
    return { width: size[0], height: size[1] };
  },

  _displaySize(device = this._device()) {
    const size = this._baseDisplaySize(device);
    return this._orientation === "portrait"
      ? { width: Math.min(size.width, size.height), height: Math.max(size.width, size.height) }
      : { width: Math.max(size.width, size.height), height: Math.min(size.width, size.height) };
  },

  _isPe29Device(device = this._device()) {
    return !!device && [40, 43, 46, 48, 51].includes(Number(device.sdk_type));
  },

  _displayPaletteColors(device) {
    return this._displaySupportsYellow(device)
      ? [["black", "Černá"], ["white", "Bílá"], ["red", "Červená"], ["yellow", "Žlutá"]]
      : [["black", "Černá"], ["white", "Bílá"], ["red", "Červená"]];
  },

  _displaySupportsYellow(device = this._device()) {
    const bwrySdkTypes = new Set([46]);
    const descriptor = `${device?.model || ""} ${device?.display_type || ""}`.toUpperCase();
    return bwrySdkTypes.has(Number(device?.sdk_type)) || descriptor.includes("BWRY");
  },

  _displayPaletteKey(device = this._device()) {
    return this._displaySupportsYellow(device) ? "bwry" : "bwr";
  },

  _paletteImageSrc(image, device = this._device()) {
    if (!image || typeof image === "string") return String(image || "");
    const key = this._displayPaletteKey(device);
    return String(image.variants?.[key] || image.src || image.source || "");
  },

  _importedImageRendererVersion() {
    return "bwr-optical-floyd-3";
  },

  _renderDisplayPaletteBookmarks(device) {
    const colors = this._displayPaletteColors(device);
    return `<span class="display-palette-strip" aria-label="Paleta displeje: ${colors.map(([, label]) => label.toLowerCase()).join(", ")}" title="Barvy podporované displejem">${colors.map(([color, label]) => `<i class="display-palette-color is-${color}" title="${label}"></i>`).join("")}</span>`;
  },

  _isLarge400Device(device = this._device()) {
    if (!device) return false;
    const size = this._baseDisplaySize(device);
    return Math.max(size.width, size.height) === 400 && Math.min(size.width, size.height) === 300;
  },

  _isWide800Device(device = this._device()) {
    if (!device) return false;
    const size = this._baseDisplaySize(device);
    return Math.max(size.width, size.height) === 800 && Math.min(size.width, size.height) === 480;
  },

  _transformOptions() {
    return [
      ["rotate_cw", "Otočit doprava"],
      ["rotate_ccw", "Otočit doleva"],
      ["rotate_cw_flip_lr", "Doprava + zrcadlit vodorovně"],
      ["rotate_cw_flip_tb", "Doprava + zrcadlit svisle"],
      ["rotate_ccw_flip_lr", "Doleva + zrcadlit vodorovně"],
      ["rotate_ccw_flip_tb", "Doleva + zrcadlit svisle"],
      ["none", "Bez transformace"],
      ["rotate_180", "Otočit o 180°"],
      ["flip_lr", "Jen zrcadlit vodorovně"],
      ["flip_tb", "Jen zrcadlit svisle"],
    ];
  },

  _setDisplayTransform(transform) {
    const valid = this._transformOptions().some(([value]) => value === transform);
    this._displayTransform = valid ? transform : "rotate_cw";
    this._scheduleDraftSave();
  },

  async _selectDevice(address, options = {}) {
    const { saveCurrent = true, render = true } = options;
    if (!address) return;
    const normalizedAddress = String(address).toUpperCase();
    if (
      normalizedAddress === String(this._selectedDeviceAddress || "").toUpperCase()
      && normalizedAddress === this._loadedDraftAddress
      && !options.forceLoad
    ) {
      if (render) {
        this._render();
        this._paint();
      }
      return;
    }
    if (saveCurrent) await this._saveCurrentDeviceDraft();
    this._selectedDeviceAddress = address;
    this._selectPreferredRoute((this._result?.devices || []).find((device) => device.address === address));
    await this._loadDeviceDraft(address);
    this._fitZoom();
    if (render) {
      this._render();
      this._paint();
    }
  },

  _renderTransformSelector(device) {
    if (!this._isPe29Device(device)) return "";
    const options = this._transformOptions()
      .map(([value, label]) => `<option value="${this._escape(value)}" ${this._displayTransform === value ? "selected" : ""}>${this._escape(label)}</option>`)
      .join("");
    return `<div class="transform-box"><div class="field"><label>Mapování 2,9&quot; displeje</label><select id="displayTransform">${options}</select></div><small>Pokud je obraz na PE29 posunutý, otočený nebo zrcadlený, změňte tuto volbu a návrh znovu odešlete. Volba se ukládá ke konkrétní BLE adrese displeje.</small></div>`;
  },

  _devicePreviewSize(device) {
    const address = String(device.address || "").toUpperCase();
    const draft = this._deviceDrafts[address] || null;
    const base = this._baseDisplaySize(device);
    const portrait = draft?.orientation === "portrait";
    const sourceWidth = Math.max(1, Number(draft?.width || (portrait ? Math.min(base.width, base.height) : Math.max(base.width, base.height))));
    const sourceHeight = Math.max(1, Number(draft?.height || (portrait ? Math.max(base.width, base.height) : Math.min(base.width, base.height))));
    return { width: sourceWidth, height: sourceHeight, draft };
  },

  _renderDeviceBarcode(value, horizontal = false) {
    const patterns = [
      "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
      "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
      "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
      "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
      "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
      "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
      "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
      "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
      "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
      "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
      "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
    ];
    const text = String(value || "00.00.00.00");
    const dataCodes = [...text].map((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 126 ? code - 32 : 0;
    });
    const startCode = 104;
    const checksum = (startCode + dataCodes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
    const symbols = [startCode, ...dataCodes, checksum, 106];
    let offset = 10;
    const bars = [];
    symbols.forEach((symbol) => {
      [...patterns[symbol]].forEach((moduleWidth, index) => {
        const width = Number(moduleWidth);
        if (index % 2 === 0) bars.push(horizontal
          ? `<rect x="${offset}" y="0" width="${width}" height="54"></rect>`
          : `<rect x="0" y="${offset}" width="54" height="${width}"></rect>`);
        offset += width;
      });
    });
    const totalHeight = offset + 10;
    const viewBox = horizontal ? `0 0 ${totalHeight} 54` : `0 0 54 ${totalHeight}`;
    return `<svg class="device-preview-barcode ${horizontal ? "horizontal" : "vertical"}" viewBox="${viewBox}" preserveAspectRatio="none" role="img" aria-label="Čárový kód ${this._escape(text)}">${bars.join("")}</svg>`;
  },

  // Geometrie rámečku displeje. Sdílí ji velký náhled na stránce displejů
  // i miniatura v mapě připojení, aby oba ukazovaly stejný tvar zařízení.
  _deviceFrameGeometry(device) {
    const draftSize = this._devicePreviewSize(device);
    const { draft } = draftSize;
    const hasSentPreview = String(draft?.preview_image || device?.preview_image || device?.last_image || "").startsWith("data:image/");
    const sourceWidth = hasSentPreview ? Math.max(1, Number(draft?.preview_width || draftSize.width)) : draftSize.width;
    const sourceHeight = hasSentPreview ? Math.max(1, Number(draft?.preview_height || draftSize.height)) : draftSize.height;
    const portraitLayout = sourceHeight > sourceWidth;
    const large400Layout = this._isLarge400Device(device);
    const wide800Layout = this._isWide800Device(device);
    const labelledLargeLayout = large400Layout || wide800Layout;
    const base = this._baseDisplaySize(device);
    const baseWidth = Math.max(base.width, base.height);
    const baseHeight = Math.min(base.width, base.height);
    const frameRatio = wide800Layout
      ? 1014 / 658
      : large400Layout
        ? 1039 / 898
      : Math.max(0.48, Math.min(3.7, (baseWidth / baseHeight) / 0.95));
    const frameWidth = Math.max(150, Math.round(baseWidth / (wide800Layout ? 0.9142 : large400Layout ? 0.77 : 0.76)));
    const frameHeight = Math.round(frameWidth / frameRatio);
    const frameRadius = Math.max(4, Math.min(28, Math.round(Math.min(frameWidth, frameHeight) * 0.06)));
    const outerWidth = portraitLayout ? frameHeight : frameWidth;
    const outerHeight = portraitLayout ? frameWidth : frameHeight;
    return { sourceWidth, sourceHeight, draft, portraitLayout, large400Layout, wide800Layout, labelledLargeLayout, baseWidth, frameRatio, frameWidth, frameHeight, outerWidth, outerHeight, frameRadius };
  },

  _renderDevicePreview(device, mode = "full", options = {}) {
    const address = String(device.address || "").toUpperCase();
    const catalogWordmark = options.catalogWordmark === true;
    const previewSizes = {
      full: { targetHeight: 190, minWidth: 108, maxWidth: 420 },
      large: { targetHeight: 190, minWidth: 120, maxWidth: 420 },
      compact: { targetHeight: 112, minWidth: 92, maxWidth: 260 },
      mini: { targetHeight: 30, minWidth: 22, maxWidth: 76 },
      template: { targetHeight: 470, minWidth: 250, maxWidth: 620 },
    };
    const previewMode = previewSizes[mode] ? mode : "full";
    const sizing = previewSizes[previewMode];
    const geometry = this._deviceFrameGeometry(device);
    const { sourceWidth, sourceHeight, draft, portraitLayout, wide800Layout, labelledLargeLayout, baseWidth } = geometry;
    const designerFrameRatio = geometry.frameRatio;
    const designerFrameWidth = geometry.frameWidth;
    const designerFrameHeight = geometry.frameHeight;
    const nativeOuterWidth = geometry.outerWidth;
    const nativeOuterHeight = geometry.outerHeight;
    const nativeOuterRatio = nativeOuterWidth / nativeOuterHeight;
    const previewWidth = Math.max(sizing.minWidth, Math.min(sizing.maxWidth, Math.round(sizing.targetHeight * nativeOuterRatio)));
    const designerFrameRadius = geometry.frameRadius;
    const pe29Layout = this._isPe29Device(device);
    const physicalCode = device.physical_code || "00.00.00.00";
    const hasPreviewContent = !!(
      draft?.preview_image ||
      (device.preview_image && String(device.preview_image).startsWith("data:image/")) ||
      (device.last_image && String(device.last_image).startsWith("data:image/"))
    );
    return `<div class="device-preview-wrap preview-${previewMode} ${catalogWordmark ? "catalog-device-preview" : ""}">
      <div class="device-preview-fit" style="--frame-ratio:${nativeOuterRatio.toFixed(4)};--preview-width:${previewWidth}px">
        <svg class="device-preview-designer-svg" viewBox="0 0 ${nativeOuterWidth} ${nativeOuterHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Náhled ${this._escape(sourceWidth)} × ${this._escape(sourceHeight)}">
          <foreignObject x="0" y="0" width="${nativeOuterWidth}" height="${nativeOuterHeight}">
            <div xmlns="http://www.w3.org/1999/xhtml" class="designer-device-stage device-preview-designer-copy designer-stage-${portraitLayout ? "portrait" : "landscape"}" style="--designer-stage-width:${nativeOuterWidth}px;--designer-stage-height:${nativeOuterHeight}px;--designer-frame-ratio:${designerFrameRatio.toFixed(4)};--designer-frame-width:${designerFrameWidth}px;--designer-frame-rotation:${portraitLayout ? "90deg" : "0deg"};--designer-screen-width:${sourceWidth}px;--designer-screen-height:${sourceHeight}px;--designer-body-width:${baseWidth}px;--device-frame-radius:${designerFrameRadius}px">
              <div class="designer-device-bezel ${pe29Layout ? "designer-device-pe29" : ""} ${labelledLargeLayout ? "designer-device-large400" : ""} ${wide800Layout ? "designer-device-wide800" : ""} designer-device-landscape">${labelledLargeLayout ? `<span class="device-large400-top-band"></span><span class="device-large400-bottom-band"><span class="device-large400-label">${this._renderDeviceBarcode(address, true)}<span class="device-large400-mac">${this._escape(address)}</span></span></span>` : pe29Layout ? `<span class="designer-device-identification"><span class="designer-device-code">${this._escape(physicalCode)}</span>${this._renderDeviceBarcode(physicalCode, false)}</span>` : `<span class="designer-device-code">${this._escape(physicalCode)}</span>`}</div>
              <div class="designer-device-screen">
                <canvas data-device-preview="${this._escape(address)}" data-source-width="${sourceWidth}" data-source-height="${sourceHeight}" width="${sourceWidth}" height="${sourceHeight}"></canvas>
                ${hasPreviewContent ? "" : catalogWordmark
                  ? `<div class="device-preview-empty catalog-eink-screen"><span class="catalog-eink-wordmark">Eink</span></div>`
                  : `<div class="device-preview-empty"><span><ha-icon icon="mdi:image-outline"></ha-icon>Prázdný návrh</span></div>`}
              </div>
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>`;
  },

  _deviceMatchesSearch(device, query) {
    const size = this._devicePreviewSize(device);
    const haystack = [
      device.display_name,
      device.model,
      device.address,
      device.physical_code,
      `${size.width}x${size.height}`,
      `${size.width}×${size.height}`,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  },

  _formatCountdownTime(seconds) {
    const sec = Math.max(0, Math.round(Number(seconds) || 0));
    if (sec >= 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return `${h}h ${m}m`;
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  },

  _startCountdownTicker() {
    if (this._countdownTicker) return;
    this._countdownTicker = window.setInterval(() => {
      this._tickCountdowns?.();
    }, 1000);
  },

  _stopCountdownTicker() {
    if (this._countdownTicker) {
      window.clearInterval(this._countdownTicker);
      this._countdownTicker = null;
    }
  },

  _tickCountdowns() {
    const root = this.shadowRoot;
    if (!root) return;
    const now = Date.now();

    root.querySelectorAll("[data-automation-countdown]").forEach((el) => {
      if (el.classList.contains("is-writing")) return;
      const nextTime = Number(el.dataset.nextTime) || 0;
      const interval = Math.max(10, Number(el.dataset.interval) || 600);
      let remainingSec = 0;
      if (nextTime > 0) {
        remainingSec = Math.max(0, Math.round((nextTime - now) / 1000));
      }
      const percent = Math.max(0, Math.min(100, Math.round((remainingSec / interval) * 100)));
      const tone = percent > 50 ? "good" : percent > 20 ? "warn" : "critical";

      const digitalEl = el.querySelector(".countdown-digital");
      if (digitalEl) digitalEl.textContent = this._formatCountdownTime(remainingSec);

      const fillEl = el.querySelector(".automation-progress-fill");
      if (fillEl) fillEl.style.width = `${percent}%`;

      el.classList.remove("tone-good", "tone-warn", "tone-critical");
      el.classList.add(`tone-${tone}`);
    });
  },

  _renderDeviceCards(devices) {
    if (!devices.length) {
      return `<div class="empty-state"><img class="empty-logo" src="${this._frontendAssetUrl("dratek-eink-logo.png")}" alt="DRATEK.CZ eInk"><h2>${this._loading ? "Hledám displeje v okolí" : "V okolí zatím není žádný displej"}</h2><p>${this._loading ? "Scan se spustil automaticky po otevření panelu." : "Hledání můžeš kdykoliv zopakovat tlačítkem Obnovit."}</p></div>`;
    }
    const query = String(this._deviceSearchQuery || "").trim().toLowerCase();
    const filtered = query ? devices.filter((device) => this._deviceMatchesSearch(device, query)) : devices;
    if (!filtered.length) {
      return `<div class="empty-state"><ha-icon icon="mdi:magnify-close"></ha-icon><h2>Žádný displej neodpovídá hledání</h2><p>Zkus jiný název, adresu nebo velikost, případně vyhledávání resetuj.</p></div>`;
    }
    const mode = this._effectiveViewMode(this._deviceViewMode, filtered.length);
    return `<div class="display-grid density-${mode}">${filtered.map((device) => {
      const battery = this._batteryInfo(device);
      const rssi = Number(device.rssi);
      const paths = device.paths || [];
      const preferredPath = device.preferred_path || paths[0];
      const previewSize = this._devicePreviewSize(device);
      // "Missed by the last scan" is not "gone". A display advertises
      // intermittently and an on-demand gateway scan is a window of a few
      // seconds, so one miss is routine - the card used to flip to "Čekám na
      // signál" for a display that was answering writes perfectly well. The
      // backend now says how long it has actually been silent (out_of_range,
      // see DISCOVERY_UNSEEN_GRACE_SECONDS); only that earns the warning.
      const temporarilyUnseen = this._displayIsOutOfRange(device);
      const editing = this._editingDeviceAddress === device.address;
      const writingJob = (this._queue?.jobs || []).find((job) =>
        job.status === "writing"
        && String(job.address || "").toUpperCase() === String(device.address || "").toUpperCase()
      );
      const recentlySucceededJob = writingJob ? null : (this._queue?.jobs || []).find((job) =>
        job.status === "succeeded"
        && String(job.address || "").toUpperCase() === String(device.address || "").toUpperCase()
        && Number(job.finished_at || 0) * 1000 >= Date.now() - 7000
      );
      const transferState = writingJob
        ? `<div class="display-writing-state" role="status" aria-live="polite"><ha-icon icon="mdi:progress-upload"></ha-icon><strong>Právě se nahrává</strong><span>${this._escape(writingJob.transport_name || writingJob.operation || "Zápis do displeje")}</span></div>`
        : recentlySucceededJob
          ? `<div class="display-uploaded-state" role="status" aria-live="polite"><ha-icon icon="mdi:check-circle"></ha-icon><strong>Úspěšně nahráno</strong><span>Displej se vykresluje</span></div>`
          : "";
      // A card represents the physical tag, not the current editor state. Its
      // canvas is therefore painted only from the last successfully written
      // snapshot. Before the first recorded write it stays honestly empty.
      const assignedTemplates = this._assignedDisplayTemplates(device);
      const cardPreview = this._renderDevicePreview(device, mode === "list" ? "mini" : mode);

      return `<article class="display-tile ${temporarilyUnseen ? "is-stale" : ""} ${writingJob ? "is-writing" : ""} ${recentlySucceededJob ? "is-uploaded" : ""}" data-device-card-settings="${this._escape(device.address)}" role="button" tabindex="0" aria-label="Upravit displej ${this._escape(this._deviceTitle(device))}">
        <header class="display-tile-header">
          <span class="display-online-dot ${temporarilyUnseen ? "stale" : ""}" title="${this._escape(this._displayReachabilityTitle(device))}"></span>
          <div class="display-tile-identity ${editing ? "is-editing" : ""}">${editing ? `<input class="display-name-inline" data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Například Kuchyň" aria-label="Název displeje">` : `<strong>${this._escape(this._deviceTitle(device))}</strong>`}<span>${this._escape(device.model || "eInk displej")} · ${this._escape(device.address)}</span></div>
          <span class="display-tile-tools">${this._renderDisplayPaletteBookmarks(device)}${editing ? `<button class="tile-icon-btn tile-save-name-btn" data-device-name-save="${this._escape(device.address)}" title="Uložit název" aria-label="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button>` : `<button class="tile-icon-btn" data-device-rename="${this._escape(device.address)}" title="${device.display_name ? "Přejmenovat displej" : "Pojmenovat displej"}" aria-label="${device.display_name ? "Přejmenovat displej" : "Pojmenovat displej"}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`}</span>
          ${mode === "list" ? `<span class="display-resolution"><ha-icon icon="mdi:aspect-ratio"></ha-icon>${previewSize.width} × ${previewSize.height}</span>` : ""}
          ${mode === "list" ? transferState : ""}
        </header>
        ${mode === "list"
          // The list row carries a thumbnail too - a list of displays with no
          // picture of any display was the one view where you could not tell them
          // apart at a glance. Its transfer state already sits in the header.
          ? `<div class="display-preview-slot">${cardPreview}</div>`
          : `<div class="display-preview-slot">${transferState}${cardPreview}</div>`}
        <div class="display-health">
          <div class="display-health-item display-battery-item" title="Baterie${Number.isFinite(battery.percent) ? ` ${battery.percent} %` : ""}${Number.isFinite(battery.voltage) ? ` · ${this._formatBatteryVoltage(battery.voltage)}` : ""}">${this._renderBatterySegments(battery.percent)}<strong class="health-value battery-value level-${this._batteryLevel(battery.percent)}">${Number.isFinite(battery.percent) ? `${battery.percent} %` : "-"}</strong></div>
          <div class="display-health-item display-signal-item" title="Síla signálu${Number.isFinite(rssi) ? ` ${rssi} dBm` : ""}">${this._renderSignalBars(rssi)}<strong class="health-value signal-value level-${this._signalLevel(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></div>
          <div class="display-health-item display-health-route ${temporarilyUnseen ? "stale" : ""}">
            <span class="health-route-icons"><ha-icon class="health-icon" icon="${temporarilyUnseen ? "mdi:bluetooth-off" : preferredPath?.type === "local" ? "mdi:bluetooth-connect" : "mdi:router-wireless"}"></ha-icon>${!temporarilyUnseen && preferredPath?.type !== "local" ? `<ha-icon class="health-icon health-icon-sub" icon="mdi:bluetooth" title="Displej je za gatewayí připojen přes BLE"></ha-icon>` : ""}</span>
            <span class="health-route-text"><small>Připojeno</small><strong>${temporarilyUnseen ? "Čekám na signál" : this._escape(preferredPath?.name || "Nedostupné")}</strong></span>
          </div>
        </div>
        <div class="display-tile-actions">
          ${assignedTemplates.includes("price") ? `
            <button type="button" class="display-sale-action-btn ${this._devicePriceSaleActive(device.address) ? "is-active" : ""}" data-device-price-sale="${this._escape(device.address)}" title="Nastavit akční slevu">
              <ha-icon icon="mdi:sale"></ha-icon>
              <span>AKCE / SLEVA</span>
            </button>
          ` : ""}
          <button class="display-settings-button" data-device-settings="${this._escape(device.address)}"><ha-icon icon="mdi:cog-outline"></ha-icon><span>Upravit displej</span></button>
        </div>
      </article>`;
    }).join("")}</div>
    ${this._renderPriceSaleDialog()}`;
  },

  // The cenovka dialog and the AKCE badge on a device card both belong to one
  // specific display, which is not necessarily the panel's globally selected
  // one - opening them straight from the device list used to show (and then
  // save) whatever display happened to be selected elsewhere. Both read that
  // display's own draft first and fall back to the live editor state only for
  // the display currently open in the editor, whose unsaved edits win.
  // Which key each field of the cenovka dialog has to be written under.
  //
  // This is the bug the whole dialog was built on. The renderer resolves a
  // template variable through _templateVariableMeta, whose key is derived from
  // the variable's *label* and its index - "price:0-nazev-zbozi",
  // "price:1-cena" and so on. The dialog instead wrote "price:tag-outline",
  // "price:currency-usd", ... - the variables' MDI *icon* names, which nothing
  // ever reads. It round-tripped perfectly (it read its own keys straight back)
  // so the dialog always showed what you last typed, and the display always
  // showed the sample apples. Only the AKCE switch worked, because an option
  // travels a different path entirely.
  //
  // Derived from the catalogue rather than restated as four literals, so
  // renaming a variable moves the dialog with it instead of silently
  // disconnecting it again.
  _priceTemplateBindingKeys() {
    const variables = DISPLAY_TEMPLATES_BY_ID?.price?.catalog?.variables || [];
    const keyAt = (index) => {
      const variable = variables[index];
      return variable ? `price:${this._templateVariableMeta(variable, index).key}` : "";
    };
    return {
      title: keyAt(0),
      price: keyAt(1),
      was: keyAt(2),
      code: keyAt(3),
      amount: keyAt(4),
      unitPrice: keyAt(5),
      origin: keyAt(6),
      grade: keyAt(7),
      validity: keyAt(8),
      lowest: keyAt(9),
      club: keyAt(10),
    };
  },

  // Reading a field back for the dialog, newest storage shape first.
  //
  // Drafts written before the key fix carry the icon-named keys. They are still
  // read here - not to render from, but so reopening the dialog shows the text
  // whoever set it up actually typed, and saving once moves it onto the key the
  // renderer reads.
  _devicePriceSaleField(bindings, key, legacyIcon, fallback = "") {
    for (const candidate of [key, key.replace(/^price:/, ""), `price:${legacyIcon}`, legacyIcon]) {
      if (candidate && bindings[candidate] !== undefined && bindings[candidate] !== "") {
        const stored = String(bindings[candidate]);
        // Stored the way the designer stores a typed value. The dialog shows
        // the text, not the storage form.
        if (stored.startsWith("literal:")) return stored.slice("literal:".length);
        // An entity binding is not editable text - the field stays on its
        // placeholder rather than offering an entity id to type over.
        if (stored.includes(".") || stored.startsWith("internal:")) return fallback;
        return stored;
      }
    }
    return fallback;
  },

  _devicePriceSaleBindings(address) {
    const upperAddr = String(address || "").toUpperCase();
    const draft = this._deviceDrafts?.[upperAddr] || {};
    const isSelected = !!upperAddr && upperAddr === String(this._selectedDeviceAddress || "").toUpperCase();
    return {
      ...(draft.template_config?.bindings || {}),
      ...(draft.bindings || {}),
      ...(isSelected ? this._displayTemplateBindings || {} : {}),
    };
  },

  // Delegated rather than restated: the badge and the tag it describes have to
  // answer from the same store in the same order, and keeping two copies of
  // that rule is exactly how they came to disagree.
  _devicePriceSaleActive(address) {
    return this._templateOptionState({ id: "price" }, "sale", address);
  },

  // Co se z napsaného kódu doopravdy vytiskne.
  //
  // Renderer si kontrolní číslici EAN dopočítá sám a případně přepíše - kód s
  // vadnou poslední číslicí se totiž načte na zboží, které neexistuje, což je
  // horší než cenovka bez kódu. Tichá oprava by ale byla past, takže dialog
  // rovnou ukazuje výsledek: typ symbolu a číslice, které pod ním budou.
  _priceSaleCodeNote(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return this._escape("Bez kódu se čárový kód na cenovku nevytiskne.");
    const encoded = this._barcodeModules?.(raw);
    if (!encoded) return this._escape("Tenhle kód nelze zakódovat - použijte číslice nebo běžné znaky bez diakritiky.");
    const kind = { ean13: "EAN-13", ean8: "EAN-8", code128: "Code 128" }[encoded.kind] || encoded.kind;
    if (encoded.text !== raw.replace(/\s/g, "")) {
      return `${this._escape(kind)} · ${this._escape("kontrolní číslice opravena na")} <strong>${this._escape(encoded.text)}</strong>`;
    }
    return `${this._escape(kind)} · ${this._escape("vytiskne se")} <strong>${this._escape(encoded.text)}</strong>`;
  },

  _renderPriceSaleDialog() {
    const address = this._activePriceSaleDeviceAddress;
    if (!address) return "";
    const devices = this._result?.devices || (typeof this._devices === "function" ? this._devices() : []);
    const device = devices.find((d) => String(d.address || "").toUpperCase() === String(address).toUpperCase())
      || { address, display_name: address };

    const bindings = this._devicePriceSaleBindings(address);
    const keys = this._priceTemplateBindingKeys();
    const field = (key, legacyIcon, fallback) => this._devicePriceSaleField(bindings, key, legacyIcon, fallback);

    const productTitle = field(keys.title, "tag-outline", "Jablka Golden");
    const oldPriceVal = field(keys.was, "cash-multiple", "199,90");
    const newPriceVal = field(keys.price, "currency-usd", "149,90");
    const productCode = field(keys.code, "barcode", "8594001234561");
    const amount = field(keys.amount, "weight", "");
    const unitPrice = field(keys.unitPrice, "scale-balance", "");
    const origin = field(keys.origin, "earth", "");
    const grade = field(keys.grade, "medal-outline", "");
    const validity = field(keys.validity, "calendar-range", "");
    const lowest = field(keys.lowest, "chart-timeline-variant", "");
    const club = field(keys.club, "card-account-details-outline", "");

    const summary = this._priceSaleSummary(oldPriceVal, newPriceVal);
    const derivedUnit = this._priceTagUnitPrice?.(newPriceVal, amount, "Kč") || "";

    const textField = (id, label, icon, value, placeholder, note = "") => `
      <div class="price-sale-input-group">
        <label for="${id}"><ha-icon icon="mdi:${icon}"></ha-icon> ${label}</label>
        <div class="price-sale-input-wrap">
          <input type="text" id="${id}" value="${this._escape(value)}" placeholder="${this._escape(placeholder)}">
        </div>
        ${note ? `<p class="price-sale-code-note" id="${id}Note">${note}</p>` : ""}
      </div>`;

    return `<div class="modal-backdrop price-sale-dialog-backdrop" data-price-sale-close>
      <section class="price-sale-dialog card" role="dialog" aria-modal="true">
        <header class="price-sale-header">
          <div class="price-sale-header-left">
            <span class="price-sale-badge-icon"><ha-icon icon="mdi:tag-outline"></ha-icon></span>
            <div class="price-sale-header-text">
              <h2>Nastavení Cenovky</h2>
              <p>${this._escape(device.display_name || device.address)} · Nastavení údajů a akce</p>
            </div>
          </div>
          <button type="button" class="price-sale-close-btn" data-price-sale-close aria-label="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button>
        </header>

        <div class="price-sale-body">
          <div class="price-sale-full-field">
            <label for="priceSaleTitle"><ha-icon icon="mdi:format-title"></ha-icon> Název produktu</label>
            <div class="price-sale-input-wrap">
              <input type="text" id="priceSaleTitle" value="${this._escape(productTitle)}" placeholder="Např. Jablka Golden">
            </div>
          </div>

          <div class="price-sale-inputs-grid">
            ${textField("priceSaleOldPrice", "Běžná / Původní cena", "currency-usd-off", oldPriceVal, "199,90")}
            ${textField("priceSaleNewPrice", "Akční cena (sleva)", "tag-text-outline", newPriceVal, "149,90")}
          </div>

          <div class="price-sale-inputs-grid">
            ${textField("priceSaleAmount", "Množství balení", "weight", amount, "1 kg / 0,75 l / 6 ks",
              this._priceSaleUnitNote(derivedUnit, unitPrice))}
            ${textField("priceSaleUnitPrice", "Měrná cena (nepovinné)", "scale-balance", unitPrice, derivedUnit || "149,90 Kč/kg")}
          </div>

          <div class="price-sale-inputs-grid">
            ${textField("priceSaleOrigin", "Země původu", "earth", origin, "ČR")}
            ${textField("priceSaleGrade", "Třída jakosti", "medal-outline", grade, "I. jakost")}
          </div>

          <div class="price-sale-full-field">
            <label for="priceSaleCode"><ha-icon icon="mdi:barcode"></ha-icon> Kód zboží / EAN (volitelné)</label>
            <div class="price-sale-input-wrap">
              <input type="text" id="priceSaleCode" value="${this._escape(productCode)}" placeholder="8594001234561">
            </div>
            <p class="price-sale-code-note" id="priceSaleCodeNote">${this._priceSaleCodeNote(productCode)}</p>
          </div>

          <div class="price-sale-inputs-grid">
            ${textField("priceSaleValidity", "Platnost akce", "calendar-range", validity, "do 15. 9.")}
            ${textField("priceSaleLowest", "Nejnižší cena za 30 dní", "chart-timeline-variant", lowest, "179,90 Kč")}
          </div>

          <div class="price-sale-full-field">
            <label for="priceSaleClub"><ha-icon icon="mdi:card-account-details-outline"></ha-icon> Klubová cena s věrnostní kartou (nepovinné)</label>
            <div class="price-sale-input-wrap">
              <input type="text" id="priceSaleClub" value="${this._escape(club)}" placeholder="129,90">
            </div>
          </div>

          <div class="price-sale-hero-summary">
            <div class="price-sale-summary-icon"><ha-icon icon="mdi:ticket-percent-outline"></ha-icon></div>
            <div class="price-sale-summary-text">
              <div class="summary-discount-row">
                <span class="summary-discount-badge">- ${summary.percent} %</span>
                <span class="summary-save-text">Ušetříte <strong>${this._escape(summary.saved)}</strong></span>
              </div>
              <small>Akce vysází cenu červeně, přeškrtne původní a přidá červený štítek se slevou. Podklad zůstane bílý, aby cenovka zůstala čitelná i z dálky.</small>
            </div>
          </div>
        </div>

        <footer class="price-sale-actions">
          <button type="button" class="price-sale-btn save-sale" data-price-sale-apply="${this._escape(address)}">
            <ha-icon icon="mdi:lightning-bolt"></ha-icon> Zapnout slevu (Červená AKCE na displej)
          </button>
          <button type="button" class="price-sale-btn turn-off" data-price-sale-disable="${this._escape(address)}">
            <ha-icon icon="mdi:circle-outline"></ha-icon> Použít běžnou cenu (Černobílá cenovka)
          </button>
        </footer>
      </section>
    </div>`;
  },

  // Both prices arrive as whatever a person typed, so the arithmetic is done on
  // the digits dug out of them rather than on a strict parse.
  _priceSaleSummary(oldValue, newValue) {
    const toNumber = (value) => {
      const match = String(value ?? "").replace(/\s| /g, "").replace(",", ".").match(/\d+(\.\d+)?/);
      return match ? Number(match[0]) : NaN;
    };
    const was = toNumber(oldValue);
    const now = toNumber(newValue);
    if (!Number.isFinite(was) || !Number.isFinite(now) || was <= 0 || now < 0 || now >= was) {
      return { percent: 0, saved: "0,00 Kč" };
    }
    return {
      percent: Math.round(((was - now) / was) * 100),
      saved: `${(was - now).toFixed(2).replace(".", ",")} Kč`,
    };
  },

  _priceSaleUnitNote(derived, stated) {
    if (stated) return this._escape("Měrnou cenu jste zadali ručně, dopočet se nepoužije.");
    if (derived) return `${this._escape("Dopočítá se na")} <strong>${this._escape(derived)}</strong>`;
    return this._escape("Doplňte jednotku (kg, g, l, ml, ks, m), ať jde měrná cena dopočítat.");
  },

  _renderDisplaySettingsPage() {
    const device = this._device();
    if (!device) {
      return `<section class="display-settings-page">
        <div class="card display-settings-panel"><h1>Displej nebyl nalezen</h1><p>Vraťte se na hlavní stránku a vyberte dostupný displej.</p></div>
      </section>`;
    }
    if (!["templates", "designer"].includes(this._displaySettingsView)) this._displaySettingsView = "templates";
    return `<section class="display-settings-page">
      ${this._displaySettingsView === "templates" ? this._renderDisplayTemplatesSection(device) : ""}
      ${this._displaySettingsView === "designer" ? this._renderDisplayTemplateEditor(device) : ""}
      ${this._renderTemplatePlacementDialog(device)}
      ${this._renderPriceSaleDialog()}
    </section>`;
  },

  // ------------------------------------------------------- setup guidance ---

  // What each template needs before it can show anything real.
  //
  // The three generic steps that used to sit in a hover tooltip were true of every
  // template and therefore told you nothing: a calendar template is useless until a
  // calendar integration exists, and nothing in the panel said so. Every entry below
  // names the integrations that produce the entities the template binds to, so the
  // answer to "why is this still showing sample data" is one click away.
  //
  // `domain` is what the integration puts in the entity id, which is also how the
  // dialog checks whether it is already installed. `core: true` means Home Assistant
  // ships it, so a documentation link is safe to offer; everything else is named
  // without a link, because promising a URL for a community integration that may have
  // moved is worse than not linking at all.
  _templateSetupRecipes() {
    return Object.fromEntries(DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, entry.setup]));
  },

  _hasEntityDomain(domain) {
    const states = this._hass?.states || {};
    const prefix = `${domain}.`;
    return Object.keys(states).some((entityId) => entityId.startsWith(prefix));
  },

  _templateSetupRecipe(template) {
    return this._templateSetupRecipes()[template?.id] || {
      summary: "Šablona zobrazuje hodnoty z entit Home Assistantu.",
      integrations: [],
      steps: [
        "Přetáhněte šablonu na náhled displeje vlevo.",
        "Klikněte na Nastavit a u jednotlivých údajů vyberte entity.",
      ],
    };
  },

  // One requirement per card, even when several integrations satisfy it.
  //
  // Alternatives used to be listed as separate cards, each with its own
  // status. Because the status is a domain check and alternatives share a
  // domain, they always agreed - so one missing weather integration showed as
  // three red "Chybí" badges, and installing Met.no turned AccuWeather and
  // OpenWeatherMap green too, claiming integrations the user does not have.
  // Entries that carry the same `oneOf` label are one requirement with one
  // status and the options listed inside it.
  _templateIntegrationGroups(recipe) {
    const states = this._hass?.states || {};
    const normalize = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const groups = [];
    const byLabel = new Map();
    for (const item of recipe.integrations || []) {
      const friendlyNames = new Set((item.entityFriendlyNames || []).map(normalize));
      const foundByPrefix = Array.isArray(item.entityPrefixes) && item.entityPrefixes.length
        && Object.keys(states).some((entityId) => item.entityPrefixes.some((prefix) => entityId.startsWith(prefix)));
      const foundByName = friendlyNames.size > 0 && Object.values(states).some((state) => friendlyNames.has(normalize(state?.attributes?.friendly_name)));
      const found = item.internal || ((item.entityPrefixes || []).length || friendlyNames.size
        ? foundByPrefix || foundByName
        : this._hasEntityDomain(item.domain));
      const documentationUrl = item.url || (item.core && !item.helper ? `https://www.home-assistant.io/integrations/${item.domain}/` : "");
      const option = { name: item.name, why: item.why, domain: item.domain, documentationUrl, linkLabel: item.linkLabel || "Dokumentace" };
      const label = item.oneOf || "";
      if (!label) {
        groups.push({ label: item.name, domain: item.domain, found, choice: false, options: [option] });
        continue;
      }
      const existing = byLabel.get(label);
      if (existing) {
        existing.options.push(option);
        // Any one of them satisfies the requirement.
        existing.found = existing.found || found;
        continue;
      }
      const group = { label, domain: item.domain, found, choice: true, options: [option] };
      byLabel.set(label, group);
      groups.push(group);
    }
    return groups;
  },

  _renderDisplayTemplateSetupDialog() {
    const templateId = this._displayTemplateSetupId;
    if (!templateId) return "";
    const template = this._displayTemplateCards().find((item) => item.id === templateId);
    if (!template) return "";
    const recipe = this._templateSetupRecipe(template);
    const integrations = this._templateIntegrationGroups(recipe).map((group) => {
      const option = group.options[0];
      const link = option.documentationUrl
        ? `<a href="${this._escape(option.documentationUrl)}" target="_blank" rel="noopener noreferrer">${this._escape(option.linkLabel)}</a>`
        : "";
      const detail = group.choice
        ? `Stačí jedna z možností: ${this._escape(group.options.map((entry) => entry.name).join(", "))}`
        : this._escape(option.why);
      return `<li class="template-setup-integration ${group.found ? "is-found" : "is-missing"}">
        <span class="template-setup-status"><ha-icon icon="mdi:${group.found ? "check-circle" : "alert-circle-outline"}"></ha-icon></span>
        <div><strong>${this._escape(group.label)}</strong><small>${detail}</small>
          <span class="template-setup-meta">${group.found ? `Nalezeno v Home Assistantu (${this._escape(group.domain)}.*)` : `Zatím nenalezeno – chybí entity ${this._escape(group.domain)}.*`} ${group.choice ? "" : link}</span>
        </div>
      </li>`;
    }).join("");
    const slots = template.variables.map((variable, index) => {
      const meta = this._templateVariableMeta(variable, index);
      const binding = this._templateBinding(template, meta);
      const automatic = meta.automatic;
      const resolved = automatic || (binding && !binding.startsWith("internal:"));
      return `<li class="${resolved ? "is-found" : "is-missing"}">
        <ha-icon icon="mdi:${resolved ? "check" : "help-circle-outline"}"></ha-icon>
        <strong>${this._escape(meta.label)}</strong>
        <span>${automatic ? "Doplní Home Assistant" : binding ? this._escape(binding) : "Nenalezeno – vyberte entitu ručně"}</span>
      </li>`;
    }).join("");
    return `<div class="modal-backdrop template-setup-backdrop" data-template-setup-close>
      <section class="template-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="templateSetupTitle">
        <header>
          <div><small>Jak zprovoznit šablonu</small><h2 id="templateSetupTitle">${this._escape(template.title)}</h2></div>
          <button type="button" class="ghost" data-template-setup-close aria-label="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button>
        </header>
        <p class="template-setup-summary">${this._escape(recipe.summary)}</p>
        ${integrations ? `<h3><ha-icon icon="mdi:puzzle-outline"></ha-icon>Co je potřeba v Home Assistantu</h3>
        <ul class="template-setup-integrations">${integrations}</ul>` : ""}
        <h3><ha-icon icon="mdi:format-list-numbered"></ha-icon>Postup</h3>
        <ol class="template-setup-steps">${(recipe.steps || []).map((step) => `<li>${this._escape(step)}</li>`).join("")}</ol>
        <h3><ha-icon icon="mdi:database-search-outline"></ha-icon>Údaje šablony</h3>
        <ul class="template-setup-slots">${slots}</ul>
        ${recipe.note ? `<p class="template-setup-note"><ha-icon icon="mdi:information-outline"></ha-icon>${this._escape(recipe.note)}</p>` : ""}
        <div class="template-setup-actions">
          <button type="button" data-display-template-open="${this._escape(template.id)}"><ha-icon icon="mdi:tune-variant"></ha-icon>Nastavit šablonu</button>
          <button type="button" class="secondary" data-template-setup-close>Zavřít</button>
        </div>
      </section>
    </div>`;
  },

  // A miniature of the actual split: both templates rendered through the same
  // catalog-thumbnail renderer used everywhere else, just sized to the half
  // (or whole) they would occupy. This is what makes the choice legible - a
  // label like "Nahoře" does not say whether the weather template's footer
  // survives being squeezed into a quarter of the display, but the thumbnail
  // does.
  _renderTemplatePlacementPreview(slotIndex, assigned, templates, nextTemplate, width, height, layout) {
    const preview = (template, slotWidth, slotHeight) => this._renderDisplayTemplateCatalogPreview(
      template, slotWidth >= slotHeight ? "landscape" : "portrait", { width: slotWidth, height: slotHeight },
    );
    const slots = this._displayTemplateLayoutSlots(layout, width, height);
    const blank = templates.find((item) => item.id === "blank");
    const bodies = slots.map((slot, index) => {
      const current = templates.find((item) => item.id === assigned[index]) || blank;
      const template = index === slotIndex ? nextTemplate : current;
      const style = `left:${slot.x / width * 100}%;top:${slot.y / height * 100}%;width:${slot.w / width * 100}%;height:${slot.h / height * 100}%`;
      return `<span class="template-placement-slot ${index === slotIndex ? "is-incoming" : "is-existing"}" style="${style}">${preview(template, slot.w, slot.h)}<b>${index + 1}</b></span>`;
    }).join("");
    return `<span class="template-placement-preview layout-${layout}" style="aspect-ratio:${width}/${height}">${bodies}</span>`;
  },

  // Where a second (or third, replacing one of two) template goes when the
  // display already carries at least one full-size one. Dragging straight
  // onto an edge of the preview picks this in one gesture already (see the
  // drop-zone cross in the dropzone markup below); this dialog is the same
  // five choices for anyone who clicked the template tile instead of
  // dragging it.
  _renderTemplatePlacementDialog(device) {
    const pending = this._pendingDisplayTemplateConflict;
    if (!pending?.templateId) return "";
    const templates = this._displayTemplateCards();
    const nextTemplate = templates.find((item) => item.id === pending.templateId);
    if (!nextTemplate) return "";
    const assigned = this._assignedDisplayTemplates(device);
    const size = this._devicePreviewSize(device);
    const orientation = this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait";
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    const previewWidth = orientation === "landscape" ? long : short;
    const previewHeight = orientation === "landscape" ? short : long;
    // A "single" layout with its one slot already occupied no longer opens
    // this dialog at all - hasTemplateSlotConflict in panel-inspector.mixin.js
    // treats "single" as a plain replace regardless of occupancy, and the
    // drag/drop path assigns straight into slot-0 without ever going through
    // _pendingDisplayTemplateConflict. This stand-in is kept only as a defensive
    // fallback in case something else sets that state for a "single" layout in
    // the future; it swaps in the two-up split so the picker would have a real
    // second destination instead of a lone "Celý displej" that would just
    // replace what's already there.
    const dialogLayoutId = assigned.length && this._displayTemplateLargeLayout === "single"
      ? "side-by-side"
      : this._displayTemplateLargeLayout;
    const layoutDefinition = this._displayTemplateLayoutDefinition(dialogLayoutId);
    const slots = this._displayTemplateLayoutSlots(layoutDefinition.id, previewWidth, previewHeight);
    const options = slots.map((slot, index) => {
      const current = templates.find((item) => item.id === assigned[index]);
      const orientationLabel = slot.w >= slot.h ? "na šířku" : "na výšku";
      const hint = current && current.id !== "blank"
        ? `Nahradí šablonu „${this._escape(current.title)}“.`
        : `Volné místo · ${orientationLabel}.`;
      return { index, label: layoutDefinition.id === "single" ? "Celý displej" : `${index + 1}. pozice`, hint };
    });
    const description = `Aktivní rozložení <strong>${this._escape(layoutDefinition.label)}</strong>. Vyberte přímo místo, do kterého se šablona vloží.`;
    return `<div class="modal-backdrop template-space-dialog-backdrop">
      <section class="template-space-dialog" role="dialog" aria-modal="true" aria-labelledby="templateSpaceDialogTitle">
        <span class="template-space-dialog-icon"><ha-icon icon="mdi:view-dashboard-edit-outline"></ha-icon></span>
        <div>
          <small>Umístění do rozložení</small>
          <h2 id="templateSpaceDialogTitle">Kam umístit šablonu „${this._escape(nextTemplate.title)}“?</h2>
          <p>${description}</p>
        </div>
        <div class="template-placement-options">
          ${options.map(({ index, label, hint }) => `<button type="button" class="template-placement-option is-slot" data-template-placement="slot-${index}">
            ${this._renderTemplatePlacementPreview(index, assigned, templates, nextTemplate, previewWidth, previewHeight, layoutDefinition.id)}
            <span class="template-placement-option-text"><strong>${label}</strong><small>${hint}</small></span>
          </button>`).join("")}
        </div>
        <div class="template-space-dialog-actions">
          <button type="button" class="ghost" data-template-placement="cancel">Zrušit</button>
        </div>
      </section>
    </div>`;
  },

  _displayDesignMode(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const draft = this._deviceDrafts?.[address] || null;
    const explicitMode = String(draft?.design_mode || draft?.designMode || "").toLowerCase();
    if (["templates", "custom", "ha"].includes(explicitMode)) return explicitMode;
    const objects = this._storedRecordList(draft?.objects);
    if (objects.some((object) => object.type === "layered" || object.customElementId || object.custom_element_id)) return "ha";
    const projectName = String(draft?.name || "").toLowerCase();
    if (projectName.startsWith("sablona ") || projectName.startsWith("šablona ") || projectName.startsWith("template ")) return "templates";
    return "custom";
  },

  _displayTemplateCards() {
    const userTemplates = (this._userDisplayTemplates || [])
      .filter((template) => template && String(template.id || "").startsWith("user-template-"))
      .map((template) => ({
        ...structuredClone(template),
        id: String(template.id),
        title: String(template.title || "Vlastní šablona"),
        variables: Array.isArray(template.variables) ? template.variables : [],
        user_created: true,
        kind: "custom",
      }));
    const templates = [
      { id: "blank", number: "00", category: "custom", title: "Prázdná šablona", variables: [] },
      ...userTemplates,
      ...DISPLAY_TEMPLATE_CATALOG,
    ];
    const prepared = new Set(["blank", ...DISPLAY_TEMPLATES.filter((entry) => entry.prepared).map((entry) => entry.catalog.id)]);

    return templates.map((template) => ({
      ...template,
      kind: template.user_created ? "custom" : prepared.has(template.id) ? "prepared" : "custom",
    }));
  },

  _prepareDisplayTemplateBindings(template) {
    if (!template) return;
    this._displayTemplateBindings ||= {};
    const weatherEntity = template.id === "weather"
      ? Object.keys(this._hass?.states || {}).find((entityId) => entityId.startsWith("weather."))
      : "";
    const czSpotBindings = template.id === "cz_spot_prices" ? this._czSpotTemplateBindings() : {};
    template.variables.forEach((variable, index) => {
      const meta = this._templateVariableMeta(variable, index);
      const key = `${template.id}:${meta.key}`;
      if (Object.prototype.hasOwnProperty.call(this._displayTemplateBindings, key) && this._displayTemplateBindings[key] && template.id !== "cz_spot_prices") return;
      if (meta.automatic) {
        this._displayTemplateBindings[key] = `internal:${meta.key}`;
        return;
      }
      const suggested = weatherEntity || czSpotBindings[index] || (template.id === "cz_spot_prices" ? "" : this._suggestTemplateEntity(meta));
      if (suggested || !this._displayTemplateBindings[key]) this._displayTemplateBindings[key] = suggested;
    });
  },

  // Whether a template's data slots actually point at real entities yet, as
  // opposed to still showing sample data. Automatic slots (time, date, …) do
  // not count - they never need a user choice. A template with no non-automatic
  // slots at all (blank, a user-drawn template, the radar map) has nothing to
  // configure, so it is reported as "complete" rather than "empty": there is no
  // unset state for a card that never asks for one.
  _templateBindingStatus(template) {
    if (template?.id === "transport") {
      // The second stop is optional, so it is never counted as missing - a
      // board watching one stop is a finished configuration, not a half one.
      const configured = Boolean(String(this._displayTemplateConfig?.transit_stop_id || "").trim());
      return { total: 1, done: configured ? 1 : 0, state: configured ? "complete" : "empty" };
    }
    const variables = Array.isArray(template?.variables) ? template.variables : [];
    const bindings = this._displayTemplateBindings || {};
    let total = 0;
    let done = 0;
    variables.forEach((variable, index) => {
      const meta = this._templateVariableMeta(variable, index);
      if (meta.automatic) return;
      total += 1;
      const value = bindings[`${template.id}:${meta.key}`];
      if (typeof value === "string" && value.trim()) done += 1;
    });
    if (!total) return { total: 0, done: 0, state: "complete" };
    if (done >= total) return { total, done, state: "complete" };
    if (done > 0) return { total, done, state: "partial" };
    return { total, done, state: "empty" };
  },

  // A visible warning, not a lock. Sample data is still a valid thing to send
  // to an eInk display, so only its explicit Configure button catches pointer
  // events and the send button remains governed solely by whether a template
  // is present. The same fragment is used in the catalog and on the physical
  // display preview.
  //
  // There is no longer a "you can still send it" chip beside the button. It
  // was reassurance for a restriction that does not exist - nothing here has
  // ever been disabled - and it read as a second, competing action next to
  // the one button that actually does something. The layer itself carries
  // that meaning now by being mostly transparent: you can see the template
  // through it, so it does not look like a blocked screen.
  _renderTemplateConfigurationWarning(template, status = null) {
    const current = status || this._templateBindingStatus(template);
    if (!current || current.state === "complete") return "";
    const partial = current.state === "partial";
    return `<span class="template-unconfigured-warning is-${partial ? "partial" : "empty"}" aria-label="${partial ? "Nastavení šablony není dokončené" : "Šablona není nastavená"}">
      <span class="template-unconfigured-warning-content">
        <ha-icon icon="mdi:${partial ? "progress-alert" : "alert-circle-outline"}"></ha-icon>
        <strong>${partial ? "Nastavení není dokončené" : "Šablona není nastavená"}</strong>
        <small>${partial ? "Část hodnot stále používá ukázková data" : "Zobrazuje zatím ukázková data"}</small>
        <span class="template-unconfigured-warning-actions">
          <button type="button" data-display-template-configure="${this._escape(template.id)}" title="Nastavit zdroje dat šablony ${this._escape(template.title)}"><ha-icon icon="mdi:database-cog-outline"></ha-icon>Nastavit</button>
        </span>
      </span>
    </span>`;
  },

  _czSpotTemplateBindings() {
    const states = this._hass?.states;
    if (!states) return {};
    if (this._czSpotCacheStates === states && this._czSpotCacheResult) {
      return this._czSpotCacheResult;
    }
    const entityIds = Object.keys(states);
    const usable = (entityId) => entityId && states[entityId] && !["unavailable", "unknown"].includes(String(states[entityId].state).toLowerCase());

    const findEntity = (base, duplicate = "") => {
      const preferred = duplicate ? `${base}${duplicate}` : base;
      if (usable(preferred)) return preferred;
      if (usable(base)) return base;
      return entityIds.find((entityId) => entityId === preferred || entityId.startsWith(`${base}_`)) || "";
    };

    let sensorEntries = null;
    const getSensorEntries = () => {
      if (sensorEntries) return sensorEntries;
      const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      sensorEntries = entityIds
        .filter((entityId) => entityId.startsWith("sensor.") && usable(entityId))
        .filter((entityId) => {
          const fn = states[entityId]?.attributes?.friendly_name || "";
          return /spot|electr|elektr|cena|price/i.test(entityId) || /spot|electr|elektr|cena|price/i.test(fn);
        })
        .map((entityId) => {
          const friendlyName = normalize(states[entityId]?.attributes?.friendly_name);
          return { entityId, friendlyName, searchable: normalize(`${entityId} ${friendlyName}`) };
        });
      return sensorEntries;
    };

    const findNamedEntity = (aliases, excluded = []) => {
      const entries = getSensorEntries();
      const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const wanted = aliases.map(normalize);
      const rejected = excluded.map(normalize);
      const allowed = (entry) => !rejected.some((term) => entry.searchable.includes(term));
      return entries.find((entry) => allowed(entry) && wanted.includes(entry.friendlyName))?.entityId
        || entries.find((entry) => allowed(entry) && wanted.some((term) => entry.searchable.includes(term)))?.entityId
        || "";
    };

    const currentCandidates = [
      "sensor.current_buy_electricity_price_15min",
      "sensor.current_buy_electricity_price",
      "sensor.current_spot_electricity_price_15min",
      "sensor.current_spot_electricity_price",
    ];
    let current = currentCandidates.map((base) => findEntity(base)).find(Boolean) || "";
    if (!current) current = findNamedEntity(["Aktuální spotová cena elektřiny", "Current spot electricity price"], ["je nejlevnější", "is cheapest"]);
    if (!current) {
      current = entityIds.find((entityId) => {
        if (!entityId.startsWith("sensor.")) return false;
        const state = states[entityId];
        const attributes = state?.attributes || {};
        const timestampCount = Object.keys(attributes).filter((key) => (key.startsWith("20") || key.includes("T")) && !Number.isNaN(Date.parse(key))).length;
        const name = `${entityId} ${attributes.friendly_name || ""}`.toLowerCase();
        return timestampCount >= 20 && name.includes("electric") && name.includes("price");
      }) || "";
    }
    const match = current ? current.match(/^sensor\.current_(buy|spot)_electricity_price(_15min)?(_\d+)?$/) : null;
    let result;
    if (match) {
      const trade = match[1];
      const interval = match[2] || "";
      const duplicate = match[3] || "";
      const orderInterval = interval ? "15min" : "hour";
      const tMin = findEntity(`sensor.${trade}_cheapest_electricity_today${interval}`, duplicate);
      const tMax = findEntity(`sensor.${trade}_most_expensive_electricity_today${interval}`, duplicate);
      const tmMin = findEntity(`sensor.${trade}_cheapest_electricity_tomorrow${interval}`, duplicate);
      const tOrder = findEntity(`sensor.current_${trade}_electricity_${orderInterval}_order`, duplicate);
      if (tMin && tMax && tmMin && tOrder) {
        result = { 0: current, 1: current, 2: tMin, 3: tMax, 4: tmMin, 5: tOrder };
      }
    }
    if (!result) {
      const named = {
        todayMin: findNamedEntity(["Dnešní nejlevnější spotová cena elektřiny", "Spot cheapest electricity today"]),
        todayMax: findNamedEntity(["Dnešní nejdražší spotová cena elektřiny", "Spot most expensive electricity today"]),
        tomorrowMin: findNamedEntity(["Zítřejší nejlevnější spotová cena elektřiny", "Spot cheapest electricity tomorrow"]),
        todayOrder: findNamedEntity(["Dnešní pořadí hodin spotových cen elektřiny", "Current spot electricity hour order", "Current spot electricity 15min order"]),
      };
      if (!match) {
        result = { 0: current, 1: current, 2: named.todayMin, 3: named.todayMax, 4: named.tomorrowMin, 5: named.todayOrder };
      } else {
        const trade = match[1];
        const interval = match[2] || "";
        const duplicate = match[3] || "";
        const orderInterval = interval ? "15min" : "hour";
        result = {
          0: current,
          1: current,
          2: findEntity(`sensor.${trade}_cheapest_electricity_today${interval}`, duplicate) || named.todayMin,
          3: findEntity(`sensor.${trade}_most_expensive_electricity_today${interval}`, duplicate) || named.todayMax,
          4: findEntity(`sensor.${trade}_cheapest_electricity_tomorrow${interval}`, duplicate) || named.tomorrowMin,
          5: findEntity(`sensor.current_${trade}_electricity_${orderInterval}_order`, duplicate) || named.todayOrder,
        };
      }
    }
    this._czSpotCacheStates = states;
    this._czSpotCacheResult = result;
    return result;
  },

  _templateLiveDataChanged(previousHass, nextHass) {
    if (!previousHass?.states || !nextHass?.states || this._activeTab !== "display-settings") return false;
    const watched = new Set(Object.values(this._displayTemplateBindings || {}).filter((value) => typeof value === "string" && !value.startsWith("internal:") && !value.startsWith("literal:")));
    Object.keys(nextHass.states)
      .filter((entityId) => /^(sensor|binary_sensor)\.(?:current_)?(?:buy|spot)_.*electricity|^sensor\.(?:buy|spot)_(?:cheapest|most_expensive)_electricity/.test(entityId))
      .forEach((entityId) => watched.add(entityId));
    return [...watched].some((entityId) => previousHass.states[entityId] !== nextHass.states[entityId]);
  },

  // The catalog tile shows the very drawing the display will get, laid out at the
  // panel's own resolution. It used to be a second, hand-written HTML rendering of
  // all twenty templates: the tile you picked and the picture that arrived on the
  // tag were two different designs by two different code paths, so every change to
  // one drifted silently from the other. There is now one renderer.
  _renderDisplayTemplateCatalogPreview(template, orientation, size) {
    const base = size && size.width && size.height ? size : { width: 250, height: 128 };
    const long = Math.max(base.width, base.height);
    const short = Math.min(base.width, base.height);
    const width = orientation === "landscape" ? long : short;
    const height = orientation === "landscape" ? short : long;
    if (template?.user_created) return this._renderUserDisplayTemplateCatalogPreview(template, orientation, width, height);
    return this._templateSvgThumbnail(template, width, height);
  },

  _renderDisplayTemplateCatalogPreviewSlot(template, orientation, size) {
    const base = size && size.width && size.height ? size : { width: 250, height: 128 };
    const long = Math.max(base.width, base.height);
    const short = Math.min(base.width, base.height);
    const width = orientation === "landscape" ? long : short;
    const height = orientation === "landscape" ? short : long;
    if (template?.user_created && this._hasTrustedUserTemplatePreview(template)) {
      return this._renderDisplayTemplateCatalogPreview(template, orientation, base);
    }
    if (template?.id === "blank") {
      return `<span class="template-catalog-empty-preview"><ha-icon icon="mdi:plus"></ha-icon><small>Nová šablona</small></span>`;
    }
    // No "add a photo" empty state here: the card should read as a working
    // sample from the very first render, not an unfinished form field. The
    // bundled parrot (customImage()'s own fallback in _templateSvgSpecs) fills
    // this same lazy-preview slot until a real photo replaces it - the card
    // never has to know which of the two it is currently drawing.
    return `<span class="template-catalog-lazy-preview" data-template-catalog-preview="${this._escape(template?.id || "")}" data-template-preview-orientation="${orientation}" data-template-preview-width="${width}" data-template-preview-height="${height}"><span class="template-catalog-preview-skeleton"><i></i><i></i><i></i></span></span>`;
  },

  _hasTrustedUserTemplatePreview(template) {
    if (!String(template?.preview_image || "").startsWith("data:image/")) return false;
    // Older derived templates already identify the prepared template beneath
    // them. A from-scratch template did not carry any preview provenance, and
    // the old save path could therefore capture whatever unrelated template
    // was still assigned to the display. Trust a blank-based raster only when
    // the save path explicitly records that it rendered this very template;
    // otherwise the live compositor below reconstructs it from editor_elements.
    return Boolean(template?.base_template_id)
      || String(template?.preview_template_id || "") === String(template?.id || "");
  },

  _renderUserDisplayTemplateCatalogPreview(template, orientation = template?.orientation, width = 250, height = 128) {
    if (this._hasTrustedUserTemplatePreview(template)) {
      return `<span class="user-template-catalog-canvas has-captured-preview"><img class="user-template-captured-preview" src="${this._escape(template.preview_image)}" alt="Náhled ${this._escape(template.title || "vlastní šablony")}"></span>`;
    }
    const elements = Array.isArray(template?.editor_elements) ? template.editor_elements : [];
    const baseMarkup = template?.base_template_id ? this._templateSvgThumbnail(template, width, height) : "";
    const canvasRotation = this._userTemplateCanvasRotationStyle(template, orientation);
    const markup = elements.map((source) => {
      const item = this._orientedUserTemplateElement(source, template, orientation);
      const style = `left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;transform:rotate(${item.rotation}deg);--element-color:${item.color};--element-fill:${item.fill};--element-stroke:${item.stroke};--element-stroke-width:${item.strokeWidth}px;--element-radius:${item.radius}px;--element-font-size:${item.fontSize}px;--element-font-weight:${item.fontWeight};--element-font-family:${item.fontFamily};--element-font-style:${item.fontStyle};--element-text-decoration:${item.textDecoration};--element-text-outline-width:${item.textOutlineWidth}px;--element-text-outline-color:${item.textOutlineColor};--element-text-border-width:${item.textBorderWidth}px;--element-text-border-color:${item.textBorderColor};--element-overlay-opacity:${item.overlayOpacity}%;${this._overlayFillScreenStyle(item.fill, item.overlayOpacity)};--element-text-align:${item.textAlign};--element-value:${Math.max(0, Math.min(100, item.value))}%`;
      let content = "";
      if (item.type === "image") content = `<img src="${this._escape(this._paletteImageSrc(item))}" alt="">`;
      // Composite elements are one SVG drawn by the component renderer;
      // the same markup is rasterised for the bitmap, so preview and print
      // cannot drift apart the way they had.
      else if (this._isTemplateComponentKind(item.type)) content = this._renderTemplateComponentSvg(item, width, height);
      else if (item.type === "text") content = `<span>${this._escape(item.text || item.label)}</span>`;
      else if (item.type === "block") content = this._renderTemplateBlockVisual(item, width, height);
      return `<span class="template-overlay template-overlay-${item.type} variant-${this._escape(item.blockKind || item.variant || "default")}" style="${style}" aria-hidden="true">${content}</span>`;
    }).join("");
    return `<span class="user-template-catalog-canvas">${baseMarkup}<span class="user-template-rotated-canvas ${canvasRotation.turn ? "is-whole-canvas-rotated" : ""}" style="${canvasRotation.style}">${markup}</span></span>`;
  },

  _renderDisplayTemplatesSection(device) {
    const size = this._devicePreviewSize(device);
    // The tile carries the panel's own proportions, so the thumbnail is the shape
    // of the thing being configured rather than the shape of a stylesheet box.
    const previewAspect = this._displayTemplateOrientation === "landscape"
      ? `${Math.max(size.width, size.height)}/${Math.min(size.width, size.height)}`
      : `${Math.min(size.width, size.height)}/${Math.max(size.width, size.height)}`;
    const editing = this._editingDeviceAddress === device.address;
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const assignedTemplates = this._assignedDisplayTemplates(device);
    const sentTemplates = this._sentDisplayTemplates(device);
    const cards = this._displayTemplateCards();
    const settingsTemplate = cards.find((item) => item.id === this._templateSettingsDialogTemplateId);
    const query = String(this._displayTemplateSearchQuery || "").trim().toLocaleLowerCase("cs");
    // Every template shows up together - the old "Předpřipravené" / "Vlastní
    // nastavení" tabs hid half the catalog behind a click nobody knew to make.
    // The per-card badge (see below) still tells you whether a template's data
    // sources fill in on their own or need picking by hand; search is the only
    // filter left.
    const visibleCards = cards.filter((template) => {
      if (template.id === "blank" || !query) return true;
      const searchable = [template.title, ...template.variables.map(([, label]) => label)].join(" ").toLocaleLowerCase("cs");
      return searchable.includes(query);
    });
    const primaryTemplate = cards.find((item) => item.id === assignedTemplates[0]);
    const secondaryTemplate = cards.find((item) => item.id === assignedTemplates[1]) || primaryTemplate;
    const assignedTemplateCards = assignedTemplates.map((id) => cards.find((item) => item.id === id)).filter(Boolean);
    const orientation = this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait";
    const layout = largeDisplay
      ? this._displayTemplateLayoutDefinition(this._displayTemplateLargeLayout).id
      : "single";
    const previewZoom = Math.max(0.5, Math.min(16, Number(this._displayTemplatePreviewZoom || 1)));
    const imageNavigation = assignedTemplates.includes("custom_image");
    return `<section class="display-templates-inline">
      <div class="display-template-workspace">
        <aside class="card display-template-drop-panel ${largeDisplay ? "is-large-display" : "is-small-display"}">
          <!-- The whole card used to carry data-display-template-configure with
               role="button", so a click on the display name, on its address or
               on any empty space in it opened the template's data-source dialog.
               The trigger is an explicit button below instead: the card holds a
               rename field, a power switch and a disclosure, none of which
               belong inside another button. -->
          <div class="display-template-device-info">
            <div class="display-template-device-info-top">
              <span class="display-template-device-info-icon"><ha-icon icon="mdi:tablet-dashboard"></ha-icon></span>
              <div class="display-template-device-info-identity">
                <div class="display-template-device-info-name-row">
                  ${editing
                    ? `<input class="display-settings-name-input" data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Název displeje" aria-label="Název displeje"><button class="display-settings-name-button is-save" data-device-name-save="${this._escape(device.address)}" title="Uložit název" aria-label="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button>`
                    : `<strong class="display-template-device-info-name">${this._escape(this._deviceTitle(device))}</strong><button class="display-settings-name-button" data-device-rename="${this._escape(device.address)}" title="Přejmenovat displej" aria-label="Přejmenovat displej"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`}
                </div>
                <span class="display-template-device-info-address">${this._escape(device.address)}</span>
              </div>
              ${primaryTemplate ? `<button type="button" class="display-template-configure-button"
                data-display-template-configure="${this._escape(primaryTemplate.id)}"
                title="Nastavit zdroje dat šablony ${this._escape(primaryTemplate.title)}">
                <ha-icon icon="mdi:database-cog-outline"></ha-icon><span>Zdroje dat</span>
              </button>` : ""}
            </div>
            ${this._renderDisplayTemplateRefreshSettings(device)}
          </div>
          ${largeDisplay ? this._renderDisplayTemplateLayoutControls(layout, orientation) : ""}
          <div class="display-template-dropzone ${assignedTemplates.length ? "has-template" : ""} ${imageNavigation ? "is-image-navigation" : ""}" data-display-template-dropzone tabindex="0" aria-label="Přetáhněte sem šablonu">
            ${primaryTemplate
              ? this._renderTemplatePhysicalDevicePreview(device, assignedTemplateCards, orientation, layout, true)
              : this._renderDevicePreview(device, "template")}
            ${largeDisplay ? this._renderDisplayTemplateDropZones(layout, orientation) : ""}
          </div>
          <div class="display-template-drop-controls">
            ${primaryTemplate ? `<span class="template-preview-mouse-hint"><ha-icon icon="mdi:mouse"></ha-icon>Kolečko: zoom až na pixely · levé tlačítko: posun · <b data-template-preview-zoom-value>${Math.round(previewZoom * 100)} %</b></span>` : `<span></span>`}
            <div class="display-template-orientation" role="group" aria-label="Orientace displeje">
              <button type="button" class="${orientation === "portrait" ? "is-active" : ""}" data-template-orientation="portrait" title="Na výšku"><ha-icon icon="mdi:phone-rotate-portrait"></ha-icon></button>
              <button type="button" class="${orientation === "landscape" ? "is-active" : ""}" data-template-orientation="landscape" title="Na šířku"><ha-icon icon="mdi:phone-rotate-landscape"></ha-icon></button>
            </div>
          </div>
          <button type="button" class="display-template-send-button ${!this._templateSending && this._templateSendResult?.ok ? "is-success" : !this._templateSending && this._templateSendResult ? "is-error" : ""}" data-template-send ${assignedTemplates.length && !this._templateSending ? "" : "disabled"} title="${this._templateSendResult ? this._escape(this._templateSendResult.message) : "Odeslat aktuální obsah do fronty zápisu"}">
            <ha-icon icon="mdi:${this._templateSending ? "loading" : this._templateSendResult?.ok ? "check-circle" : this._templateSendResult ? "alert-circle" : "send"}" ${this._templateSending ? 'class="spin"' : ""}></ha-icon>
            <span><strong>${this._templateSending ? "Odesílám náhled…" : this._templateSendResult?.ok ? "Odesláno do fronty" : this._templateSendResult ? "Odeslání se nezdařilo" : "Odeslat do fronty"}</strong><small>${this._templateSendResult?.ok ? "Hotovo · přenos byl přijat" : this._templateSendResult ? "Podrobnosti zobrazíte podržením kurzoru" : assignedTemplates.length ? "Zapíše aktuální obsah displeje" : "Nejprve přetáhněte šablonu"}</small></span>
          </button>
        </aside>
        <section class="display-template-library">
          <div class="card devices-toolbar-card display-template-toolbar">
            <div class="devices-toolbar">
              <div class="device-search">
                <ha-icon icon="mdi:magnify"></ha-icon>
                <input type="search" id="displayTemplateSearch" data-display-template-search value="${this._escape(this._displayTemplateSearchQuery || "")}" placeholder="Hledat šablonu nebo údaj…" aria-label="Hledat šablony">
              </div>
              <button type="button" class="display-template-import-btn" data-display-template-import-trigger title="Vložit šablonu ze souboru (.json)">
                <ha-icon icon="mdi:file-import-outline"></ha-icon> Importovat šablonu
              </button>
              <input type="file" id="displayTemplateFileInput" accept=".json,.dratek-template.json" style="display:none">
              <span class="pill muted display-template-result-count">${visibleCards.length} šablon</span>
            </div>
          </div>
          ${visibleCards.length ? `<div class="display-template-grid">${visibleCards.map((template) => {
            const used = assignedTemplates.includes(template.id);
            const onDisplay = sentTemplates.includes(template.id);
            const userCreated = !!template.user_created;
            const customImageCard = template.id === "custom_image";
            const configStatus = this._templateBindingStatus(template);
            const customImageActiveAsset = customImageCard ? this._activeCustomImageAsset() : null;
            const customImageActiveSrc = customImageCard ? (customImageActiveAsset ? this._paletteImageSrc(customImageActiveAsset, device) : this._customImageDataUrl) : "";
            const customImageLibrary = customImageCard ? (this._templateImageLibrary || []) : [];
            if (template.id === "blank") {
              return `<article class="display-template-card display-template-drag-card display-template-blank-card ${onDisplay ? "is-on-display" : ""}" data-display-template-open="blank" aria-label="Vytvořit vlastní šablonu od nuly. Kliknutím otevřete designer.">
                <header class="display-template-tile-header">
                  <span class="display-template-kind-icon is-blank-icon"><ha-icon icon="mdi:plus-circle-outline"></ha-icon></span>
                  <span class="display-template-tile-identity"><strong>Vytvořit vlastní šablonu</strong><small>Návrh od nuly v eInk Studiu</small></span>
                  <span class="display-template-variable-count blank-badge">+ Nová</span>
                </header>
                <div class="display-template-tile-preview is-${orientation} is-blank-preview" data-display-template-open="blank" role="button" tabindex="0" aria-label="Otevřít prázdný designer">
                  <span class="display-template-preview" style="aspect-ratio:${previewAspect};min-height:0">${this._renderDisplayTemplateCatalogPreviewSlot(template, orientation, size)}</span>
                </div>
                <div class="display-template-tile-actions">
                  <button type="button" class="display-template-card-action is-blank-action-btn" data-display-template-open="blank"><ha-icon icon="mdi:palette-outline"></ha-icon> Otevřít prázdný Designer</button>
                </div>
              </article>`;
            }
            // INTERNAL - remove with the rest of the brand-logo feature before
            // the retail release (PRIVATE-NOTES.md).
            //
            // A broadcast template gets its own card: none of the ordinary
            // furniture applies to it. It is not dragged onto a slot, it has no
            // variables to bind and no designer to open - the tile is a button
            // that resets every display, so it says so instead of showing a
            // "Nenastaveno" badge it can never leave.
            if (template.broadcast) {
              return `<article class="display-template-card display-template-broadcast-card" aria-label="${this._escape(template.title)}. Odešle se na všechny displeje.">
                <header class="display-template-tile-header">
                  <span class="display-template-kind-icon is-broadcast-icon"><ha-icon icon="mdi:broadcast"></ha-icon></span>
                  <span class="display-template-tile-identity"><strong>${this._escape(template.title)}</strong><small>Firemní šablona</small></span>
                </header>
                <div class="display-template-tile-preview is-${orientation}" data-display-template-select="${template.id}" role="button" tabindex="0" aria-label="Odeslat ${this._escape(template.title)} na všechny displeje">
                  <span class="display-template-preview" style="aspect-ratio:${previewAspect};min-height:0">${this._renderDisplayTemplateCatalogPreviewSlot(template, orientation, size)}</span>
                </div>
                <div class="display-template-tile-meta">
                  <span class="display-template-broadcast-warning"><ha-icon icon="mdi:alert-outline"></ha-icon>Zruší automatizace i frontu na všech displejích.</span>
                </div>
                <div class="display-template-tile-actions">
                  <button type="button" class="display-template-card-action is-broadcast-action" data-display-template-select="${template.id}" ${this._brandLogoBroadcasting ? "disabled" : ""}><ha-icon icon="mdi:${this._brandLogoBroadcasting ? "loading" : "broadcast"}"></ha-icon>${this._brandLogoBroadcasting ? "Odesílám…" : "Odeslat na všechny displeje"}</button>
                </div>
              </article>`;
            }
            return `<article class="display-template-card display-template-drag-card is-config-${configStatus.state} ${userCreated ? "is-user-created" : ""} ${used ? "is-used" : ""} ${onDisplay ? "is-on-display" : ""} ${this._templateEditMenuId === template.id ? "has-edit-overlay" : ""}" draggable="true" data-display-template-drag="${template.id}" aria-label="${this._escape(template.title)}. Přetáhněte na displej.">
              <header class="display-template-tile-header">
                <span class="display-template-kind-icon"><ha-icon icon="mdi:${userCreated ? "palette-outline" : template.kind === "prepared" ? "auto-fix" : "tune-variant"}"></ha-icon></span>
                <span class="display-template-tile-identity"><strong>${this._escape(template.title)}</strong><small>${userCreated ? "Vytvořeno uživatelem" : template.kind === "prepared" ? "Automatické nastavení" : "Vlastní zdroje dat"}</small></span>
                ${userCreated ? `<button type="button" class="display-template-delete-btn" data-delete-user-template="${this._escape(template.id)}" title="Smazat uživatelskou šablonu ${this._escape(template.title)}" aria-label="Smazat uživatelskou šablonu ${this._escape(template.title)}"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>` : customImageCard ? `<button type="button" class="display-template-settings-shortcut" data-display-template-configure="custom_image" title="Otevřít obrázkové studio" aria-label="Změnit nebo přidat obrázek"><ha-icon icon="mdi:image-edit-outline"></ha-icon><span>Změnit / přidat</span></button>` : ""}
              </header>
              <div class="display-template-tile-preview is-${orientation}" data-display-template-select="${template.id}" role="button" tabindex="0" aria-label="Vybrat šablonu ${this._escape(template.title)} pro displej">
                <span class="display-template-preview ${userCreated ? "has-user-template" : ""}" style="aspect-ratio:${previewAspect};min-height:0">${this._renderDisplayTemplateCatalogPreviewSlot(template, orientation, size)}</span>
                ${used ? this._renderTemplateConfigurationWarning(template, configStatus) : ""}
                ${customImageCard ? "" : `<button type="button" class="display-template-gear" data-display-template-configure="${this._escape(template.id)}" title="Nastavit zdroje dat šablony ${this._escape(template.title)}" aria-label="Nastavit zdroje dat šablony ${this._escape(template.title)}"><ha-icon icon="mdi:cog"></ha-icon></button>`}
              </div>
              <div class="display-template-tile-meta">
                ${userCreated ? `<span class="user-template-created-note"><ha-icon icon="mdi:palette-outline"></ha-icon>Vytvořeno v eInk Studiu</span>` : customImageCard ? `<div class="display-template-meta-row"><button type="button" class="display-template-config-status is-complete" data-display-template-configure="custom_image"><ha-icon icon="mdi:image-multiple-outline"></ha-icon>${(this._templateImageLibrary || []).length} obrázků v galerii</button><span class="display-template-variables-row"><span class="display-template-variable-icon" title="Obrázková galerie"><ha-icon icon="mdi:image-multiple-outline"></ha-icon></span></span></div>` : `<div class="display-template-meta-row">
                  <button type="button" class="display-template-config-status is-${configStatus.state}" data-display-template-configure="${this._escape(template.id)}" title="${configStatus.state === "complete" ? "Všechny zdroje dat jsou napojené na entity Home Assistantu. Kliknutím upravíte." : configStatus.state === "partial" ? `Napojeno ${configStatus.done} z ${configStatus.total} zdrojů dat. Kliknutím dokončíte.` : "Zdroje dat ještě nejsou napojené. Kliknutím je nastavíte."}"><ha-icon icon="mdi:${configStatus.state === "complete" ? "check-circle" : configStatus.state === "partial" ? "alert-circle" : "circle-off-outline"}"></ha-icon>${configStatus.state === "complete" ? "Nastaveno" : configStatus.state === "partial" ? `${configStatus.done}/${configStatus.total}` : "Nenastaveno"}</button>
                  <span class="display-template-variables-row" aria-label="Použité údaje">${(template.variables.length > 5 ? template.variables.slice(0, 4) : template.variables).map(([iconName, label]) => `<span class="display-template-variable-icon" title="${this._escape(label)}"><ha-icon icon="mdi:${iconName}"></ha-icon></span>`).join("")}${template.variables.length > 5 ? `<span class="display-template-variable-overflow" tabindex="0" aria-label="Další údaje: ${this._escape(template.variables.map(([, label]) => label).join(", "))}">
                    <span class="display-template-variable-overflow-badge">+${template.variables.length}</span>
                    <span class="display-template-variable-overflow-menu" role="tooltip">
                      <strong>Použité údaje</strong>
                      <ul>${template.variables.map(([iconName, label]) => `<li><ha-icon icon="mdi:${iconName}"></ha-icon>${this._escape(label)}</li>`).join("")}</ul>
                    </span>
                  </span>` : ""}</span>
                </div>`}
              </div>
              <div class="display-template-tile-actions">
                <button type="button" class="display-template-card-action" data-display-template-edit-menu="${template.id}" aria-expanded="${this._templateEditMenuId === template.id}"><ha-icon icon="mdi:${customImageCard ? "image-edit-outline" : onDisplay ? "check-circle" : "tune-variant"}"></ha-icon>${customImageCard ? "Spravovat obrázky" : "Upravit šablonu"}<ha-icon icon="mdi:chevron-down"></ha-icon></button>
              </div>
              ${this._templateEditMenuId === template.id ? `<div class="display-template-card-edit-view" role="menu" aria-label="Možnosti úpravy šablony ${this._escape(template.title)}">
                <header class="card-edit-header">
                  <span class="card-edit-kind-icon"><ha-icon icon="mdi:${customImageCard ? "image-multiple-outline" : "tune-variant"}"></ha-icon></span>
                  <div class="card-edit-identity">
                    <strong>${customImageCard ? "Obrázkové studio" : "Upravit šablonu"}</strong>
                    <small><span>${this._escape(template.title)}</span>${customImageCard ? "" : `<span class="card-edit-instruction">Vyberte oblast</span>`}</small>
                  </div>
                  <button type="button" class="card-edit-close-btn" data-display-template-edit-menu="${template.id}" title="Zavřít nastavení">
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </header>

                <div class="card-edit-options">
                  ${customImageCard ? `<button type="button" class="card-edit-option-btn" data-display-template-edit-choice="download" data-display-template-id="custom_image" ${customImageActiveAsset || this._customImageDataUrl ? "" : "disabled"}>
                    <span class="option-icon ${customImageActiveSrc ? "is-live-preview" : ""}">${customImageActiveSrc ? `<img src="${this._escape(customImageActiveSrc)}" alt="">` : `<ha-icon icon="mdi:download-outline"></ha-icon>`}</span>
                    <div class="option-text">
                      <strong>Stáhnout obrázek</strong>
                      <small>Uložit právě vybranou eInk variantu</small>
                    </div>
                    <ha-icon icon="mdi:download" class="option-arrow"></ha-icon>
                  </button>

                  <button type="button" class="card-edit-option-btn is-primary-action" data-display-template-edit-choice="images" data-display-template-id="custom_image">
                    <span class="option-icon ${customImageLibrary.length ? "is-live-preview is-gallery-preview" : customImageActiveSrc ? "is-live-preview" : ""}">${customImageLibrary.length ? `<img src="${this._escape(this._paletteImageSrc(customImageLibrary[0], device))}" alt=""><b>${customImageLibrary.length}</b>` : customImageActiveSrc ? `<img src="${this._escape(customImageActiveSrc)}" alt="">` : `<ha-icon icon="mdi:image-edit-outline"></ha-icon>`}</span>
                    <div class="option-text">
                      <strong>Upravit obrázky</strong>
                      <small>Náhled, výměna obrázku, galerie a automatické střídání</small>
                    </div>
                    <ha-icon icon="mdi:chevron-right" class="option-arrow"></ha-icon>
                  </button>` : `<section class="card-edit-section is-main-section" aria-label="Co chcete změnit">
                    <div class="card-edit-section-label"><ha-icon icon="mdi:pencil-outline"></ha-icon><span>Co chcete změnit?</span></div>
                    <button type="button" class="card-edit-option-btn is-primary-action is-data-action" data-display-template-edit-choice="variables" data-display-template-id="${this._escape(template.id)}">
                      <span class="option-icon"><ha-icon icon="mdi:database-edit-outline"></ha-icon></span>
                      <div class="option-text">
                        <span class="option-eyebrow">Home Assistant</span>
                        <strong>Zdroje dat</strong>
                        <small>Entity a živé hodnoty</small>
                        ${template.variables.length ? `<span class="option-preview-chips">${template.variables.slice(0, 5).map(([iconName, label]) => `<ha-icon icon="mdi:${iconName}" title="${this._escape(label)}"></ha-icon>`).join("")}${template.variables.length > 5 ? `<em>+${template.variables.length - 5}</em>` : ""}</span>` : ""}
                      </div>
                      <ha-icon icon="mdi:chevron-right" class="option-arrow"></ha-icon>
                    </button>

                    <button type="button" class="card-edit-option-btn is-primary-action is-design-action" data-display-template-edit-choice="designer" data-display-template-id="${this._escape(template.id)}">
                      <span class="option-icon is-live-preview">${this._renderDisplayTemplateCatalogPreviewSlot(template, orientation, size)}</span>
                      <div class="option-text">
                        <span class="option-eyebrow">eInk Studio</span>
                        <strong>Vzhled a rozložení</strong>
                        <small>Prvky, texty a grafika</small>
                      </div>
                      <ha-icon icon="mdi:chevron-right" class="option-arrow"></ha-icon>
                    </button>
                  </section>

                  <section class="card-edit-section is-file-section" aria-label="Soubor šablony">
                    <div class="card-edit-section-label"><ha-icon icon="mdi:file-outline"></ha-icon><span>Soubor šablony</span></div>
                    <button type="button" class="card-edit-option-btn is-secondary-action" data-display-template-export="${this._escape(template.id)}">
                      <span class="option-icon"><ha-icon icon="mdi:file-download-outline"></ha-icon></span>
                      <div class="option-text">
                        <strong>Exportovat šablonu</strong>
                        <small>Stáhnout soubor</small>
                        <code class="option-filename">${this._escape(template.id)}.json</code>
                      </div>
                      <ha-icon icon="mdi:download" class="option-arrow"></ha-icon>
                    </button>
                  </section>`}

                  ${userCreated ? `<button type="button" class="card-edit-option-btn is-delete" data-delete-user-template="${this._escape(template.id)}">
                    <span class="option-icon is-delete-icon"><ha-icon icon="mdi:trash-can-outline"></ha-icon></span>
                    <div class="option-text">
                      <strong>Smazat šablonu</strong>
                      <small>Trvale odstranit z knihovny</small>
                    </div>
                    <ha-icon icon="mdi:trash-can-outline" class="option-arrow"></ha-icon>
                  </button>` : ""}
                </div>

                <div class="card-edit-footer">
                  <button type="button" class="card-edit-back-btn" data-display-template-edit-menu="${template.id}">
                    <ha-icon icon="mdi:arrow-left"></ha-icon> Zpět na náhled šablony
                  </button>
                </div>
              </div>` : ""}
            </article>`;
          }).join("")}</div>` : `<div class="display-template-empty"><ha-icon icon="mdi:magnify-close"></ha-icon><strong>Žádná šablona neodpovídá filtru</strong><span>Zkuste jiný název nebo druh šablony.</span></div>`}
        </section>
      </div>
    </section>${settingsTemplate && this._templateSettingsDialogMode === "variables" ? this._renderTemplateSettingsDialog(settingsTemplate, largeDisplay ? "large" : "small", largeDisplay) : ""}${this._renderDisplayTemplateSetupDialog()}`;
  },

  // Sits inside .display-template-device-info, right below the name row, in
  // the space the battery/signal/resolution tiles used to occupy - it has no
  // border or background of its own, just a hairline rule above it, so it
  // reads as part of that one card instead of a second stacked block.
  //
  // The interval/trigger-mode controls used to live in the template designer
  // itself, but a template can be open for several displays with different
  // cadences, so that control moved to live exclusively on each automation's
  // own card (see RefreshControlPlacementTests). That reasoning does not
  // apply here: this section is scoped to one specific device, exactly like
  // an automation card is, so reusing _automationIntervalSelect/
  // _automationTriggerSelect - the very same markup, same data attributes,
  // same _bindAutomationEvents() handlers - is a second place to reach the
  // same per-device setting, not a second source of truth for it.
  _renderDisplayTemplateRefreshSettings(device) {
    const address = String(device?.address || "").toUpperCase();
    const automation = (this._automations || []).find((item) => String(item.address || "").toUpperCase() === address);
    if (!automation) {
      return `<div class="display-template-refresh-row is-empty">
        <ha-icon icon="mdi:autorenew"></ha-icon>
        <span><strong>Automatický zápis</strong><small>Objeví se po prvním odeslání s napojenými hodnotami</small></span>
      </div>`;
    }
    const enabled = automation.enabled !== false;
    const busy = this._automationBusyAddress === automation.address;
    // Collapsed by default: interval and trigger are set once and then only
    // read, so they were taking permanent height above the preview for a
    // setting nobody was changing. The open flag lives on the panel rather
    // than in a <details> element because every poll re-renders the shadow
    // root, which would snap a native disclosure shut mid-edit.
    const settingsOpen = this._displayRefreshSettingsOpen === true;
    return `<div class="display-template-refresh-row ${settingsOpen ? "is-expanded" : ""}">
      <ha-icon icon="mdi:autorenew"></ha-icon>
      <span><strong>Automatický zápis</strong><small>${enabled ? "Aktivní" : "Pozastaveno"}</small></span>
      <button type="button" class="automation-power ${enabled ? "is-on" : "is-off"}" data-automation-enabled="${this._escape(automation.address)}" data-automation-next-enabled="${enabled ? "0" : "1"}" aria-pressed="${enabled ? "true" : "false"}" title="${enabled ? "Pozastavit automatické aktualizace" : "Zapnout automatické aktualizace"}" ${busy ? "disabled" : ""}><ha-icon icon="mdi:${enabled ? "toggle-switch" : "toggle-switch-off-outline"}"></ha-icon><span>${enabled ? "ON" : "OFF"}</span></button>
      <button type="button" class="display-template-refresh-toggle" data-display-refresh-settings
        aria-expanded="${settingsOpen ? "true" : "false"}" title="Nastavení obnovy">
        <ha-icon icon="mdi:chevron-${settingsOpen ? "up" : "down"}"></ha-icon>
      </button>
      ${settingsOpen ? `<div class="display-template-refresh-fields">
        ${this._automationIntervalSelect(automation)}
        ${this._automationTriggerSelect(automation)}
      </div>` : ""}
    </div>`;
  },

  // _displayTemplateAssignments is filled by _applyDisplayTemplateConfig, which
  // only ever runs for the display open in the editor. The overview renders
  // every card, so asking this there used to answer "no templates" for every
  // display but the one last opened - which is why the AKCE / SLEVA button on a
  // cenovka card appeared only after you had been inside that display's editor
  // at least once, and vanished again after a reload.
  //
  // The drafts are loaded for all displays up front (_loadDevicePreviewDrafts),
  // and template_config.assignments in a draft is the very list this map is
  // rebuilt from, so it is the right fallback. Same precedence as
  // _devicePriceSaleActive: the live editor state wins for the selected
  // display, the stored draft answers for all the others.
  _assignedDisplayTemplates(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const isSelected = !!address && address === String(this._selectedDeviceAddress || "").toUpperCase();
    const assigned = this._displayTemplateAssignments?.[address];
    if (Array.isArray(assigned) && assigned.length) return assigned.filter(Boolean).slice(0, 6);
    if (isSelected && Array.isArray(assigned)) return [];
    const draft = this._deviceDrafts?.[address] || {};
    const stored = draft.template_config?.assignments;
    if (Array.isArray(stored) && stored.length) return stored.filter((id) => typeof id === "string" && id).slice(0, 6);
    // Drafts written before template_config existed carry the flat shape.
    const legacy = Array.isArray(draft.assigned_templates) ? draft.assigned_templates : [];
    if (legacy.length) return legacy.filter((id) => typeof id === "string" && id).slice(0, 6);
    return typeof draft.template === "string" && draft.template ? [draft.template] : [];
  },

  _sentDisplayTemplates(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const sent = this._deviceDrafts?.[address]?.sent_template_ids;
    if (Array.isArray(sent)) return sent.filter(Boolean).slice(0, 6);
    return [];
  },

  _displayTemplateLayoutDefinitions() {
    return [
      { id: "single", label: "1 šablona", detail: "Celý displej", columns: 1, rows: 1, capacity: 1, icon: "rectangle-outline" },
      { id: "side-by-side", label: "2 vedle sebe", detail: "2 sloupce × 1 řádek", columns: 2, rows: 1, capacity: 2, icon: "view-column-outline" },
      { id: "stacked", label: "2 pod sebou", detail: "1 sloupec × 2 řádky", columns: 1, rows: 2, capacity: 2, icon: "view-agenda-outline" },
      { id: "columns-3", label: "3 vedle sebe", detail: "3 sloupce × 1 řádek", columns: 3, rows: 1, capacity: 3, icon: "view-column-outline" },
      { id: "columns-4", label: "4 vedle sebe", detail: "4 sloupce × 1 řádek", columns: 4, rows: 1, capacity: 4, icon: "view-column-outline" },
      { id: "grid-4", label: "2 × 2 na ležato", detail: "2 sloupce × 2 řádky", columns: 2, rows: 2, capacity: 4, icon: "view-grid-outline" },
      { id: "grid-6", label: "2 × 3 na ležato", detail: "3 sloupce × 2 řádky", columns: 3, rows: 2, capacity: 6, icon: "view-grid-plus-outline" },
      { id: "mixed-5", label: "2 nahoře + 3 dole", detail: "2 široké a 3 vysoké", columns: 6, rows: 3, capacity: 5, mixed: true, icon: "view-dashboard-outline" },
    ];
  },

  _displayTemplateLayoutDefinition(layout = this._displayTemplateLargeLayout) {
    const aliases = { "columns-2": "side-by-side", "rows-2": "stacked", "rows-3": "columns-3" };
    const requested = String(layout || "single");
    const normalized = aliases[requested] || requested;
    return this._displayTemplateLayoutDefinitions().find((item) => item.id === normalized)
      || this._displayTemplateLayoutDefinitions()[0];
  },

  // Both edges of a slot are rounded independently, never its width - so two
  // neighbours always agree on the boundary they share and the whole row still
  // adds up to the panel exactly (400 px in three columns becomes 133/133/134,
  // not 133.33 three times).
  //
  // Fractional geometry is what made the same photo look different in every
  // column. A slot starting at x=133.33 forces the renderer to resample
  // everything inside it a third of a pixel across; for text that is invisible,
  // but the custom-image template's content is already a black/red/white
  // halftone, and resampling blends neighbouring dots into greys that the final
  // e-ink quantisation then snaps somewhere else entirely. Column 1 (x=0, whole
  // pixel) kept its dots and its red; columns 2 and 3 lost well over half of it.
  // Layouts whose columns happened to divide evenly - 2 or 4 across a 400 px
  // panel - never showed the fault at all, which is why it looked like an image
  // problem rather than a geometry one.
  _snapLayoutSlot(x, y, w, h, width, height, index) {
    const left = Math.round(x * width);
    const top = Math.round(y * height);
    return {
      x: left,
      y: top,
      w: Math.round((x + w) * width) - left,
      h: Math.round((y + h) * height) - top,
      index,
    };
  },

  _displayTemplateLayoutSlots(layout, width, height) {
    const definition = this._displayTemplateLayoutDefinition(layout);
    const transposed = Number(height) > Number(width);
    if (definition.id === "mixed-5") {
      const normalized = [
        { x: 0, y: 0, w: 1 / 2, h: 1 / 3, index: 0 },
        { x: 1 / 2, y: 0, w: 1 / 2, h: 1 / 3, index: 1 },
        { x: 0, y: 1 / 3, w: 1 / 3, h: 2 / 3, index: 2 },
        { x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 2 / 3, index: 3 },
        { x: 2 / 3, y: 1 / 3, w: 1 / 3, h: 2 / 3, index: 4 },
      ];
      return normalized.map((slot) => transposed
        ? this._snapLayoutSlot(slot.y, slot.x, slot.h, slot.w, width, height, slot.index)
        : this._snapLayoutSlot(slot.x, slot.y, slot.w, slot.h, width, height, slot.index));
    }
    const columns = transposed ? definition.rows : definition.columns;
    const rows = transposed ? definition.columns : definition.rows;
    return Array.from({ length: definition.capacity }, (_unused, index) => this._snapLayoutSlot(
      (index % columns) / columns,
      Math.floor(index / columns) / rows,
      1 / columns,
      1 / rows,
      width,
      height,
      index,
    ));
  },

  _renderDisplayTemplateLayoutControls(activeLayout, orientation = this._displayTemplateOrientation) {
    const definition = this._displayTemplateLayoutDefinition(activeLayout);
    const transposed = orientation === "portrait";
    const miniature = `<span class="display-grid-layout-mini layout-${definition.id} ${transposed ? "is-transposed" : ""}" style="--layout-columns:${transposed ? definition.rows : definition.columns};--layout-rows:${transposed ? definition.columns : definition.rows}">${Array.from({ length: definition.capacity }, () => "<i></i>").join("")}</span>`;
    const menu = this._displayTemplateLayoutMenuOpen
      ? `<button type="button" class="display-grid-layout-menu-scrim" data-display-grid-layout-menu-close tabindex="-1" aria-label="Zavřít nabídku rozložení"></button><div class="display-grid-layout-popup" data-display-grid-layout-popup role="menu" aria-label="Seznam rozložení velkého displeje">${this._displayTemplateLayoutDefinitions().map((item) => {
        const selected = item.id === definition.id;
        const itemMiniature = `<span class="display-grid-layout-mini layout-${item.id} ${transposed ? "is-transposed" : ""}" style="--layout-columns:${transposed ? item.rows : item.columns};--layout-rows:${transposed ? item.columns : item.rows}">${Array.from({ length: item.capacity }, () => "<i></i>").join("")}</span>`;
        return `<button type="button" class="display-grid-layout-popup-option ${selected ? "is-active" : ""}" data-display-grid-layout-choice="${item.id}" role="menuitemradio" aria-checked="${selected}">${itemMiniature}<span><strong>${this._escape(item.label)}</strong><small>${this._escape(item.detail)}</small></span><ha-icon icon="mdi:check-circle"></ha-icon></button>`;
      }).join("")}</div>`
      : "";
    return `<section class="display-grid-layout-controls"><header><span><ha-icon icon="mdi:view-dashboard-edit-outline"></ha-icon></span><div><strong>Rozložení velkého displeje</strong><small>Pozice pro kliknutí i přetažení šablony.</small></div></header><div class="display-grid-layout-picker ${this._displayTemplateLayoutMenuOpen ? "is-open" : ""}"><button type="button" class="display-grid-layout-trigger" data-display-grid-layout-menu aria-haspopup="menu" aria-expanded="${Boolean(this._displayTemplateLayoutMenuOpen)}">${miniature}<span><small>Aktivní rozložení</small><strong>${this._escape(definition.label)}</strong><em>${this._escape(definition.detail)}</em></span><ha-icon icon="mdi:chevron-${this._displayTemplateLayoutMenuOpen ? "up" : "down"}"></ha-icon></button>${menu}</div></section>`;
  },

  _renderDisplayTemplateDropZones(layout, orientation = this._displayTemplateOrientation) {
    const slots = this._displayTemplateLayoutSlots(layout, orientation === "portrait" ? 60 : 100, orientation === "portrait" ? 100 : 60);
    const width = orientation === "portrait" ? 60 : 100;
    const height = orientation === "portrait" ? 100 : 60;
    return `<div class="display-template-drop-zones layout-${layout}" data-display-template-drop-zones aria-hidden="true">${slots.map((slot, index) => `<span class="display-template-drop-zone" data-display-template-drop-zone="slot-${index}" title="Umístit do pozice ${index + 1}" style="left:${slot.x / width * 100}%;top:${slot.y / height * 100}%;width:${slot.w / width * 100}%;height:${slot.h / height * 100}%"><b>${index + 1}</b></span>`).join("")}</div>`;
  },

  _assignDisplayTemplate(device, templateId, replaceIndex = null) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    if (!address || !templateId) return [];
    const size = this._devicePreviewSize(device);
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const current = this._assignedDisplayTemplates(device);
    let next;
    if (!largeDisplay) {
      next = [templateId];
    } else if (current.includes(templateId)) {
      next = current;
    } else if (Number.isInteger(replaceIndex) && replaceIndex >= 0 && replaceIndex < current.length) {
      next = [...current];
      next[replaceIndex] = templateId;
    } else if (current.length < this._displayTemplateLayoutDefinition().capacity) {
      next = [...current, templateId];
    } else {
      // No free slot and no explicit replaceIndex - the layout is already at
      // capacity (e.g. "single" with its one slot occupied), so the new
      // template takes the first slot instead of silently growing the
      // assignment list past what the layout can actually show.
      next = [...current];
      next[0] = templateId;
    }
    this._displayTemplateAssignments ||= {};
    this._displayTemplateAssignments[address] = next;
    return next;
  },

  // Puts exactly one template on the display, discarding whatever else was
  // there. This is the "whole screen" placement choice - the other four
  // (left/right/top/bottom) keep the display's other slot intact instead.
  _assignDisplayTemplateFull(device, templateId) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    if (!address || !templateId) return [];
    this._displayTemplateAssignments ||= {};
    this._displayTemplateAssignments[address] = [templateId];
    return [templateId];
  },

  // Puts a template into a specific half (index 0 = left/top, index 1 =
  // right/bottom) while keeping whatever already occupies the other half.
  // _assignDisplayTemplate cannot do this: its replaceIndex only overwrites a
  // slot that already exists in the current array, so handing it index 0 while
  // only one template is assigned collapses the array back to length 1 and
  // silently drops that other template instead of shifting it aside.
  _placeDisplayTemplateInSlot(device, templateId, index) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    if (!address || !templateId) return [];
    const current = this._assignedDisplayTemplates(device);
    let next;
    if (current.length >= 2) {
      // Both slots already have a fixed position; only the requested one changes.
      next = [current[0], current[1]];
      next[index] = templateId;
    } else {
      // Fewer than two slots exist yet, so the sole occupant (if any) is not
      // reliably at the position it conceptually belongs to - a single template
      // always sits at array index 0 regardless of which half it visually
      // occupies. Find it by identity instead of by index, so it lands in
      // whichever slot this placement did not ask for.
      const other = current.find((id) => id !== templateId) || null;
      next = index === 0 ? [templateId, other] : [other, templateId];
    }
    const deduped = next.filter((id, position) => id && next.indexOf(id) === position).slice(0, 2);
    this._displayTemplateAssignments ||= {};
    this._displayTemplateAssignments[address] = deduped;
    return deduped;
  },

  _placeDisplayTemplateInLayoutSlot(device, templateId, index) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const definition = this._displayTemplateLayoutDefinition();
    if (!address || !templateId || !Number.isInteger(index) || index < 0 || index >= definition.capacity) return [];
    const current = this._assignedDisplayTemplates(device);
    const next = Array.from({ length: definition.capacity }, (_unused, position) => current[position] || "blank");
    next[index] = templateId;
    this._displayTemplateAssignments ||= {};
    this._displayTemplateAssignments[address] = next;
    return next;
  },

  _activeTemplateEditorStateId() {
    return String(
      this._selectedTemplateCanvasSlot === "secondary"
        ? this._selectedDisplayTemplateSecondaryId
        : this._selectedDisplayTemplateId
    );
  },

  _rememberActiveTemplateEditorState(templateId = this._activeTemplateEditorStateId()) {
    const id = String(templateId || "");
    if (!id) return;
    this._templateEditorStates ||= {};
    this._templateEditorStates[id] = {
      editor_elements: structuredClone(this._templateEditorElements || []),
      element_adjustments: structuredClone(this._templateElementAdjustments || {}),
      designer_viewport: this._templateDesignerViewport || "wide",
    };
  },

  _restoreTemplateEditorState(templateId, template = null) {
    const id = String(templateId || "");
    const saved = this._templateEditorStates?.[id];
    const sourceElements = saved?.editor_elements
      ?? (template?.user_created ? template.editor_elements : []);
    const sourceAdjustments = saved?.element_adjustments
      ?? (template?.user_created ? template.element_adjustments : {});
    const requestedViewport = saved?.designer_viewport || template?.designer_viewport || "wide";
    this._templateDesignerViewport = ["narrow", "wide", "large", "large-portrait"].includes(requestedViewport)
      ? requestedViewport
      : "wide";
    this._templateEditorElements = Array.isArray(sourceElements)
      ? structuredClone(sourceElements).map((item) => this._normalizeTemplateEditorElement(item))
      : [];
    this._templateElementAdjustments = structuredClone(sourceAdjustments || {});
    this._selectedTemplateEditorElementId = "";
    this._selectedTemplatePart = "";
    this._templateOverlayDrag = null;
    this._refreshTemplateEntityElements?.();
  },

  _displayTemplateDraftPayload(device = this._selectedDevice()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    this._rememberActiveTemplateEditorState();
    return {
      assignments: address ? [...(this._displayTemplateAssignments?.[address] || [])] : [],
      selected_primary: this._selectedDisplayTemplateId || "",
      selected_secondary: this._selectedDisplayTemplateSecondaryId || "",
      orientation: this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait",
      layout: this._displayTemplateLargeLayout || "single",
      bindings: structuredClone(this._displayTemplateBindings || {}),
      // Template switches such as "price:sale" used to live only in memory, so
      // the red AKCE cenovka fell back to plain black and white on every
      // reload. They travel with the draft like the bindings they belong to.
      options: structuredClone(this._displayTemplateOptions || {}),
      editor_elements: structuredClone(this._templateEditorElements || []),
      element_adjustments: structuredClone(this._templateElementAdjustments || {}),
      template_states: structuredClone(this._templateEditorStates || {}),
      formats: structuredClone(this._displayTemplateFormats || {}),
      sizes: structuredClone(this._displayTemplateSizes || {}),
      placements: structuredClone(this._templateCanvasPlacements || {}),
      image_library: structuredClone(this._templateImageLibrary || []),
      designer_viewport: this._templateDesignerViewport || "wide",
      meteoradar_country: this._activeMeteoradarCountry(),
      meteoradar_show_precipitation: this._displayTemplateConfig?.meteoradar_show_precipitation !== false,
      meteoradar_show_wind: this._displayTemplateConfig?.meteoradar_show_wind === true,
      transit_stop_id: this._displayTemplateConfig?.transit_stop_id || "",
      transit_stop_name: this._displayTemplateConfig?.transit_stop_name || "",
      // The optional second stop. A village where the train halt and the bus
      // stop are a hundred metres apart is one place to a person waiting there,
      // and the board merges both by departure time.
      transit_stop_id_2: this._displayTemplateConfig?.transit_stop_id_2 || "",
      transit_stop_name_2: this._displayTemplateConfig?.transit_stop_name_2 || "",
      custom_image_data: this._customImageDataUrl || "",
      custom_image_source: this._customImageSourceUrl || "",
      custom_image_variants: structuredClone(this._customImageVariants || {}),
      custom_image_renderer_version: this._customImageRendererVersion || "",
      custom_image_name: this._customImageName || "",
      custom_image_active_id: this._customImageActiveId || "",
      custom_image_cycle_ids: [...(this._customImageCycleIds || [])],
      custom_image_cycle_enabled: this._customImageCycleEnabled === true,
      custom_image_cycle_minutes: Math.max(1, Math.min(1440, Number(this._customImageCycleMinutes) || 10)),
      custom_image_fit_mode: ["cover", "contain", "stretch"].includes(this._customImageFitMode)
        ? this._customImageFitMode
        : "cover",
    };
  },

  // The one place the radar's country is read from. _displayTemplateConfig is
  // rebuilt wholesale from the draft every time a display is opened, so it is
  // the authority; _meteoradarCountry is the mirror the click handler and the
  // draft payload keep alongside it, and is only a fallback here. Reading the
  // mirror first meant a value left over from the previously opened display
  // could win over the config just loaded for this one.
  _activeMeteoradarCountry() {
    return this._displayTemplateConfig?.meteoradar_country || this._meteoradarCountry || "cz";
  },

  _restoreDisplayTemplateConfig(config) {
    this._templateUndoStack = [];
    this._templateRedoStack = [];
    this._templatePropertyHistoryKey = "";
    this._meteoradarCountry = config?.meteoradar_country || "cz";
    this._displayTemplateConfig = {
      meteoradar_country: this._meteoradarCountry,
      meteoradar_show_precipitation: config?.meteoradar_show_precipitation !== false,
      meteoradar_show_wind: config?.meteoradar_show_wind === true,
      transit_stop_id: String(config?.transit_stop_id || ""),
      transit_stop_name: String(config?.transit_stop_name || ""),
      transit_stop_id_2: String(config?.transit_stop_id_2 || ""),
      transit_stop_name_2: String(config?.transit_stop_name_2 || ""),
    };
    this._customImageDataUrl = String(config?.custom_image_data || "").startsWith("data:image/")
      ? String(config.custom_image_data)
      : "";
    const hasStoredOriginal = String(config?.custom_image_source || "").startsWith("data:image/");
    this._customImageSourceUrl = hasStoredOriginal
      ? String(config.custom_image_source)
      : this._customImageDataUrl;
    this._customImageVariants = config?.custom_image_variants && typeof config.custom_image_variants === "object"
      ? structuredClone(config.custom_image_variants)
      : {};
    this._customImageRendererVersion = String(config?.custom_image_renderer_version || "");
    this._customImageDataUrl = this._paletteImageSrc({
      src: this._customImageDataUrl,
      source: this._customImageSourceUrl,
      variants: this._customImageVariants,
    });
    this._customImageName = String(config?.custom_image_name || "");
    this._customImageActiveId = String(config?.custom_image_active_id || "");
    this._customImageCycleIds = Array.isArray(config?.custom_image_cycle_ids)
      ? config.custom_image_cycle_ids.map(String)
      : [];
    this._customImageCycleEnabled = config?.custom_image_cycle_enabled === true;
    this._customImageCycleMinutes = Math.max(1, Math.min(1440, Number(config?.custom_image_cycle_minutes) || 10));
    this._customImageFitMode = ["cover", "contain", "stretch"].includes(config?.custom_image_fit_mode)
      ? config.custom_image_fit_mode
      : "cover";
    if (hasStoredOriginal && this._customImageRendererVersion !== this._importedImageRendererVersion()) {
      const source = this._customImageSourceUrl;
      const name = this._customImageName;
      Promise.resolve().then(() => this._convertCustomImageTemplateSource(source, name)).catch((error) => {
        console.warn("DRATEK eInk image palette refresh failed:", error);
      });
    }
    const address = String(this._selectedDeviceAddress || "").toUpperCase();
    if (!config || typeof config !== "object") {
      if (address) {
        this._displayTemplateAssignments ||= {};
        this._displayTemplateAssignments[address] = [];
      }
      this._selectedDisplayTemplateId = "";
      this._selectedDisplayTemplateSecondaryId = "";
      this._displayTemplateBindings = {};
      this._displayTemplateOptions = {};
      this._templateEditorElements = [];
      this._templateEditorStates = {};
      this._selectedTemplateEditorElementId = "";
      this._templateOverlayDrag = null;
      this._templateElementAdjustments = {};
      this._templateImageLibrary = [];
      this._templateDesignerViewport = "wide";
      this._customImageDataUrl = "";
      this._customImageSourceUrl = "";
      this._customImageVariants = {};
      this._customImageRendererVersion = "";
      this._customImageName = "";
      this._customImageActiveId = "";
      this._customImageCycleIds = [];
      this._customImageCycleEnabled = false;
      this._customImageCycleMinutes = 10;
      this._customImageFitMode = "cover";
      this._displayTemplateLargeLayout = "single";
      this._selectedTemplatePart = "";
      return;
    }
    const assignments = Array.isArray(config.assignments) ? config.assignments.filter((item) => typeof item === "string") : [];
    this._displayTemplateAssignments ||= {};
    if (address) this._displayTemplateAssignments[address] = assignments.slice(0, 6);
    this._selectedDisplayTemplateId = String(config.selected_primary || assignments[0] || "");
    this._selectedDisplayTemplateSecondaryId = String(config.selected_secondary || assignments[1] || "");
    this._displayTemplateOrientation = config.orientation === "landscape" ? "landscape" : "portrait";
    this._displayTemplateLargeLayout = this._displayTemplateLayoutDefinition(config.layout).id;
    this._templateDesignerViewport = ["narrow", "wide", "large", "large-portrait"].includes(config.designer_viewport)
      ? config.designer_viewport
      : "wide";
    this._displayTemplateBindings = structuredClone(config.bindings || {});
    this._displayTemplateOptions = structuredClone(config.options || {});
    this._templateEditorStates = {};
    if (config.template_states && typeof config.template_states === "object" && !Array.isArray(config.template_states)) {
      for (const [templateId, state] of Object.entries(config.template_states)) {
        if (!templateId || !state || typeof state !== "object") continue;
        this._templateEditorStates[templateId] = {
          editor_elements: Array.isArray(state.editor_elements) ? structuredClone(state.editor_elements) : [],
          element_adjustments: structuredClone(state.element_adjustments || {}),
          designer_viewport: ["narrow", "wide", "large", "large-portrait"].includes(state.designer_viewport)
            ? state.designer_viewport
            : this._templateDesignerViewport,
        };
      }
    }
    const restoredTemplateId = this._selectedDisplayTemplateId || assignments[0] || "";
    if (restoredTemplateId && !this._templateEditorStates[restoredTemplateId]
      && (Array.isArray(config.editor_elements) || config.element_adjustments)) {
      // Legacy drafts had one global editor state. It belongs only to the
      // template that was selected when that draft was saved.
      this._templateEditorStates[restoredTemplateId] = {
        editor_elements: Array.isArray(config.editor_elements) ? structuredClone(config.editor_elements) : [],
        element_adjustments: structuredClone(config.element_adjustments || {}),
        designer_viewport: this._templateDesignerViewport,
      };
    }
    this._restoreTemplateEditorState(restoredTemplateId);
    const embeddedUserTemplates = Array.isArray(config.user_templates)
      ? structuredClone(config.user_templates).filter((template) => template && String(template.id || "").startsWith("user-template-"))
      : [];
    const sharedTemplatesBeforeMigration = [...(this._userDisplayTemplates || [])];
    this._userDisplayTemplates = this._mergeUserDisplayTemplates
      ? this._mergeUserDisplayTemplates(this._userDisplayTemplates, embeddedUserTemplates)
      : embeddedUserTemplates;
    for (const template of embeddedUserTemplates) {
      const shared = sharedTemplatesBeforeMigration.find((item) => item.id === template.id);
      const embeddedUpdated = Date.parse(template.updated_at || "") || Number(template.updated_at || 0);
      const sharedUpdated = Date.parse(shared?.updated_at || "") || Number(shared?.updated_at || 0);
      if (!shared || embeddedUpdated > sharedUpdated) this._saveUserDisplayTemplate?.(template).catch(() => {});
    }
    this._templateImageLibrary = Array.isArray(config.image_library)
      ? structuredClone(config.image_library).filter((asset) => asset?.id && String(asset.src || "").startsWith("data:image/"))
      : [];
    const availableImageIds = new Set(this._templateImageLibrary.map((asset) => String(asset.id)));
    this._customImageCycleIds = this._customImageCycleIds.filter((id) => availableImageIds.has(id));
    if (!availableImageIds.has(this._customImageActiveId)) this._customImageActiveId = this._customImageCycleIds[0] || "";
    this._displayTemplateFormats = { primary: "narrow", secondary: "narrow", ...(config.formats || {}) };
    this._displayTemplateSizes = { primary: "large", secondary: "small", ...(config.sizes || {}) };
    this._templateCanvasPlacements = {
      primary: { x: 9, y: 9 },
      secondary: { x: 9, y: 9 },
      ...(config.placements || {}),
    };
    this._selectedTemplatePart = "";
    this._refreshTemplateEntityElements?.();
  },

  _nextUserDisplayTemplateTitle() {
    const names = new Set((this._userDisplayTemplates || []).map((template) => String(template.title || "").trim()));
    if (!names.has("Vlastní šablona")) return "Vlastní šablona";
    let index = 2;
    while (names.has(`Vlastní šablona ${index}`)) index += 1;
    return `Vlastní šablona ${index}`;
  },

  _storeCurrentUserDisplayTemplate(device = this._device()) {
    const selectedId = String(this._selectedDisplayTemplateId || "");
    const existing = (this._userDisplayTemplates || []).find((template) => template.id === selectedId);
    const sourceTemplate = this._displayTemplateCards().find((template) => template.id === selectedId);
    if (!sourceTemplate) return null;
    const id = existing?.id || `user-template-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const title = existing?.title || (selectedId === "blank" ? this._nextUserDisplayTemplateTitle() : `${sourceTemplate.title} – upravená`);
    const now = new Date().toISOString();
    const viewport = this._templateDesignerViewport || "wide";
    const viewportSize = {
      narrow: { width: 128, height: 296 },
      wide: { width: 296, height: 128 },
      large: { width: 800, height: 480 },
      "large-portrait": { width: 480, height: 800 },
    }[viewport] || { width: 296, height: 128 };
    const remappedAdjustments = Object.fromEntries(Object.entries(this._templateElementAdjustments || {}).map(([key, adjustment]) => [
      key.replace(`:${selectedId}:`, `:${id}:`), structuredClone(adjustment),
    ]));
    this._templateElementAdjustments = remappedAdjustments;
    const stored = {
      ...(existing || {}),
      id,
      title,
      user_created: true,
      base_template_id: existing?.base_template_id || (selectedId === "blank" ? "" : selectedId),
      variables: structuredClone(existing?.variables || sourceTemplate.variables || []),
      options: structuredClone(existing?.options || sourceTemplate.options || []),
      editor_elements: structuredClone(this._templateEditorElements || []),
      element_adjustments: structuredClone(remappedAdjustments),
      orientation: this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait",
      design_orientation: existing?.design_orientation || existing?.orientation || (this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait"),
      designer_viewport: viewport,
      design_width: viewportSize.width,
      design_height: viewportSize.height,
      formats: structuredClone(this._displayTemplateFormats || {}),
      sizes: structuredClone(this._displayTemplateSizes || {}),
      placements: structuredClone(this._templateCanvasPlacements || {}),
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    this._userDisplayTemplates = existing
      ? this._userDisplayTemplates.map((template) => template.id === id ? stored : template)
      : [...(this._userDisplayTemplates || []), stored];
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    if (address) {
      this._displayTemplateAssignments ||= {};
      const currentAssignments = this._assignedDisplayTemplates(device);
      const selectedWasAssigned = currentAssignments.includes(selectedId);
      // Opening "Nová šablona" intentionally does not replace the display
      // before the user saves. Consequently "blank" is usually absent from
      // currentAssignments and the old map-only update left the previous
      // display template in place. The preview capture that runs immediately
      // after this method then rasterised that old template and merely painted
      // the new Designer elements over it. A design opened outside the active
      // assignment becomes the single active template at save time; editing a
      // template already present in a multi-slot layout still preserves the
      // other slots.
      const nextAssignments = selectedWasAssigned
        ? currentAssignments.map((templateId) => templateId === selectedId ? id : templateId)
        : [id];
      this._displayTemplateAssignments[address] = nextAssignments;
      this._selectedDisplayTemplateSecondaryId = nextAssignments[1] || "";
      if (!selectedWasAssigned) {
        this._selectedTemplateCanvasSlot = "primary";
        this._displayTemplateLargeLayout = "single";
      }
    }
    this._selectedDisplayTemplateId = id;
    this._rememberActiveTemplateEditorState(id);
    if (selectedId === "blank" && id !== selectedId) delete this._templateEditorStates.blank;
    this._projectName = title;
    this._selectedTemplateEditorElementId = "";
    return stored;
  },

  _applyUserDisplayTemplate(template) {
    if (!template?.user_created) return;
    this._templateUndoStack = [];
    this._templateRedoStack = [];
    this._templatePropertyHistoryKey = "";
    this._pushHistory();
    this._objects = [];
    this._variables = {};
    this._restoreTemplateEditorState(template.id, template);
    this._displayTemplateFormats = { primary: "narrow", secondary: "narrow", ...(template.formats || {}) };
    this._displayTemplateSizes = { primary: "large", secondary: "small", ...(template.sizes || {}) };
    this._templateCanvasPlacements = {
      primary: { x: 9, y: 9 },
      secondary: { x: 9, y: 9 },
      ...(template.placements || {}),
    };
    this._selectedTemplateEditorElementId = "";
    this._selectedTemplatePart = "";
    this._selectedProjectId = "";
    this._projectName = template.title || "Vlastní šablona";
    this._nextId = 1;
    this._refreshTemplateEntityElements?.();
  },

  _currentUserDisplayTemplate() {
    const selectedId = String(this._selectedDisplayTemplateId || "");
    return (this._userDisplayTemplates || []).find((template) => template?.user_created && template.id === selectedId) || null;
  },

  _userTemplateQuarterTurn(template, targetOrientation = this._displayTemplateOrientation) {
    if (!template?.user_created) return 0;
    const sourceOrientation = ["portrait", "landscape"].includes(template.design_orientation)
      ? template.design_orientation
      : template.orientation;
    const source = sourceOrientation === "landscape" ? "landscape" : "portrait";
    const target = targetOrientation === "landscape" ? "landscape" : "portrait";
    if (source === target) return 0;
    return source === "portrait" ? 1 : -1;
  },

  // Stored elements always remain in their authored coordinate system. The live
  // preview rotates one wrapper around the complete canvas instead of rewriting
  // every child, so text, images and charts behave like one finished picture.
  _orientedUserTemplateElement(source, template = this._currentUserDisplayTemplate(), targetOrientation = this._displayTemplateOrientation) {
    return this._normalizeTemplateEditorElement(source);
  },

  _quarterTurnedUserTemplateElement(source, template = this._currentUserDisplayTemplate(), targetOrientation = this._displayTemplateOrientation) {
    const item = this._normalizeTemplateEditorElement(source);
    const turn = this._userTemplateQuarterTurn(template, targetOrientation);
    if (turn === 1) {
      return { ...item, x: 100 - item.y - item.h, y: item.x, w: item.h, h: item.w, rotation: item.rotation + 90 };
    }
    if (turn === -1) {
      return { ...item, x: item.y, y: 100 - item.x - item.w, w: item.h, h: item.w, rotation: item.rotation - 90 };
    }
    return item;
  },

  _userTemplateCanvasRotationStyle(template = this._currentUserDisplayTemplate(), targetOrientation = this._displayTemplateOrientation, targetRatio = 0) {
    const turn = this._userTemplateQuarterTurn(template, targetOrientation);
    if (!turn) return { turn: 0, style: "" };
    const base = this._baseDisplaySize?.(this._device?.()) || { width: 296, height: 128 };
    const long = Math.max(1, Number(base.width || 296), Number(base.height || 128));
    const short = Math.max(1, Math.min(Number(base.width || 296), Number(base.height || 128)));
    const ratio = Number(targetRatio) > 0 ? Number(targetRatio) : targetOrientation === "landscape" ? long / short : short / long;
    return {
      turn,
      style: `left:50%;top:50%;right:auto;bottom:auto;width:${100 / ratio}%;height:${100 * ratio}%;transform:translate(-50%,-50%) rotate(${turn * 90}deg)`,
    };
  },

  async _saveDisplayTemplateDraft() {
    const device = this._device();
    if (!device || !this._hass) return false;
    window.clearTimeout(this._draftSaveTimer);
    this._draftSaveTimer = null;
    const payload = this._projectPayload(device);
    return this._queueDeviceDraftSave(device, payload);
  },

  _renderCustomImageStudio(device) {
    const assets = this._templateImageLibrary || [];
    const physical = this._devicePreviewSize(device) || { width: 296, height: 128 };
    const portrait = this._displayTemplateOrientation === "portrait";
    const stageWidth = portrait ? Math.min(physical.width, physical.height) : Math.max(physical.width, physical.height);
    const stageHeight = portrait ? Math.max(physical.width, physical.height) : Math.min(physical.width, physical.height);
    const fitMode = ["cover", "contain", "stretch"].includes(this._customImageFitMode) ? this._customImageFitMode : "cover";
    const active = (this._customImageCycleEnabled ? this._activeCustomImageAsset() : null)
      || assets.find((asset) => asset.id === this._customImageActiveId)
      || this._activeCustomImageAsset()
      || null;
    const activePreview = active ? this._paletteImageSrc(active, device) : this._customImageDataUrl;
    const selected = new Set(this._customImageCycleIds || []);
    const cycleMinutes = Math.max(1, Math.min(1440, Number(this._customImageCycleMinutes) || 10));
    return `<section class="custom-image-studio">
      <header class="card custom-image-studio-header">
        <button type="button" class="custom-image-studio-back" data-template-editor-back title="Zpět k šablonám"><ha-icon icon="mdi:arrow-left"></ha-icon></button>
        <span class="custom-image-studio-title"><small>Šablona vlastního obrázku</small><strong>Obrázkové studio</strong><em>${assets.length} ${assets.length === 1 ? "uložený obrázek" : "uložených obrázků"}</em></span>
        <div class="custom-image-studio-actions">
          <button type="button" data-custom-image-download ${activePreview ? "" : "disabled"}><ha-icon icon="mdi:download-outline"></ha-icon><span>Stáhnout</span></button>
          <button type="button" class="is-primary" data-custom-image-studio-upload><ha-icon icon="mdi:image-edit-outline"></ha-icon><span>Změnit / přidat obrázek</span></button>
          <button type="button" data-custom-image-gallery-focus><ha-icon icon="mdi:image-multiple-outline"></ha-icon><span>Galerie</span></button>
          <input id="customImageStudioFile" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
        </div>
      </header>
      <div class="custom-image-studio-layout">
        <main class="card custom-image-stage-card">
          <div class="custom-image-stage" data-custom-image-stage>
            ${activePreview ? `<div class="custom-image-stage-screen" style="aspect-ratio:${stageWidth}/${stageHeight}"><img class="fit-${fitMode}" src="${this._escape(activePreview)}" alt="Aktivní obrázek ${this._escape(active?.name || this._customImageName || "")}"></div>` : `<div class="custom-image-stage-empty"><ha-icon icon="mdi:image-plus-outline"></ha-icon><strong>Přidejte první obrázek</strong></div>`}
          </div>
          <footer><span><ha-icon icon="mdi:gesture-tap-hold"></ha-icon>Kolečkem až na pixely, levým tlačítkem posun · <b data-image-stage-zoom-value>${Math.round(Math.max(0.5, Math.min(16, Number(this._customImageStudioZoom || 1))) * 100)} %</b></span><strong>${this._escape(active?.name || this._customImageName || "Bez obrázku")}</strong></footer>
        </main>
        <aside class="card custom-image-gallery" data-custom-image-gallery>
          <header><span><small>Knihovna pro tento displej</small><strong>Galerie obrázků</strong></span><b>${selected.size}/12 ve slideshow</b></header>
          <div class="custom-image-gallery-grid">${assets.length ? assets.map((asset) => `<article class="custom-image-gallery-item ${asset.id === active?.id ? "is-active" : ""}">
            <button type="button" class="custom-image-gallery-select" data-custom-image-select="${this._escape(asset.id)}"><img src="${this._escape(this._paletteImageSrc(asset, device))}" alt="${this._escape(asset.name || "Obrázek")}"><span><strong>${this._escape(asset.name || "Obrázek")}</strong><small>${asset.id === active?.id ? "Aktivní" : "Použít obrázek"}</small></span></button>
            <label title="Zařadit do automatického střídání"><input type="checkbox" data-custom-image-cycle="${this._escape(asset.id)}" ${selected.has(asset.id) ? "checked" : ""}><span><ha-icon icon="mdi:autorenew"></ha-icon>Slideshow</span></label>
            <button type="button" class="custom-image-gallery-remove" data-custom-image-remove="${this._escape(asset.id)}" title="Odstranit obrázek" aria-label="Odstranit ${this._escape(asset.name || "obrázek")}"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
          </article>`).join("") : `<div class="custom-image-gallery-empty"><ha-icon icon="mdi:image-multiple-outline"></ha-icon><p>Galerie je prázdná. Přidejte PNG, JPEG nebo WebP.</p></div>`}</div>
          <section class="custom-image-cycle-settings">
            <label><span>Přizpůsobení displeji</span><select data-custom-image-fit-mode>
              <option value="cover" ${this._customImageFitMode === "cover" ? "selected" : ""}>Vyplnit celou plochu</option>
              <option value="contain" ${this._customImageFitMode === "contain" ? "selected" : ""}>Zobrazit celý obrázek</option>
              <option value="stretch" ${this._customImageFitMode === "stretch" ? "selected" : ""}>Roztáhnout na displej</option>
            </select></label>
            <label class="custom-image-cycle-switch"><input type="checkbox" data-custom-image-cycle-enabled ${this._customImageCycleEnabled ? "checked" : ""} ${selected.size < 2 ? "disabled" : ""}><span><i></i><strong>Automaticky střídat vybrané obrázky</strong></span></label>
            <label><span>Interval změny</span><select data-custom-image-cycle-minutes ${this._customImageCycleEnabled ? "" : "disabled"}>${[[1,"1 minuta"],[5,"5 minut"],[10,"10 minut"],[15,"15 minut"],[30,"30 minut"],[60,"1 hodina"]].map(([value,label]) => `<option value="${value}" ${cycleMinutes === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
            <p><ha-icon icon="mdi:information-outline"></ha-icon>Po odeslání displej přejde na intervalové aktualizace a střídá až 12 vybraných snímků.</p>
          </section>
          <div class="custom-image-studio-submit">
            <button type="button" class="primary" data-custom-image-save><ha-icon icon="mdi:content-save-outline"></ha-icon><span>Uložit</span></button>
          </div>
          ${this._templateSendResult ? `<div class="template-send-result ${this._templateSendResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSendResult.ok ? "check-circle-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSendResult.message)}</span></div>` : ""}
          ${this._templateSaveResult ? `<div class="template-send-result ${this._templateSaveResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSaveResult.ok ? "content-save-check-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSaveResult.message)}</span></div>` : ""}
        </aside>
      </div>
    </section>`;
  },

  _renderDisplayTemplateEditor(device) {
    const templates = this._displayTemplateCards();
    const template = templates.find((item) => item.id === this._selectedDisplayTemplateId) || templates[0];
    if (template?.id === "custom_image") return this._renderCustomImageStudio(device);
    const size = this._devicePreviewSize(device);
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const selectedSize = "large";
    const activeTemplate = template;
    const previewZoom = Math.max(0.5, Math.min(16, Number(this._displayTemplatePreviewZoom || 1)));
    const viewport = ["narrow", "wide", "large", "large-portrait"].includes(this._templateDesignerViewport)
      ? this._templateDesignerViewport
      : "wide";
    const viewportSize = {
      narrow: { width: 128, height: 296 },
      wide: { width: 296, height: 128 },
      large: { width: 800, height: 480 },
      "large-portrait": { width: 480, height: 800 },
    }[viewport];
    const canvasWidth = viewportSize.width;
    const canvasHeight = viewportSize.height;
    const canvasScale = Math.min(760 / canvasWidth, 360 / canvasHeight);
    const previewCanvasWidth = Math.round(canvasWidth * canvasScale);
    const canvasFormat = canvasWidth >= canvasHeight ? "wide" : "narrow";
    return `<section class="display-template-editor-page studio-pro-workspace">
      <div class="display-template-editor-layout">
        <div class="studio-pro-selection-row">
          ${this._renderTemplateSelectionBar(activeTemplate, previewZoom, viewport)}
        </div>
        <aside class="card display-template-editor-panel display-template-editor-left studio-pro-sidebar" aria-label="Kategorie prvků">
          ${this._renderTemplateEditorTools()}
          ${this._renderTemplateElementPalette()}
        </aside>

        <main class="display-template-editor-canvas" data-photoshop-canvas>
          <div class="display-template-preview-card photoshop-canvas-card">
            <!-- The stage is the window you look through and the artboard is
                 the panel itself. Zoom and pan therefore belong on the stage
                 (it is what the wheel and the drag are aimed at) and are
                 applied to the artboard, so the whole display grows - bezel,
                 border and content together - instead of the drawing swelling
                 inside a frame that stays the same size. -->
            <div class="display-template-editor-stage" data-template-designer-viewport-canvas style="--template-preview-zoom:${previewZoom};--template-designer-pan-x:${this._templateDesignerPan?.x || 0}px;--template-designer-pan-y:${this._templateDesignerPan?.y || 0}px">
              <div class="template-standalone-editor template-designer-screen viewport-${viewport}" data-template-designer-artboard style="--template-canvas-ratio:${canvasWidth}/${canvasHeight};--template-canvas-width:${previewCanvasWidth}px" aria-label="Plátno šablony ${this._escape(template.title)}">
                ${this._renderDisplayTemplateSurface(template, canvasFormat, true, "primary", true, "large", false, canvasWidth, canvasHeight)}
              </div>
            </div>
          </div>
        </main>

        <div class="display-template-editor-right-column">
          ${this._renderTemplateSaveRow()}
          ${this._templateSendResult ? `<div class="template-send-result ${this._templateSendResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSendResult.ok ? "check-circle-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSendResult.message)}</span></div>` : ""}
          ${this._templateSaveResult ? `<div class="template-send-result ${this._templateSaveResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSaveResult.ok ? "content-save-check-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSaveResult.message)}</span></div>` : ""}
          <aside class="card display-template-editor-panel display-template-editor-right" aria-label="Nastavení prvku nebo šablony">
            ${this._selectedTemplateEditorElementId ? this._renderTemplateElementInspector() : this._selectedTemplatePart ? this._renderTemplatePartInspector(activeTemplate) : `
            <div class="template-properties-empty"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><strong>Vyberte prvek na plátně</strong><p>Zde se zobrazí všechny jeho barvy, text, podbarvení, orámování, data a další vlastnosti.</p><button type="button" class="secondary" data-template-settings-open><ha-icon icon="mdi:tune-variant"></ha-icon>Nastavení celé šablony</button></div>`}
          </aside>
        </div>
      </div>
      ${this._renderTemplateSettingsDialog(activeTemplate, selectedSize, largeDisplay)}
    </section>`;
  },

  // Geometry and markup shared by every variable's crop in one dialog, built
  // once instead of once per variable: the SVG layout pass and icon warm-up
  // are the same regardless of which variable is asking.
  _templateVariableCropContext(template) {
    const size = this._devicePreviewSize(this._device()) || { width: 296, height: 128 };
    const orientation = this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait";
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    const width = orientation === "landscape" ? long : short;
    const height = orientation === "landscape" ? short : long;
    const rows = this._templateSvgRows(template, width, height);
    this._requestTemplateIcons(rows);
    this._requestTemplateRadarImage(rows, width, height);
    this._requestTemplateTransitBoard(rows);
    return { width, height, markup: this._layoutTemplateSvg(rows, width, height), boxes: this._templateVariableCropBoxes(template, width, height) };
  },

  _countryFlagSvg(countryId, width = 24, height = 16) {
    const id = String(countryId || "").toLowerCase();
    const w = width;
    const h = height;
    const r = Math.min(3, w * 0.15);
    let inner = "";
    if (id === "cz") {
      inner = `<rect width="${w}" height="${h/2}" fill="#ffffff"/>`
        + `<rect y="${h/2}" width="${w}" height="${h/2}" fill="#d41414"/>`
        + `<polygon points="0,0 ${w*0.48},${h/2} 0,${h}" fill="#11457e"/>`;
    } else if (id === "sk") {
      const shieldX = h * 0.24;
      const shieldY = h * 0.24;
      const shieldW = h * 0.43;
      const shieldH = h * 0.52;
      const crossX = shieldX + shieldW * 0.5;
      inner = `<rect width="${w}" height="${h/3}" fill="#ffffff"/>`
        + `<rect y="${h/3}" width="${w}" height="${h/3}" fill="#0b4ea2"/>`
        + `<rect y="${(h*2)/3}" width="${w}" height="${h/3}" fill="#ee1c25"/>`
        + `<path d="M ${shieldX} ${shieldY} H ${shieldX + shieldW} V ${shieldY + shieldH * 0.55} Q ${shieldX + shieldW} ${shieldY + shieldH * 0.84} ${crossX} ${shieldY + shieldH} Q ${shieldX} ${shieldY + shieldH * 0.84} ${shieldX} ${shieldY + shieldH * 0.55} Z" fill="#ee1c25" stroke="#ffffff" stroke-width="${Math.max(0.55, h * 0.04)}"/>`
        + `<path d="M ${shieldX + shieldW * 0.08} ${shieldY + shieldH * 0.79} Q ${shieldX + shieldW * 0.24} ${shieldY + shieldH * 0.62} ${shieldX + shieldW * 0.38} ${shieldY + shieldH * 0.78} Q ${crossX} ${shieldY + shieldH * 0.54} ${shieldX + shieldW * 0.62} ${shieldY + shieldH * 0.78} Q ${shieldX + shieldW * 0.78} ${shieldY + shieldH * 0.62} ${shieldX + shieldW * 0.92} ${shieldY + shieldH * 0.79} V ${shieldY + shieldH * 0.9} H ${shieldX + shieldW * 0.08} Z" fill="#0b4ea2"/>`
        + `<path d="M ${crossX} ${shieldY + shieldH * 0.19} V ${shieldY + shieldH * 0.72} M ${shieldX + shieldW * 0.27} ${shieldY + shieldH * 0.36} H ${shieldX + shieldW * 0.73} M ${shieldX + shieldW * 0.34} ${shieldY + shieldH * 0.52} H ${shieldX + shieldW * 0.66}" stroke="#ffffff" stroke-width="${Math.max(0.75, h * 0.055)}" stroke-linecap="round" fill="none"/>`;
    } else if (id === "de") {
      inner = `<rect width="${w}" height="${h/3}" fill="#000000"/>`
        + `<rect y="${h/3}" width="${w}" height="${h/3}" fill="#dd0000"/>`
        + `<rect y="${(h*2)/3}" width="${w}" height="${h/3}" fill="#ffce00"/>`;
    } else if (id === "pl") {
      inner = `<rect width="${w}" height="${h/2}" fill="#ffffff"/>`
        + `<rect y="${h/2}" width="${w}" height="${h/2}" fill="#dc143c"/>`;
    } else if (id === "at") {
      inner = `<rect width="${w}" height="${h/3}" fill="#ed2939"/>`
        + `<rect y="${h/3}" width="${w}" height="${h/3}" fill="#ffffff"/>`
        + `<rect y="${(h*2)/3}" width="${w}" height="${h/3}" fill="#ed2939"/>`;
    } else if (id === "eu") {
      inner = `<rect width="${w}" height="${h}" fill="#003399"/>`
        + `<circle cx="${w/2}" cy="${h/2}" r="${h*0.28}" fill="none" stroke="#ffcc00" stroke-width="1.2" stroke-dasharray="1 2.2"/>`;
    } else {
      inner = `<rect width="${w}" height="${h}" fill="#718096"/>`;
    }
    return `<svg class="flag-svg-icon" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="border-radius:${r}px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.3);vertical-align:middle;display:inline-block;">${inner}<rect width="${w}" height="${h}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1" rx="${r}"/></svg>`;
  },

  // The setup guide's own content, reused both inside the merged dialog and
  // (unchanged) nowhere else now that the two dialogs are one.
  _renderInteractiveCountryMap(selectedCountry = "cz", address = "") {
    const active = String(selectedCountry || "cz").toLowerCase();
    // The "eu" overview draws all five countries' borders at once (see
    // compose_multi_country_radar_image in meteoradar.py), so picking it here
    // should light up all five shapes too - leaving the map dark for that
    // choice looked like the picker had forgotten about it entirely.
    const isCountryActive = (id) => active === id || active === "eu";
    const countries = [
      { id: "cz", name: "Česká republika" },
      { id: "sk", name: "Slovensko" },
      { id: "de", name: "Německo" },
      { id: "at", name: "Rakousko" },
      { id: "pl", name: "Polsko" },
      { id: "eu", name: "Střední Evropa" },
    ];
    const activeCountryObj = countries.find((c) => c.id === active) || countries[0];

    const config = this._displayTemplateConfig || {};
    const showPrecipitation = config.meteoradar_show_precipitation !== false;
    const showWind = config.meteoradar_show_wind === true;

    return `<div class="interactive-country-map-widget">
      <div class="country-map-header">
        <ha-icon icon="mdi:map-legend"></ha-icon>
        <strong>Radarová mapa</strong>
        <span class="active-country-pill">${this._countryFlagSvg(activeCountryObj.id, 20, 13)} ${this._escape(activeCountryObj.name)}</span>
      </div>
      <div class="country-map-svg-wrap">
        <svg class="country-map-svg" viewBox="0 0 600 450" preserveAspectRatio="xMidYMid meet" aria-label="Interaktivní mapa Střední Evropy pro výběr státu">
          <defs>
            <filter id="mapGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <!-- NĚMECKO (DE) - reálná hranice (geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("de") ? "is-active" : ""}" data-meteoradar-country="de" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Německo">
            <path d="M 160.5 382.9 L 185.6 390.0 L 215.7 374.3 L 240.0 385.8 L 231.1 356.8 L 264.2 327.0 L 228.0 296.0 L 211.0 253.9 L 218.1 261.0 L 281.0 225.9 L 278.4 218.3 L 293.5 229.7 L 301.1 207.6 L 287.2 180.6 L 288.7 143.0 L 272.9 129.6 L 283.0 108.0 L 277.9 81.7 L 242.9 56.6 L 260.7 55.6 L 258.8 39.6 L 246.2 35.1 L 255.6 46.9 L 242.9 41.2 L 242.5 53.1 L 221.0 54.5 L 236.3 47.4 L 223.6 44.5 L 191.1 75.3 L 169.7 68.3 L 180.9 49.2 L 151.9 51.8 L 142.1 45.9 L 143.8 27.8 L 98.3 23.6 L 97.8 14.0 L 93.8 30.3 L 104.0 23.4 L 116.5 45.0 L 103.7 53.4 L 124.4 77.3 L 104.1 76.0 L 92.9 101.0 L 85.5 84.8 L 55.7 93.4 L 61.3 121.0 L 44.8 144.0 L 56.6 159.7 L 46.4 176.8 L 22.3 180.5 L 30.9 203.4 L 19.9 218.7 L 36.5 253.1 L 27.4 266.3 L 46.6 308.7 L 92.4 317.9 L 72.3 357.1 L 75.1 383.8 L 103.1 381.0 L 102.7 371.4 L 122.6 377.9 L 117.1 371.0 L 153.7 395.8 L 160.5 382.9 Z" class="map-country-shape" />
            <g transform="translate(149, 140)">${this._countryFlagSvg("de", 26, 17)}</g>
            <text x="162" y="172" class="map-country-label">DE</text>
          </g>

          <!-- POLSKO (PL) - reálná hranice (geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("pl") ? "is-active" : ""}" data-meteoradar-country="pl" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Polsko">
            <path d="M 414.5 284.5 L 409.3 272.9 L 401.5 273.2 L 392.8 266.0 L 384.9 268.2 L 379.3 261.5 L 384.3 259.3 L 383.0 253.7 L 371.9 256.6 L 358.0 247.7 L 362.0 258.2 L 351.6 264.5 L 336.5 248.5 L 344.1 241.4 L 341.0 237.4 L 331.2 240.4 L 324.8 232.9 L 311.3 231.8 L 305.1 220.0 L 299.4 220.4 L 299.9 227.4 L 294.3 227.2 L 301.1 207.6 L 287.3 180.7 L 292.4 168.5 L 285.5 152.0 L 288.7 143.0 L 272.9 129.7 L 283.0 108.0 L 271.6 46.7 L 277.7 63.3 L 328.7 46.1 L 340.6 32.7 L 364.9 21.4 L 401.5 15.2 L 420.6 25.6 L 442.2 46.1 L 497.4 53.2 L 541.4 48.4 L 559.9 61.9 L 573.1 113.4 L 573.8 136.0 L 559.3 144.2 L 550.5 157.6 L 565.0 168.1 L 561.1 185.2 L 564.8 206.7 L 580.1 227.5 L 574.3 231.0 L 578.6 238.6 L 575.6 249.4 L 567.3 250.6 L 553.6 264.4 L 534.0 291.5 L 541.7 316.0 L 521.3 309.2 L 503.0 295.4 L 487.5 295.9 L 481.4 302.5 L 475.7 296.8 L 466.3 296.7 L 457.5 301.4 L 455.7 307.9 L 446.4 307.0 L 446.6 297.1 L 441.8 297.2 L 436.7 287.5 L 421.8 297.8 L 414.5 284.5 Z" class="map-country-shape" />
            <g transform="translate(410, 174)">${this._countryFlagSvg("pl", 26, 17)}</g>
            <text x="423" y="206" class="map-country-label">PL</text>
          </g>

          <!-- ČESKÁ REPUBLIKA (CZ) - reálná hranice (ČÚZK via geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("cz") ? "is-active" : ""}" data-meteoradar-country="cz" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Českou republiku">
            <path d="M 356.9 259.7 L 349.9 263.8 L 336.9 249.5 L 344.1 241.4 L 341.0 237.4 L 331.2 240.4 L 324.8 232.9 L 311.3 231.8 L 305.1 220.0 L 299.4 220.4 L 299.9 227.4 L 291.3 229.6 L 284.7 218.9 L 278.8 218.3 L 277.1 221.6 L 281.1 225.9 L 264.7 234.2 L 255.4 234.9 L 252.8 240.3 L 249.9 237.9 L 236.9 249.8 L 233.0 247.1 L 223.6 250.1 L 218.1 261.0 L 213.5 253.7 L 210.6 257.1 L 224.6 272.9 L 220.1 280.9 L 228.0 296.0 L 239.4 302.1 L 251.6 317.6 L 261.1 321.7 L 271.2 335.2 L 279.4 337.2 L 283.6 332.7 L 290.8 335.7 L 293.9 326.7 L 299.2 327.0 L 300.4 315.4 L 304.7 319.1 L 308.4 316.6 L 325.6 322.1 L 333.6 328.2 L 342.0 329.0 L 347.0 325.0 L 358.1 329.5 L 359.3 334.2 L 367.2 322.1 L 377.3 325.1 L 388.2 319.7 L 394.7 313.6 L 397.4 302.9 L 403.4 300.9 L 408.7 292.7 L 417.8 292.1 L 409.3 272.9 L 401.5 273.2 L 392.8 266.0 L 389.3 270.2 L 384.9 268.2 L 379.3 261.5 L 384.3 259.3 L 383.0 253.7 L 371.8 256.5 L 371.8 253.4 L 358.3 247.6 L 362.0 258.2 L 356.9 259.7 Z" class="map-country-shape" />
            <g transform="translate(304, 236)">${this._countryFlagSvg("cz", 26, 17)}</g>
            <text x="317" y="268" class="map-country-label">CZ</text>
          </g>

          <!-- SLOVENSKO (SK) - reálná hranice (geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("sk") ? "is-active" : ""}" data-meteoradar-country="sk" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Slovensko">
            <path d="M 514.4 345.1 L 519.1 344.3 L 519.6 335.5 L 524.7 331.1 L 526.1 322.7 L 531.7 312.2 L 516.2 306.4 L 513.2 300.0 L 509.4 298.0 L 507.5 299.7 L 503.0 295.4 L 497.0 297.0 L 492.2 294.7 L 489.6 297.5 L 487.5 295.9 L 485.1 296.7 L 486.6 299.2 L 481.4 302.5 L 475.7 296.8 L 470.7 298.7 L 466.3 296.7 L 457.5 301.4 L 455.7 308.0 L 451.0 305.3 L 446.4 307.0 L 446.6 297.1 L 441.8 297.2 L 436.1 287.5 L 433.5 291.2 L 430.4 291.4 L 427.1 297.4 L 421.8 297.8 L 420.6 292.0 L 408.7 292.7 L 403.4 300.9 L 397.4 302.9 L 393.5 315.0 L 389.4 315.4 L 388.2 319.7 L 385.0 319.8 L 382.7 322.9 L 372.2 325.1 L 367.0 322.2 L 360.1 331.8 L 356.0 345.1 L 363.9 358.0 L 363.9 361.7 L 371.4 362.9 L 382.9 373.8 L 400.7 374.9 L 417.8 371.0 L 414.9 367.3 L 417.0 360.6 L 436.7 358.8 L 438.5 353.3 L 441.7 351.1 L 446.9 353.7 L 446.8 355.6 L 449.9 355.0 L 450.0 356.9 L 454.6 354.9 L 457.1 350.9 L 463.0 350.1 L 469.8 337.5 L 479.1 335.8 L 487.3 340.0 L 497.2 335.7 L 502.5 339.2 L 505.9 346.5 L 514.4 345.1 Z" class="map-country-shape" />
            <g transform="translate(435, 284)">${this._countryFlagSvg("sk", 26, 17)}</g>
            <text x="448" y="316" class="map-country-label">SK</text>
          </g>

          <!-- RAKOUSKO (AT) - reálná hranice (geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("at") ? "is-active" : ""}" data-meteoradar-country="at" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Rakousko">
            <path d="M 160.5 382.8 L 160.0 390.8 L 153.7 395.8 L 145.7 383.3 L 133.1 385.2 L 134.5 405.2 L 149.8 415.1 L 158.5 407.9 L 161.0 414.5 L 173.6 418.6 L 182.3 409.5 L 213.6 403.8 L 212.3 411.8 L 225.1 423.5 L 286.5 436.0 L 301.1 423.6 L 331.7 423.4 L 330.2 415.5 L 339.4 407.3 L 346.2 407.9 L 344.1 389.6 L 352.4 383.6 L 343.4 377.9 L 349.2 373.5 L 364.0 375.9 L 361.4 369.1 L 366.1 362.3 L 356.3 346.4 L 358.1 329.5 L 347.1 325.0 L 333.4 328.1 L 300.5 315.4 L 299.2 326.9 L 294.0 326.6 L 290.7 335.7 L 271.2 335.2 L 264.4 326.9 L 260.9 338.9 L 254.1 335.4 L 248.6 347.7 L 231.1 356.8 L 238.6 369.5 L 235.6 375.2 L 241.0 376.9 L 238.6 387.0 L 231.8 377.5 L 223.2 379.7 L 215.8 374.3 L 214.1 380.5 L 196.7 381.1 L 185.5 390.0 L 160.5 382.8 Z" class="map-country-shape" />
            <g transform="translate(244, 338)">${this._countryFlagSvg("at", 26, 17)}</g>
            <text x="257" y="370" class="map-country-label">AT</text>
          </g>
        </svg>
      </div>

      <div class="country-buttons-row">
        ${countries.map((c) => `<button type="button" class="country-pick-btn ${active === c.id ? "is-active" : ""}" data-meteoradar-country="${c.id}" data-device-address="${this._escape(address)}">
          <span class="country-flag">${this._countryFlagSvg(c.id, 22, 14)}</span>
          <span class="country-name">${this._escape(c.name)}</span>
        </button>`).join("")}
      </div>

      <div class="meteoradar-layers-card">
        <strong><ha-icon icon="mdi:layers-outline"></ha-icon>Vrstvy na mapě</strong>
        <div class="meteoradar-layers-options">
          <label class="meteoradar-layer-toggle">
            <input type="checkbox" id="mrOptPrecipitation" ${showPrecipitation ? "checked" : ""} data-device-address="${this._escape(address)}" />
            <ha-icon icon="mdi:weather-pouring"></ha-icon>
            <span>Srážky<small>Živá data z radaru</small></span>
          </label>
          <label class="meteoradar-layer-toggle">
            <input type="checkbox" id="mrOptWind" ${showWind ? "checked" : ""} data-device-address="${this._escape(address)}" />
            <ha-icon icon="mdi:weather-windy"></ha-icon>
            <span>Vítr<small>Šipky ukazují, kam vítr fouká</small></span>
          </label>
        </div>
      </div>

      <div class="meteoradar-home-note">
        <ha-icon icon="mdi:home-map-marker"></ha-icon>
        <span>Domov se na mapě značí tečkou podle polohy nastavené v Home Assistantu (Nastavení → Systém → Obecné).</span>
      </div>
    </div>`;
  },

  _renderTemplateSetupGuide(template) {
    const recipe = this._templateSetupRecipe(template);

    const integrations = this._templateIntegrationGroups(recipe).map((group) => {
      const docLink = (option) => (option.documentationUrl
        ? `<a href="${this._escape(option.documentationUrl)}" target="_blank" rel="noopener noreferrer" class="template-setup-doc-link"><ha-icon icon="mdi:open-in-new"></ha-icon>${this._escape(option.linkLabel)}</a>`
        : "");
      const body = group.choice
        ? `<p class="template-guide-integration-why">Stačí jedna z těchto možností:</p>
        <ul class="template-guide-integration-options">${group.options.map((option) => `<li>
          <strong>${this._escape(option.name)}</strong>
          <small>${this._escape(option.why)}</small>
          ${docLink(option)}
        </li>`).join("")}</ul>`
        : `<p class="template-guide-integration-why">${this._escape(group.options[0].why)}</p>`;
      return `<li class="template-guide-integration-card ${group.found ? "is-found" : "is-missing"}">
        <div class="template-guide-integration-top">
          <strong>${this._escape(group.label)}</strong>
          <span class="template-setup-status-badge ${group.found ? "is-found" : "is-missing"}">
            <ha-icon icon="mdi:${group.found ? "check-circle" : "alert-circle-outline"}"></ha-icon>
            ${group.found ? "Nalezeno" : "Chybí"}
          </span>
        </div>
        ${body}
        <div class="template-guide-integration-footer">
          <span>${group.found ? `Připraveno (${this._escape(group.domain)}.*)` : `Zatím žádná (${this._escape(group.domain)}.*)`}</span>
          ${group.choice ? "" : docLink(group.options[0])}
        </div>
      </li>`;
    }).join("");

    const steps = (recipe.steps || []).map((step, index) => `<li class="template-guide-step-card"><span class="template-step-num">${index + 1}</span><span class="template-step-text">${this._escape(step)}</span></li>`).join("");

    // The "Nalezeno" badges above only say the integration exists - not that
    // this template's own variables actually resolved to a real entity yet.
    // Both can be true (integration installed, auto-suggest still empty) or
    // both already satisfied, and the numbered steps below always read as an
    // outstanding task either way ("V Nastavit přiřaďte…") because they are
    // static per-template text, not aware of live binding state. A user whose
    // data already came in automatically had no way to tell that apart from
    // one who still had to go pick an entity - this banner is that signal.
    const status = this._templateBindingStatus(template);
    const statusBanner = status.total > 0 ? (
      status.state === "complete"
        ? `<div class="template-setup-status-banner is-complete"><ha-icon icon="mdi:check-decagram"></ha-icon><span><strong>Hotovo automaticky</strong><small>Všech ${status.total} ${status.total === 1 ? "hodnota se" : status.total > 4 ? "hodnot se" : "hodnoty se"} už napojilo samo - kroky níž jsou jen pro kontrolu nebo změnu.</small></span></div>`
        : status.state === "partial"
          ? `<div class="template-setup-status-banner is-partial"><ha-icon icon="mdi:progress-check"></ha-icon><span><strong>${status.done} z ${status.total} hotovo automaticky</strong><small>Zbytek zatím ukazuje ukázková data - dokončete ho v Nastavit u šablony.</small></span></div>`
          : `<div class="template-setup-status-banner is-empty"><ha-icon icon="mdi:progress-alert"></ha-icon><span><strong>Zatím jen ukázková data</strong><small>Žádnou z ${status.total} hodnot se nepodařilo přiřadit automaticky - dokončete je v Nastavit u šablony.</small></span></div>`
    ) : "";

    return `<div class="template-guide-summary-card">
        <ha-icon icon="mdi:lightbulb-outline"></ha-icon>
        <p>${this._escape(recipe.summary)}</p>
      </div>
      ${statusBanner}
      ${integrations ? `<div class="template-guide-section">
        <h4><ha-icon icon="mdi:puzzle-outline"></ha-icon> Co je potřeba v Home Assistantu</h4>
        <ul class="template-guide-integrations-list">${integrations}</ul>
      </div>` : ""}
      <div class="template-guide-section">
        <h4><ha-icon icon="mdi:format-list-numbered"></ha-icon> Postup zprovoznění</h4>
        <ul class="template-guide-steps-list">${steps}</ul>
      </div>
      ${recipe.note ? `<div class="template-setup-note-card">
        <ha-icon icon="mdi:information-outline"></ha-icon>
        <span>${this._escape(recipe.note)}</span>
      </div>` : ""}`;
  },

  _toggleModalScrollLock(active) {
    try {
      const lock = !!active;
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("has-dratek-modal-open", lock);
        if (lock) {
          document.body.style.overflow = "hidden";
        } else {
          document.body.style.overflow = "";
        }
      }
      if (this && this.classList) {
        this.classList.toggle("has-dratek-modal-open", lock);
      }
    } catch (_err) {}
  },

  _renderTemplateSettingsDialog(activeTemplate, selectedSize, largeDisplay) {
    if (!this._templateSettingsDialogOpen) {
      this._toggleModalScrollLock(false);
      return "";
    }
    this._toggleModalScrollLock(true);
    const isRadarTemplate = activeTemplate?.id === "radar" || activeTemplate?.category === "radar" || String(activeTemplate?.id || "").includes("radar");
    const selectedCountry = this._activeMeteoradarCountry();
    const mapWidget = isRadarTemplate ? this._renderInteractiveCountryMap(selectedCountry, this._selectedDeviceAddress) : "";
    const isCustomImageTemplate = activeTemplate?.id === "custom_image";
    const isTransitTemplate = activeTemplate?.id === "transport";
    const customPreviewSize = this._devicePreviewSize?.(this._device?.() ?? null) || { width: 296, height: 128 };
    const customPreviewLong = Math.max(customPreviewSize.width, customPreviewSize.height);
    const customPreviewShort = Math.min(customPreviewSize.width, customPreviewSize.height);
    const customPreviewWidth = this._displayTemplateOrientation === "portrait" ? customPreviewShort : customPreviewLong;
    const customPreviewHeight = this._displayTemplateOrientation === "portrait" ? customPreviewLong : customPreviewShort;
    const customPreviewAsset = this._activeCustomImageAsset?.();
    const customPreviewSource = customPreviewAsset
      ? this._paletteImageSrc(customPreviewAsset, this._device?.())
      : this._customImageDataUrl;
    const customImageWidget = isCustomImageTemplate ? `<div class="custom-image-template-widget">
      <div class="custom-image-template-preview" style="aspect-ratio:${customPreviewWidth}/${customPreviewHeight}">
        <img src="${this._escape(customPreviewSource || this._frontendAssetUrl("images/parrot-source.png"))}" alt="Stínovaný náhled vlastního obrázku">
      </div>
      <input id="customImageTemplateFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      <button type="button" class="primary-action" data-custom-image-template-upload><ha-icon icon="mdi:image-plus"></ha-icon> Vybrat barevný obrázek</button>
      <button type="button" data-custom-image-template-default><ha-icon icon="mdi:bird"></ha-icon> Použít ukázkového papouška</button>
      <small>${this._escape(this._customImageName || "Ukázkový papoušek")}</small>
      <p>Obrázek se automaticky ořízne na přesné rozlišení displeje a barevným rozptylem převede na bílé, černé, červené a žluté fyzické pixely. Oranžová vzniká střídáním červených a žlutých pixelů.</p>
    </div>` : "";

    const crop = this._templateVariableCropContext(activeTemplate);
    // The automatic-refresh controls used to sit here, at the top of the
    // template settings dialog. They are not a property of the template - they
    // belong to the automation - so they live on each automation's own card in
    // the Automations tab now (see panel-automations.mixin.js).
    const transitWidget = isTransitTemplate ? this._renderTransitStopPicker() : "";
    const variableList = `<div class="template-variables-header">
      <h4><ha-icon icon="mdi:${isCustomImageTemplate ? "image-edit-outline" : "tune-vertical"}"></ha-icon> ${isCustomImageTemplate ? "Import obrázku" : "Napojení proměnných"}</h4>
      <p class="template-settings-intro">${isCustomImageTemplate
        ? "Vyberte barevnou fotografii; převod do stínované palety proběhne přímo v prohlížeči a uloží se k tomuto displeji."
        : isTransitTemplate
          ? "Vyhledejte zastávku podle názvu. Drátek pak sám načítá čtyři nejbližší odjezdy při každé automatické aktualizaci displeje."
        : activeTemplate?.manualValues
          ? "U každé položky napište přímo hodnotu, nebo nechte ruční pole prázdné a vyberte entitu Home Assistantu."
          : "U každé položky vyberte entitu v Home Assistantu. Systémové údaje (čas, datum) se doplňují automaticky."}</p>
    </div>
    ${mapWidget}
    ${customImageWidget}
    ${transitWidget}
    ${isTransitTemplate ? "" : `<div class="template-variable-settings">${activeTemplate.variables.map((variable, index) => this._renderTemplateVariableSetting(activeTemplate, variable, index, crop)).join("")}</div>`}`;
    return `<div class="template-settings-backdrop" data-template-settings-close><section class="card template-settings-dialog is-guide-layout" role="dialog" aria-modal="true" aria-label="Nastavení šablony" data-template-settings-dialog>
      <header><span><small>Jak zprovoznit a nastavit šablonu</small><strong>${this._escape(activeTemplate.title)}</strong></span><button type="button" data-template-settings-close title="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button></header>
      <div class="template-settings-dialog-content template-settings-two-col">
        <aside class="template-settings-guide">${this._renderTemplateSetupGuide(activeTemplate)}</aside>
        <div class="template-settings-variables">${variableList}</div>
      </div>
    </section></div>`;
  },

  // Which of the two stop slots the next search result is filed under. Slot 2
  // is optional and only offered once slot 1 holds something - "druhá
  // zastávka" is meaningless without a first one.
  _transitStopSlotTarget() {
    const config = this._displayTemplateConfig || {};
    const slot = Number(this._transitStopSlot) === 2 ? 2 : 1;
    return String(config.transit_stop_id || "").trim() ? slot : 1;
  },

  _renderTransitStopSlot(slot) {
    const config = this._displayTemplateConfig || {};
    const suffix = slot === 2 ? "_2" : "";
    const name = String(config[`transit_stop_name${suffix}`] || "");
    if (!name) return "";
    return `<div class="template-setup-status-banner is-complete">
      <ha-icon icon="mdi:${slot === 2 ? "bus-multiple" : "bus-stop-covered"}"></ha-icon>
      <span><strong>${this._escape(name)}</strong><small>${slot === 2 ? "Druhá zastávka – odjezdy se slučují do jedné tabule." : "Zastávka je uložená pro tento displej."}</small></span>
      <span class="transit-stop-slot-actions">
        <button type="button" class="ghost" data-transit-stop-slot="${slot}">Změnit</button>
        ${slot === 2 ? `<button type="button" class="ghost" data-transit-stop-clear="2">Odebrat</button>` : ""}
      </span>
    </div>`;
  },

  _renderTransitStopPicker() {
    const config = this._displayTemplateConfig || {};
    const first = String(config.transit_stop_name || "");
    const second = String(config.transit_stop_name_2 || "");
    const target = this._transitStopSlotTarget();
    const results = Array.isArray(this._transitStopResults) ? this._transitStopResults : [];
    const error = this._transitSearchError
      ? `<div class="template-setup-note-card"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>${this._escape(this._transitSearchError)}</span></div>`
      : "";
    // Offered, not forced: most displays watch one stop, and the second slot
    // stays out of the way until it is asked for.
    const addSecond = first && !second && target !== 2
      ? `<button type="button" class="ghost transit-stop-add" data-transit-stop-slot="2"><ha-icon icon="mdi:plus"></ha-icon>Přidat druhou zastávku</button>`
      : "";
    const searchTitle = target === 2 ? "Najít druhou zastávku" : "Najít zastávku";
    return `<section class="transit-stop-picker">
      ${error}
      ${this._renderTransitStopSlot(1)}
      ${this._renderTransitStopSlot(2)}
      ${addSecond}
      <label><strong>${searchTitle}</strong><span><input type="search" data-transit-stop-query value="${this._escape(this._transitStopQuery || "")}" placeholder="např. Brno, Česká"><button type="button" class="primary-action" data-transit-stop-search ${this._transitSearchLoading ? "disabled" : ""}><ha-icon icon="mdi:${this._transitSearchLoading ? "loading" : "magnify"}"></ha-icon>Hledat</button></span></label>
      ${results.length ? `<div class="transit-stop-results">${results.map((stop) => `<button type="button" data-transit-stop-id="${this._escape(stop.id)}" data-transit-stop-name="${this._escape(stop.name)}"><ha-icon icon="mdi:bus-stop"></ha-icon><span><strong>${this._escape(stop.name)}</strong><small>${this._escape([stop.locality, stop.country].filter(Boolean).join(" · "))}</small></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>`).join("")}</div>` : ""}
      <small class="template-picker-help">Data poskytuje Transitous z otevřených jízdních řádů dopravců. <a href="https://transitous.org/sources/" target="_blank" rel="noopener noreferrer">Použité zdroje</a></small>
    </section>`;
  },

  _setTransitStopSlot(slot) {
    this._transitStopSlot = Number(slot) === 2 ? 2 : 1;
    this._transitStopResults = [];
    this._transitSearchError = "";
    this._render();
    this._paint();
  },

  _clearTransitStop(slot) {
    if (Number(slot) !== 2) return;
    this._displayTemplateConfig ||= {};
    this._displayTemplateConfig.transit_stop_id_2 = "";
    this._displayTemplateConfig.transit_stop_name_2 = "";
    this._transitStopSlot = 1;
    // The merged board is cached under a key naming both stops, so dropping
    // one has to invalidate it or the removed stop keeps printing.
    this._transitPreview = null;
    this._rememberTransitStopInDraft();
    this._scheduleDraftSave?.();
    this._render();
    this._paint();
  },

  async _searchTransitStops() {
    const input = this.shadowRoot?.querySelector("[data-transit-stop-query]");
    const query = String(input?.value || this._transitStopQuery || "").trim();
    this._transitStopQuery = query;
    if (query.length < 2) {
      this._transitSearchError = "Napište alespoň dva znaky názvu zastávky.";
      this._render();
      return;
    }
    this._transitSearchLoading = true;
    this._transitSearchError = "";
    this._render();
    try {
      const response = await this._hass.callWS({ type: "dratek_eink/transit/search_stops", query, limit: 10 });
      this._transitStopResults = Array.isArray(response?.stops) ? response.stops : [];
      if (!this._transitStopResults.length) this._transitSearchError = "Žádná zastávka s tímto názvem nebyla nalezena.";
    } catch (error) {
      this._transitSearchError = this._message?.(error) || String(error?.message || error);
    } finally {
      this._transitSearchLoading = false;
      this._render();
      this._paint();
    }
  },

  // Mirrors the chosen stop into this display's cached draft, exactly the way
  // the meteoradar country and the custom-image data do. _scheduleDraftSave
  // rebuilds the payload from _displayTemplateConfig on its own, but it also
  // refuses to run at all until this device's stored draft has been read back
  // (_draftIsLoadedForSelectedDevice) - and the picker is reachable in that
  // window. Without the mirror the stop was then held only in a field nothing
  // persists, so it survived until the next reload and no further.
  _rememberTransitStopInDraft() {
    const address = String(this._selectedDeviceAddress || "").toUpperCase();
    if (!address) return;
    this._deviceDrafts ||= {};
    const draft = this._deviceDrafts[address] || {};
    draft.template_config ||= {};
    draft.template_config.transit_stop_id = String(this._displayTemplateConfig?.transit_stop_id || "");
    draft.template_config.transit_stop_name = String(this._displayTemplateConfig?.transit_stop_name || "");
    draft.template_config.transit_stop_id_2 = String(this._displayTemplateConfig?.transit_stop_id_2 || "");
    draft.template_config.transit_stop_name_2 = String(this._displayTemplateConfig?.transit_stop_name_2 || "");
    this._deviceDrafts[address] = draft;
  },

  async _selectTransitStop(stopId, stopName) {
    this._displayTemplateConfig ||= {};
    const suffix = this._transitStopSlotTarget() === 2 ? "_2" : "";
    this._displayTemplateConfig[`transit_stop_id${suffix}`] = String(stopId || "");
    this._displayTemplateConfig[`transit_stop_name${suffix}`] = String(stopName || "");
    // The board is cached under a key naming both stops; changing either one
    // has to drop it rather than let the old pair keep printing.
    this._transitPreview = null;
    this._transitStopSlot = 1;
    this._transitStopResults = [];
    this._transitSearchError = "";
    // Persisted before the live board is fetched, not after it. The fetch is a
    // call to a public timetable server that legitimately fails (it is down,
    // it rate-limits, the HA host is offline) - and while the save sat behind
    // it, every one of those failures threw the user's choice away as well as
    // the preview, so the picker came back empty on the next open.
    this._rememberTransitStopInDraft();
    this._scheduleDraftSave?.();
    try {
      const response = await this._hass.callWS({
        type: "dratek_eink/transit/departures", stop_id: stopId, limit: 4,
      });
      // The provider's own spelling of the stop wins over the search result's,
      // so the board's header reads the same as the departures under it.
      const providerName = String(response?.stop_name || stopName || "");
      if (providerName) this._displayTemplateConfig[`transit_stop_name${suffix}`] = providerName;
      // Deliberately not written into _transitPreview: that cache now holds the
      // merged board for both stops, and a single stop's response is not it.
      // _ensureTemplateTransitBoard refetches on the next repaint, which is the
      // only thing that knows how to merge.
      this._rememberTransitStopInDraft();
      this._scheduleDraftSave?.();
    } catch (error) {
      this._transitSearchError = this._message?.(error) || String(error?.message || error);
    }
    this._render();
    this._paint();
  },


  _renderTemplateSaveRow() {
    return `<div class="template-designer-save-row">
      <button type="button" class="template-designer-save-btn" data-template-save>
        <ha-icon icon="mdi:content-save-outline"></ha-icon> Uložit šablonu
      </button>
    </div>`;
  },

  _renderTemplateSelectionBar(activeTemplate, previewZoom, viewport) {
    const item = this._templateEditorElement();
    const partKey = String(this._selectedTemplatePart || "");
    const partAdjustment = partKey ? this._templateElementAdjustments?.[partKey] : null;
    const hasSelection = !!(item || partAdjustment);
    const disabled = hasSelection ? "" : "disabled";
    const partQuarterTurn = Math.abs(Math.round(Number(partAdjustment?.rotation || 0) / 90)) % 2 === 1;
    const partLandscape = Number(partAdjustment?.baseWidth || 0) >= Number(partAdjustment?.baseHeight || 0);
    const areaOrientation = item
      ? (Number(item.w || 0) >= Number(item.h || 0) ? "landscape" : "portrait")
      : ((partQuarterTurn ? !partLandscape : partLandscape) ? "landscape" : "portrait");
    // The four viewports are really two independent choices - which panel and
    // which way up - and offering them as four opaque icons behind a popup made
    // the user work that out for themselves every time. Two labelled pairs say
    // the same thing without hiding anything, and the resolution beside them
    // answers the question the icons never could: what am I designing for.
    const viewportShapes = {
      narrow: { large: false, portrait: true, width: 128, height: 296 },
      wide: { large: false, portrait: false, width: 296, height: 128 },
      large: { large: true, portrait: false, width: 800, height: 480 },
      "large-portrait": { large: true, portrait: true, width: 480, height: 800 },
    };
    const shape = viewportShapes[viewport] || viewportShapes.wide;
    const viewportFor = (large, portrait) => large
      ? (portrait ? "large-portrait" : "large")
      : (portrait ? "narrow" : "wide");
    // The orientation pair keeps its icons - a portrait and a landscape
    // rectangle *are* the meaning, and read faster than the words. The size
    // pair drops them: "Malý"/"Velký" says it, and two more glyphs only cost
    // the bar the width it has none of.
    const formatButton = (target, active, icon, label, hint) => `<button type="button" class="${active ? "is-active" : ""}"`
      + ` data-template-designer-viewport="${target}" aria-pressed="${active}" title="${this._escape(hint)}">`
      + `${icon ? `<ha-icon icon="mdi:${icon}"></ha-icon>` : ""}<span>${this._escape(label)}</span></button>`;
    const resolutionOf = (id) => `${viewportShapes[id].width} × ${viewportShapes[id].height} px`;
    const zoomPercent = Math.round(previewZoom * 100);
    return `<section class="template-selection-bar is-locked-controls ${hasSelection ? "has-selection" : "has-no-selection"}" aria-label="Pevné ovládání designeru">
      <div class="template-selection-fixed-tools">
        <div class="template-toolbar-cluster is-view">
        <div class="template-format-control" role="group" aria-label="Formát šablony">
          <span class="template-format-group is-size" role="group" aria-label="Velikost displeje">
            ${formatButton(viewportFor(false, shape.portrait), !shape.large, "", "Malý", `Malý cenovkový tag - ${resolutionOf(viewportFor(false, shape.portrait))}`)}
            ${formatButton(viewportFor(true, shape.portrait), shape.large, "", "Velký", `Velký displej - ${resolutionOf(viewportFor(true, shape.portrait))}`)}
          </span>
          <span class="template-format-group is-orientation" role="group" aria-label="Orientace šablony">
            ${formatButton(viewportFor(shape.large, true), shape.portrait, "crop-portrait", "Na výšku", `Na výšku - ${resolutionOf(viewportFor(shape.large, true))}`)}
            ${formatButton(viewportFor(shape.large, false), !shape.portrait, "crop-landscape", "Na šířku", `Na šířku - ${resolutionOf(viewportFor(shape.large, false))}`)}
          </span>
          <span class="template-format-size" aria-label="Rozlišení šablony">${shape.width} × ${shape.height} px</span>
        </div>
        <span class="template-selection-divider"></span>
        <div class="template-zoom-control" title="Kolečkem myši přiblížíte, tažením plátna posunete">
          <ha-icon icon="mdi:mouse"></ha-icon>
          <button type="button" data-template-designer-zoom-reset title="Zpět na 100 % a vycentrovat"><b data-template-designer-zoom-value>${zoomPercent} %</b></button>
        </div>
        </div>
        <span class="template-selection-divider"></span>
        <div class="template-selection-tool-group template-toolbar-cluster is-actions" role="toolbar" aria-label="Historie, transformace a vrstvy">
          <button type="button" data-template-history="undo" title="Zpět" ${this._templateUndoStack?.length ? "" : "disabled"}><ha-icon icon="mdi:undo"></ha-icon></button>
          <button type="button" data-template-history="redo" title="Vpřed" ${this._templateRedoStack?.length ? "" : "disabled"}><ha-icon icon="mdi:redo"></ha-icon></button>
          <span class="template-selection-divider"></span>
          <button type="button" class="${hasSelection && areaOrientation === "portrait" ? "is-active" : ""}" data-template-element-area-orientation="portrait" title="Postavit vybraný prvek na výšku" aria-label="Postavit vybraný prvek na výšku" ${disabled}><ha-icon icon="mdi:crop-portrait"></ha-icon></button>
          <button type="button" class="${hasSelection && areaOrientation === "landscape" ? "is-active" : ""}" data-template-element-area-orientation="landscape" title="Položit vybraný prvek na šířku" aria-label="Položit vybraný prvek na šířku" ${disabled}><ha-icon icon="mdi:crop-landscape"></ha-icon></button>
          <span class="template-selection-divider"></span>
          <button type="button" data-template-element-rotate="-90" title="Otočit o 90° doleva" ${disabled}><ha-icon icon="mdi:rotate-left"></ha-icon></button>
          <button type="button" data-template-element-rotate="90" title="Otočit o 90° doprava" ${disabled}><ha-icon icon="mdi:rotate-right"></ha-icon></button>
          <span class="template-selection-divider"></span>
          <button type="button" data-template-element-order="back" title="Přenést do pozadí" ${disabled}><ha-icon icon="mdi:arrange-send-backward"></ha-icon></button>
          <button type="button" data-template-element-order="front" title="Přenést do popředí" ${disabled}><ha-icon icon="mdi:arrange-bring-forward"></ha-icon></button>
          <span class="template-selection-divider"></span>
          <button type="button" data-template-element-duplicate title="Duplikovat" ${disabled}><ha-icon icon="mdi:content-duplicate"></ha-icon></button>
          <button type="button" class="is-danger" data-template-element-delete title="Smazat" ${disabled}><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
        </div>
      </div>
    </section>`;
  },


  // Resolves the fallback SVG renderer request. The normal send path captures
  // the visible HTML template so the editor and physical display stay WYSIWYG.
  _currentDisplayTemplateSvgRequest(device = this._device()) {
    if (!device) return null;
    const cards = this._displayTemplateCards();
    const assigned = this._assignedDisplayTemplates(device);
    // Keep "blank" (and any unresolved id) as an explicit gap instead of
    // dropping it - _buildDisplayTemplateSvg zips this array against the
    // layout's slots by index, so compacting it here used to shift every
    // template after the first blank slot forward onto the wrong position by
    // the time the image was actually built. The live editor preview never
    // went through this compaction (it draws straight from
    // _displayTemplateAssignments), which is why only the physically
    // sent/rendered image ever landed templates in the wrong spot, not the
    // editor.
    const templates = assigned.map((id) => cards.find((item) => item.id === id) || null);
    const realCount = templates.filter(Boolean).length;
    if (!realCount) return null;
    const base = this._baseDisplaySize(device);
    const portrait = this._displayTemplateOrientation === "portrait";
    const width = portrait ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
    const height = portrait ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
    const size = this._devicePreviewSize(device);
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const layout = largeDisplay && realCount > 1
      ? this._displayTemplateLayoutDefinition(this._displayTemplateLargeLayout).id
      : "single";
    // "single" always means exactly one slot - grab whichever real template
    // exists regardless of which array position it happens to sit at, the
    // same as before this kept blank gaps around.
    const visibleTemplates = layout === "single"
      ? [templates.find(Boolean)]
      : templates.slice(0, this._displayTemplateLayoutDefinition(layout).capacity);
    return { templates: visibleTemplates, width, height, layout };
  },

  // The image the panel receives comes from the same builder that draws the
  // preview, at the display's exact resolution.
  //
  // It used to be a screenshot of the live DOM: the visible preview was cloned
  // into a foreignObject and rasterised. That clone lost the scale transform and
  // the positioning context of the parent it was cut away from, so the drawing
  // landed off-centre inside the exported bitmap - 7 px of blank down the left of
  // a portrait tag and 51 px, a sixth of the panel, on a landscape one, while the
  // preview on screen looked correct. Building the SVG directly has no DOM to
  // lose: what the renderer lays out is what the panel gets, to the pixel.
  _customImageCycleAssets() {
    const assets = this._templateImageLibrary || [];
    return (this._customImageCycleIds || [])
      .map((id) => assets.find((asset) => asset.id === id))
      .filter(Boolean);
  },

  _activeCustomImageAsset(now = this._customImagePreviewNow || Date.now()) {
    const assets = this._templateImageLibrary || [];
    const selected = this._customImageCycleAssets();
    if (this._customImageCycleEnabled && selected.length > 1) {
      const interval = Math.max(1, Number(this._customImageCycleMinutes) || 10) * 60 * 1000;
      return selected[Math.floor(now / interval) % selected.length];
    }
    // A single library image the user never explicitly marked "active" or
    // added to the cycle list is still the only sensible image to show - the
    // catalog preview otherwise sits on the empty "Přidat obrázek" placeholder
    // forever despite the gallery already holding a photo.
    return assets.find((asset) => asset.id === this._customImageActiveId) || selected[0] || assets[0] || null;
  },

  _scheduleCustomImageCyclePreview(now = Date.now()) {
    window.clearTimeout(this._customImageCyclePreviewTimer);
    this._customImageCyclePreviewTimer = null;
    if (!this._customImageCycleEnabled || this._customImageCycleAssets().length < 2) return;
    const interval = Math.max(1, Number(this._customImageCycleMinutes) || 10) * 60 * 1000;
    const delay = Math.max(50, interval - (now % interval) + 25);
    this._customImageCyclePreviewTimer = window.setTimeout(() => {
      this._customImageCyclePreviewTimer = null;
      this._render();
      this._paint();
    }, delay);
  },

  async _renderCurrentDisplayTemplateImage(device = this._device(), customSourceOverride = "") {
    const request = this._currentDisplayTemplateSvgRequest(device);
    if (!request) throw new Error("Není vybrána žádná šablona.");
    const overlays = this._collectTemplateOverlayBoxes(request);
    const previousCustomImage = this._customImageDataUrl;
    const usesCustomImage = request.templates.some((template) =>
      template?.id === "custom_image" || template?.base_template_id === "custom_image"
    );
    // Rebuild from the untouched source for every physical render. Cached BWR
    // and BWRY thumbnails are UI accelerators only; they are never an input to
    // the bitmap sent to a display.
    const activeAsset = customSourceOverride ? null : this._activeCustomImageAsset(Date.now());
    const activeSource = customSourceOverride || activeAsset?.source || this._customImageSourceUrl;
    const activeVariants = activeAsset?.variants || this._customImageVariants;
    const targetCustomImage = usesCustomImage && activeSource
      ? await this._renderCustomImageTemplateForDevice(activeSource, device)
      : this._paletteImageSrc({
        src: previousCustomImage,
        source: activeSource,
        variants: activeVariants,
      }, device);
    if (targetCustomImage) this._customImageDataUrl = targetCustomImage;
    const renderingScope = this._pushRenderingDevice(device?.address);
    try {
      // Template blocks draw themselves as SVG, which has to be decoded into an
      // image before the painter - which is synchronous - can put it on the
      // canvas. Inside the try so a failure here still restores the rendering
      // device and the custom image below.
      await this._prepareTemplateOverlayImages(overlays, request.width, request.height);
      return await this._rasterizeDisplayTemplateSvg(
        request.templates,
        request.width,
        request.height,
        request.layout,
        overlays.length ? (context, width, height) => this._paintTemplateOverlays(context, overlays, width, height) : null,
      );
    } finally {
      this._popRenderingDevice(renderingScope);
      this._customImageDataUrl = previousCustomImage;
    }
  },

  // Which elements a slot's template carries. Exactly the resolution
  // _renderTemplateEditorOverlays and the automation bindings already use:
  // _templateEditorElements holds only the template currently open in the
  // editor, every other one keeps its own list in _templateEditorStates (put
  // there by _rememberActiveTemplateEditorState the instant editing moves
  // away) or, for a saved template never opened this session, on the template
  // itself.
  _templateEditorElementsFor(template) {
    if (!template) return [];
    const id = String(template.id || "");
    if (id && id === this._activeTemplateEditorStateId()) return this._templateEditorElements || [];
    return this._templateEditorStates?.[id]?.editor_elements
      || (template.user_created ? template.editor_elements : null)
      || [];
  },

  // The overlay elements, in fractions of the whole panel, ready for the
  // painter.
  //
  // This used to measure the DOM: it looked up the designer's own surface and
  // walked the .template-overlay nodes inside it. That made the bitmap depend
  // on what happened to be on screen, and it dropped elements in three
  // different ways. With the designer stage not mounted - which is the case
  // for every device-preview thumbnail, since those render from the overview
  // and the settings pane - there is no surface, so it returned nothing at all
  // and the custom elements were missing from the preview. It read only
  // _templateEditorElements, so a multi-slot layout kept the elements of
  // whichever template was open and silently lost every other slot's. And it
  // took the first surface only, so slot 1's percentages were applied to the
  // whole display rather than to that slot's rectangle.
  //
  // Reading the model instead makes the send and the preview independent of
  // the DOM, and lets each slot's elements land inside their own slot.
  _collectTemplateOverlayBoxes(request) {
    const templates = request?.templates || [];
    if (!templates.length) return [];
    const width = Math.max(1, Number(request.width) || 1);
    const height = Math.max(1, Number(request.height) || 1);
    const slots = this._displayTemplateLayoutSlots(request.layout, width, height);
    const boxes = [];
    templates.forEach((template, slotIndex) => {
      if (!template) return;
      const slot = slots[slotIndex] || slots[0] || { x: 0, y: 0, w: width, h: height };
      for (const source of this._templateEditorElementsFor(template)) {
        boxes.push(this._templateOverlayBox(source, template, slot, width, height));
      }
    });
    return boxes;
  },

  _templateOverlayBox(source, template, slot, width, height) {
    const model = this._quarterTurnedUserTemplateElement(source, template);
    return {
      kind: model.type || "rect",
      blockKind: String(model.blockKind || ""),
      gridColor: model.gridColor || "", labelColor: model.labelColor || "",
      valueColor: model.valueColor || "", pointColor: model.pointColor || "", trackColor: model.trackColor || "",
      block: model.block && typeof model.block === "object" ? structuredClone(model.block) : null,
      // Element coordinates are percentages of the slot they were designed
      // in; the painter wants fractions of the whole panel.
      x: (slot.x + (Number(model.x || 0) / 100) * slot.w) / width,
      y: (slot.y + (Number(model.y || 0) / 100) * slot.h) / height,
      w: ((Number(model.w || 2) / 100) * slot.w) / width,
      h: ((Number(model.h || 2) / 100) * slot.h) / height,
      text: model.text || model.label || "",
      unit: String(model.unit || ""), chartTitle: String(model.chartTitle || ""),
      chartMin: model.chartMin ?? "", chartMax: model.chartMax ?? "",
      // The palette-matched variant, the same one the preview's <img> shows.
      src: this._paletteImageSrc(model),
      source: String(model.source || ""),
      icon: model.icon || "star", color: model.color || "#111111", fill: model.fill || "transparent",
      variant: model.variant || "default",
      stroke: model.stroke || "#111111", strokeWidth: Number(model.strokeWidth ?? 2), radius: Number(model.radius || 0),
      fontSize: Number(model.fontSize || 16), fontWeight: String(model.fontWeight || "700"), fontFamily: String(model.fontFamily || "DRATEK eInk Sans"), fontStyle: model.fontStyle === "italic" ? "italic" : "normal", textDecoration: model.textDecoration || "none", textAlign: model.textAlign || "center",
      textOutlineWidth: Number(model.textOutlineWidth || 0), textOutlineColor: model.textOutlineColor || "#ffffff", textBorderWidth: Number(model.textBorderWidth || 0), textBorderColor: model.textBorderColor || "#111111", overlayOpacity: Number(model.overlayOpacity ?? 100),
      value: Number.isFinite(Number(model.value)) ? Number(model.value) : 50, rotation: Number(model.rotation || 0),
      showValue: model.showValue !== false, showPercent: model.showPercent !== false, showLabel: model.showLabel !== false,
      showGrid: model.showGrid !== false, showPoints: model.showPoints !== false, showFill: model.showFill !== false,
      showTrack: model.showTrack !== false, showScale: model.showScale !== false, showIcon: model.showIcon !== false, showState: model.showState !== false,
      historyLimit: Number(model.historyLimit || 10), historyValues: structuredClone(model.historyValues || []),
      resolvedActive: typeof model.resolvedActive === "boolean" ? model.resolvedActive : undefined,
    };
  },

  // Opacity means nothing to a panel with three inks: the quantizer has no
  // shade between ink and paper to give it. A background at 50% black was
  // filled with rgb(128) and thresholded straight to solid black, and one at
  // 30% landed on rgb(178) and thresholded to nothing at all - the box simply
  // was not on the printed picture. Snapping to the four ordered screens the
  // preview's CSS draws too gives a density the hardware can print, in pixels
  // that are already pure ink or pure paper and so survive the quantizer
  // untouched.
  //
  // The pattern is anchored to the canvas origin rather than to the box, which
  // is what keeps two adjacent screened boxes in phase with each other.
  _overlayFillStyle(context, color, opacity) {
    const density = Math.round(Math.max(0, Math.min(100, Number(opacity ?? 100))) / 25) * 25;
    if (density >= 100) return color;
    if (density <= 0) return null;
    const cell = document.createElement("canvas");
    cell.width = 2;
    cell.height = 2;
    const cellContext = cell.getContext("2d");
    cellContext.fillStyle = color;
    ({ 25: [[0, 0]], 50: [[0, 0], [1, 1]], 75: [[0, 0], [1, 1], [1, 0]] }[density] || [])
      .forEach(([dx, dy]) => cellContext.fillRect(dx, dy, 1, 1));
    return context.createPattern(cell, "repeat");
  },

  // The CSS half of the same four screens, so the designer shows a halftone
  // where the panel prints one. `transparent` in a gradient interpolates
  // through transparent black in some engines, so the stops are hard and the
  // unpainted quadrants are left to the element's own background.
  _overlayFillScreenStyle(fill, opacity) {
    const density = Math.round(Math.max(0, Math.min(100, Number(opacity ?? 100))) / 25) * 25;
    if (fill === "transparent" || density <= 0) return "--element-fill-screen:none;--element-fill-screen-color:transparent";
    if (density >= 100) return "--element-fill-screen:none;--element-fill-screen-color:var(--element-fill)";
    // One quadrant of the 2px cell per 25%, written out as explicit stops
    // rather than leaning on the spec's clamping of an out-of-order position.
    const ink = "var(--element-fill)";
    const stops = {
      25: `${ink} 0deg 90deg,transparent 90deg 360deg`,
      50: `${ink} 0deg 90deg,transparent 90deg 180deg,${ink} 180deg 270deg,transparent 270deg 360deg`,
      75: `${ink} 0deg 270deg,transparent 270deg 360deg`,
    }[density];
    return `--element-fill-screen:conic-gradient(${stops});--element-fill-screen-color:transparent`;
  },

  _paintTemplateOverlays(context, overlays, width, height) {
    const paintRichText = (item, x, y, w, h, padding = 0) => {
      const size = Math.max(7, item.fontSize * Math.min(width, height) / 300);
      const family = String(item.fontFamily || "DRATEK eInk Sans").replace(/["']/g, "");
      const textX = item.textAlign === "left" ? x + padding : item.textAlign === "right" ? x + w - padding : x + w / 2;
      const textY = y + h / 2;
      if (item.fill !== "transparent") {
        const style = this._overlayFillStyle(context, item.fill, item.overlayOpacity);
        if (style) { context.save(); context.fillStyle = style; context.fillRect(x, y, w, h); context.restore(); }
      }
      if (Number(item.textBorderWidth || 0) > 0) {
        context.strokeStyle = item.textBorderColor || "#111111"; context.lineWidth = Math.max(1, Number(item.textBorderWidth) * Math.min(width, height) / 300); context.strokeRect(x, y, w, h);
      }
      context.font = `${item.fontStyle === "italic" ? "italic " : ""}${item.fontWeight} ${size}px "${family}", Arial, Helvetica, sans-serif`;
      context.textBaseline = "middle"; context.textAlign = item.textAlign || "center";
      if (Number(item.textOutlineWidth || 0) > 0) {
        context.strokeStyle = item.textOutlineColor || "#ffffff"; context.lineWidth = Math.max(1, Number(item.textOutlineWidth) * Math.min(width, height) / 300); context.strokeText(item.text, textX, textY, Math.max(1, w - padding * 2));
      }
      context.fillStyle = item.color || "#111111"; context.fillText(item.text, textX, textY, Math.max(1, w - padding * 2));
      if (["underline", "line-through"].includes(item.textDecoration)) {
        const measured = Math.min(w - padding * 2, context.measureText(item.text).width);
        const startX = item.textAlign === "left" ? textX : item.textAlign === "right" ? textX - measured : textX - measured / 2;
        const lineY = item.textDecoration === "underline" ? textY + size * .42 : textY;
        context.strokeStyle = item.color || "#111111"; context.lineWidth = Math.max(1, size * .07); context.beginPath(); context.moveTo(startX, lineY); context.lineTo(startX + measured, lineY); context.stroke();
      }
    };
    context.save();
    for (const item of overlays) {
      // Whole pixels, and the same rounding _prepareTemplateOverlayImages used
      // to pick the raster size. A blit onto a fractional offset, or at a size
      // half a pixel away from the bitmap's own, makes the browser resample -
      // and resampling a one-pixel halftone screen turns it back into the grey
      // the screen exists to avoid.
      const x = Math.round(item.x * width);
      const y = Math.round(item.y * height);
      const w = Math.max(1, Math.round(item.w * width));
      const h = Math.max(1, Math.round(item.h * height));
      context.save();
      context.translate(x + w / 2, y + h / 2);
      context.rotate((item.rotation || 0) * Math.PI / 180);
      context.translate(-(x + w / 2), -(y + h / 2));
      context.fillStyle = item.color || "#111111";
      context.strokeStyle = item.stroke || "#111111";
      context.lineWidth = Math.max(1, item.strokeWidth * Math.min(width, height) / 300);
      if (item.kind === "image") {
        // _prepareTemplateOverlayPhotos re-dithered the original at exactly
        // this box; it waited for the decode, so unlike the `new Image()` this
        // used to build here - whose .complete was still false on the very
        // first send, which quietly dropped the picture - there is something
        // to draw.
        if (item.overlayImage) {
          const smoothing = context.imageSmoothingEnabled;
          // The source is already exactly black/white/red. Interpolation would
          // invent warm edge colours and the final quantizer could turn those
          // into false red pixels, so scale it like actual eInk pixels.
          context.imageSmoothingEnabled = false;
          context.drawImage(item.overlayImage, x, y, w, h);
          context.imageSmoothingEnabled = smoothing;
        }
      } else if (item.kind === "block" || this._isTemplateComponentKind(item.kind)) {
        // Already rasterised at exactly w x h from the same SVG the preview
        // shows, so this is a straight blit. It replaces a canvas
        // re-implementation per kind that had drifted badly from the preview -
        // the icon branch drew a "◆" because it could not reach the glyph.
        //
        // Smoothing off and on whole pixels: the block and component markup
        // now carries one-pixel halftone screens, and resampling those turns
        // a halftone back into the grey it exists to avoid.
        if (item.overlayImage) {
          const smoothing = context.imageSmoothingEnabled;
          context.imageSmoothingEnabled = false;
          context.drawImage(item.overlayImage, x, y, w, h);
          context.imageSmoothingEnabled = smoothing;
        }
      } else if (item.kind === "text") {
        paintRichText(item, x, y, w, h);
      } else if (item.kind === "line") {
        context.beginPath();
        context.moveTo(x, y + h / 2);
        context.lineTo(x + w, y + h / 2);
        context.stroke();
      } else if (item.kind === "circle") {
        if (item.fill !== "transparent") { context.fillStyle = item.fill; context.beginPath(); context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); context.fill(); }
        context.beginPath();
        context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        context.stroke();
      } else {
        if (item.fill !== "transparent") { context.fillStyle = item.fill; context.fillRect(x, y, w, h); }
        context.strokeRect(x, y, w, h);
      }
      context.restore();
    }
    context.restore();
  },

  _templateAutomationNodeOffset(node) {
    let x = 0;
    let y = 0;
    for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
      const transform = String(parent.getAttribute?.("transform") || "");
      const match = transform.match(/translate\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?\s*\)/);
      if (match) {
        x += Number(match[1] || 0);
        y += Number(match[2] || 0);
      }
    }
    return { x, y };
  },

  _templateAutomationPalette(value, fallback = "black") {
    const normalized = String(value || "").trim().toLowerCase();
    if (["#fff", "#ffffff", "white", "rgb(255,255,255)"].includes(normalized.replace(/\s/g, ""))) return "white";
    if (["#e31b1b", "#d71912", "#dc140c", "red", "rgb(220,20,12)"].includes(normalized.replace(/\s/g, ""))) return "red";
    if (["#000", "#000000", "black", "#111", "#111111"].includes(normalized.replace(/\s/g, ""))) return "black";
    return fallback;
  },

  // Builds the automation binding for one series()/ratio()/day()/event()-driven
  // row, keyed by the row's own `group` name. `group` alone is enough for a
  // forecast strip ("forecast") or a calendar entry ("event-0"/"event-1") -
  // both resolve their entity the same way the live helpers already do
  // (_templateEntityForKind), and the index rides on the group suffix. A
  // ratio()/series() row also needs template.automation (declared next to
  // design() in the template file) to know which variable index feeds it,
  // since by the time a row exists ratio()/series() have already collapsed
  // to a plain number and there is no trace of where it came from.
  // Where a template's `automation` block is read from.
  //
  // It is declared on the template module, beside `catalog` - but what reaches
  // this method is a catalog *card*: id, number, category, title, variables,
  // kind, and nothing else (see _displayTemplateCards). `template.automation`
  // was therefore undefined for every template that declares one, so the ratio
  // and chart branches below returned null and no gauge or chart in the
  // catalog was ever redrawn by an automatic refresh - each stayed frozen at
  // whatever the manual send happened to draw. Looked up by id instead, which
  // works whichever of the two shapes the caller has.
  _templateAutomationDeclarations(template) {
    const id = String(template?.id || "");
    return DISPLAY_TEMPLATES_BY_ID[id]?.automation || template?.automation || null;
  },

  _templateAutomationGraphicBinding(template, group, row, geometry) {
    if (group === "transport-board") {
      const stopId = String(this._displayTemplateConfig?.transit_stop_id || "").trim();
      if (!stopId) return null;
      return {
        type: "transit",
        stop_id: stopId,
        stop_name: String(this._displayTemplateConfig?.transit_stop_name || ""),
        // The optional second stop travels with the binding so an automatic
        // refresh merges the same pair the manual send did - a board that
        // dropped back to one stop overnight is worse than no board.
        stop_id_2: String(this._displayTemplateConfig?.transit_stop_id_2 || "").trim(),
        stop_name_2: String(this._displayTemplateConfig?.transit_stop_name_2 || ""),
        limit: Array.isArray(row.board) ? row.board.length : 4,
        compact: !!row.compact,
        // Which of the two board layouts this panel's design() chose. The
        // backend cannot work it out from the box alone - a portrait tag and a
        // small landscape tag can hand it the same rectangle.
        two_line: !!row.twoLine,
        // Every vehicle glyph, not only the kinds currently on the board: the
        // next refresh can bring back a trolleybus where a tram stood, and
        // svg_blocks.py has no ha-icon to resolve a name with. Empty when the
        // icons have not resolved yet, which draws no glyph rather than a wrong
        // one - the same thing the panel itself does in that state.
        icons: this._transitKindIconPaths(),
        fallback: JSON.stringify(Array.isArray(row.board) ? row.board.map((item) => ({
          line: String(item.badge || "–"), destination: String(item.label || "Spoj"),
          time: String(item.value || ""), departure: String(item.clock || ""),
        })) : []),
        ...geometry,
      };
    }
    if (group === "shopping-list") {
      const entityId = this._templateEntityForKind(template, ["todo_list"]);
      if (!entityId) return null;
      const items = Array.isArray(row.checklist) ? row.checklist : [];
      return {
        type: "todo",
        entity_id: entityId,
        // design() already decided how many rows this particular panel has
        // room for and how they are columned; the backend must reproduce that
        // decision rather than re-derive it from the box, which cannot tell a
        // portrait tag from a small landscape one.
        limit: items.length || 1,
        columns: Math.max(1, Number(row.columns) || 1),
        // The grid shape, not just its width: render.py has to transpose the
        // refreshed items into columns exactly as shopping.js's columnMajor
        // did for this send, and the number of lines is what that needs.
        lines: Math.max(1, Math.ceil((items.length || 1) / Math.max(1, Number(row.columns) || 1))),
        marker: row.marker === "dot" ? "dot" : "box",
        strike: !!row.strike,
        compact: !!row.compact,
        // Whether the first outstanding item is the red one. Recorded rather
        // than recomputed for the same reason as `columns`.
        highlight_first: items[0]?.color === "red",
        fallback: JSON.stringify(items.map((item) => ({
          summary: String(item.label || ""),
          status: item.done ? "completed" : "needs_action",
        }))),
        ...geometry,
      };
    }
    if (group === "forecast") {
      const entityId = this._templateEntityForKind(template, ["forecast", "weather"]);
      if (!entityId) return null;
      // weather.js sizes `row.strip` to the panel's own width (design()'s
      // `dayCount`) rather than always building four cells - capturing that
      // same length here is what lets an automatic refresh ask
      // weather.get_forecasts for as many days as this specific panel
      // actually shows instead of always fetching (and fitting) four.
      const days = Array.isArray(row.strip) && row.strip.length ? row.strip.length : 4;
      return { type: "forecast", entity_id: entityId, days, fallback: "", ...geometry };
    }
    const eventMatch = group.match(/^event-(\d+)$/);
    if (eventMatch) {
      const entityId = this._templateEntityForKind(template, ["calendar"]);
      if (!entityId) return null;
      return {
        type: "calendar", entity_id: entityId, index: Number(eventMatch[1]), fallback: "",
        // _blockDatebox reads row.datebox.color for the header band and the
        // first detail line - never captured before, so an automatic refresh
        // always painted a manual send's red date box (calendar.js's event-0)
        // black instead.
        color: row.datebox?.color === "red" ? "red" : "black",
        ...geometry,
      };
    }
    if (group === "ratio") {
      const declared = this._templateAutomationDeclarations(template)?.ratio;
      if (!Array.isArray(declared) || !declared.length) return null;
      let visual = "bars";
      let sources = [];
      if (row.dial) { visual = "dial"; sources = [row.dial]; }
      else if (row.ring) { visual = "ring"; sources = [row.ring]; }
      else if (row.meters) { visual = "bars"; sources = row.meters; }
      // automation.ratio is one list for the whole template, but a template's
      // compact layout may draw fewer gauges than its full-size one. Without
      // this the backend redrew every declared entry and an automatic refresh
      // put bars on the page that the manual send never had.
      const meters = declared
        .slice(0, sources.length || declared.length)
        .map((entry, index) => {
          const variableIndex = Number(entry.variableIndex);
          const variable = template?.variables?.[variableIndex];
          if (!variable) return null;
          const meta = this._templateVariableMeta(variable, variableIndex);
          const entityId = String(this._templateBinding(template, meta) || "").trim();
          if (!entityId.includes(".") || entityId.startsWith("internal:") || entityId.startsWith("literal:")) return null;
          const source = sources[index] || {};
          return {
            entity_id: entityId,
            divisor: Number(entry.divisor) || 1,
            label: source.label != null ? String(source.label) : "",
            color: source.color === "red" ? "red" : "black",
            // How the backend is to turn the entity into a fill. Empty is the
            // usual "read the state as a number"; "thermostat" means read
            // current_temperature and scale it between min_temp and max_temp,
            // because a climate entity's own state is "heat"/"off" and the
            // numeric path resolves that to an empty dial.
            source: entry.source === "thermostat" ? "thermostat" : "",
          };
        })
        .filter(Boolean);
      if (!meters.length) return null;
      const single = sources[0] || {};
      return {
        type: "ratio", visual, meters,
        caption: single.caption != null ? String(single.caption) : "",
        min: single.min != null ? String(single.min) : "0",
        max: single.max != null ? String(single.max) : "100",
        // Whether this row may print its fill in yellow. The decision belongs
        // to the panel (a protected template never takes the four-colour
        // accent, and only the rows _fourColorTemplateRows picked carry it),
        // and svg_blocks.py has no way to recover it from the row, so it
        // travels with the binding - otherwise every automatic refresh
        // repainted a yellow gauge black.
        accent: this._ratioAccent(row, visual, single),
        fallback: "", ...geometry,
      };
    }
    if (group === "chart") {
      // Two ways a chart is fed. `series` is an entity that publishes its own
      // array of numbers and needs no fetch at all; `history` is an entity
      // that publishes only the present, and whose past has to come out of the
      // recorder (thermostat.js - see _templateHistorySeries for why a
      // climate.* entity can never take the first route).
      const automation = this._templateAutomationDeclarations(template);
      const declared = automation?.series?.[0] || automation?.history;
      if (!declared) return null;
      const fromHistory = !automation?.series?.[0] && !!automation?.history;
      const index = Number(declared.variableIndex);
      const variable = template?.variables?.[index];
      if (!variable) return null;
      const meta = this._templateVariableMeta(variable, index);
      const entityId = String(this._templateBinding(template, meta) || "").trim();
      if (!entityId.includes(".") || entityId.startsWith("internal:") || entityId.startsWith("literal:")) return null;
      const chartType = row.bars ? "bar" : "line";
      const caption = row.spark?.caption != null ? String(row.spark.caption) : "";
      // _blockBars reads row.bars.labels/highlight to draw the tick labels and
      // pick out the current-interval bar in red (cz_spot_prices.js, energy.js)
      // - neither was ever captured, so an automatic refresh drew every bar in
      // the same row's chart-widget style with no labels and no highlight.
      const labels = Array.isArray(row.bars?.labels) ? row.bars.labels.map((label) => String(label ?? "")) : [];
      const highlightIndex = Number.isInteger(row.bars?.highlight) ? row.bars.highlight : -1;
      return {
        type: fromHistory ? "history" : "series",
        // How far back and how many points - the panel resampled the recorder's
        // rows into evenly spaced buckets to draw this, and a refresh that
        // picked its own numbers would redraw the same twelve hours at a
        // different resolution every time.
        ...(fromHistory ? {
          hours: Math.max(1, Number(declared.hours) || 12),
          points: Math.max(2, Number(declared.points) || 24),
        } : {}),
        entity_id: entityId, chartType, caption, labels, highlight: highlightIndex,
        // See the ratio binding: yellow is the panel's decision, not something
        // the backend can work out from the row.
        accent: this._ratioAccent(row, chartType === "bar" ? "bars" : "spark", row.spark || {}),
        maxPoints: 96, fallback: "[]", ...geometry,
      };
    }
    return null;
  },

  _templateAutomationTextBinding(documentNode, textNode, entityId, meta, occurrence, width, height, valuePrefix = "", valueSuffix = "") {
    const offset = this._templateAutomationNodeOffset(textNode);
    const centerX = offset.x + Number(textNode.getAttribute("x") || 0);
    const centerY = offset.y + Number(textNode.getAttribute("y") || 0);
    const fontSize = Math.max(6, Number(textNode.getAttribute("font-size") || 12));
    const anchor = String(textNode.getAttribute("text-anchor") || "middle");
    const bold = Number(textNode.getAttribute("font-weight") || 400) >= 600;
    const currentText = String(textNode.textContent || "");
    // Distance to whichever panel edge this run's anchor faces. Correct for
    // "middle" (bounded on both sides), but for "end"/"start" it measures
    // all the way back to the panel origin - a right-aligned value sitting
    // well clear of the left edge (a list row's number, after its label)
    // gets a "space available" reading of hundreds of pixels that has
    // nothing to do with how much room it actually has before the label.
    const geometricMaxWidth = anchor === "middle"
      ? Math.max(1, Math.min(width, 2 * Math.min(centerX, width - centerX)))
      : Math.max(1, anchor === "end" ? centerX : width - centerX);
    // The backend's PIL tier treats this box as an autoFit *target* - it
    // grows the font to fill whatever width it's given, not just shrinks to
    // avoid overflow. Driving the box off this run's own current width (with
    // a small fixed margin, not a multiple of it - a multiple scales with
    // font size, so a big headline number with only two or three digits got
    // handed a huge absolute margin and autoFit grew it well past its
    // captured size) keeps that autoFit a no-op instead of inflating a
    // short value to fill unused row width.
    // autoFit's shrink-to-fit already keeps a longer future value from
    // overflowing (it searches for the largest font that still fits), so
    // this margin only has to absorb the gap between _svgTextWidth's glyph
    // table and the bundled font's real metrics - not leave room to grow.
    // Two adjacent short lines in the same row (a band's label above its
    // value, a footer's label above its number) sit close enough that even
    // a modest few-pixel-per-character margin was enough for the value's
    // box to grow into the label above it.
    const currentTextWidth = this._svgTextWidth(currentText, fontSize, bold);
    const maxWidth = Math.min(geometricMaxWidth, currentTextWidth + Math.max(6, fontSize * 0.3));
    const boxWidth = Math.max(8, Math.min(maxWidth, fontSize * 13));
    const boxHeight = Math.max(8, Math.min(height, Math.ceil(fontSize * 1.65)));
    const x = Math.max(0, Math.min(width - boxWidth,
      anchor === "middle" ? centerX - boxWidth / 2 : anchor === "end" ? centerX - boxWidth : centerX));
    const y = Math.max(0, Math.min(height - boxHeight, centerY - boxHeight / 2));
    const color = this._templateAutomationPalette(textNode.getAttribute("fill"), "black");
    // The exact hex the panel drew this run through, kept verbatim so the backend
    // SVG rasteriser reproduces the manual send pixel for pixel rather than
    // re-deriving it from a colour name.
    const colorHex = String(textNode.getAttribute("fill") || "#000000");

    let backgroundColor = "white";
    // The base image the backend composites over still carries the previous
    // value's pixels, so each slot has to repaint its own background exactly the
    // way _render_bound_text does. Default to white, then adopt the covering
    // rect's real fill when the slot sits on a coloured band.
    let backgroundHex = "#ffffff";
    const allNodes = [...documentNode.querySelectorAll("rect, text")];
    const textIndex = allNodes.indexOf(textNode);
    for (let index = textIndex - 1; index >= 0; index -= 1) {
      const rect = allNodes[index];
      if (rect.tagName?.toLowerCase() !== "rect") continue;
      const rectOffset = this._templateAutomationNodeOffset(rect);
      const rx = rectOffset.x + Number(rect.getAttribute("x") || 0);
      const ry = rectOffset.y + Number(rect.getAttribute("y") || 0);
      const rw = Number(rect.getAttribute("width") || 0);
      const rh = Number(rect.getAttribute("height") || 0);
      if (centerX >= rx && centerX <= rx + rw && centerY >= ry && centerY <= ry + rh) {
        backgroundColor = this._templateAutomationPalette(rect.getAttribute("fill"), "white");
        backgroundHex = String(rect.getAttribute("fill") || "#ffffff");
        break;
      }
    }

    const state = this._hass?.states?.[entityId];
    const kind = this._templateSlotKind(meta.label, meta.icon);
    const weatherTemperature = String(entityId).startsWith("weather.") && kind === "temperature";
    // A max width that never shrinks the value the panel just showed: the box
    // bound, but at least this run's own text width, so re-rendering the current
    // value through svg_text.py is a no-op fit and stays byte-identical, while a
    // future longer value is still clamped instead of overflowing.
    const svgMaxWidth = Math.max(maxWidth, currentTextWidth + 1);
    const bindingId = `template-${String(meta.templateId || "slot")}-${meta.key}-${occurrence}`;
    // Stamped onto the live node so the caller's captured svg_template can be
    // searched for this exact element later - the backend replaces it by this
    // id when an automatic refresh substitutes a fresh value.
    textNode.setAttribute("id", bindingId);
    return {
      id: bindingId,
      type: "text",
      entity_id: entityId,
      entity_attribute: weatherTemperature ? "temperature" : "",
      // Home-Assistant-internal states ("sunny", "not_home", "on") read as
      // Czech words on a manual send (_templateStateWords, driven by this
      // same kind) - without it riding along, an automatic refresh had no
      // way to tell a word-translated slot from a plain numeric one and
      // fell back to the raw state.
      kind,
      x: Math.round(x), y: Math.round(y), w: Math.round(boxWidth), h: Math.round(boxHeight),
      fallback: currentText,
      include_unit: !weatherTemperature,
      value_prefix: valuePrefix,
      value_suffix: valueSuffix,
      backgroundColor,
      color,
      fontSize: Math.round(fontSize),
      minFontSize: 6,
      bold,
      autoFit: true,
      textAlign: anchor === "end" ? "right" : anchor === "start" ? "left" : "center",
      verticalAlign: "middle",
      // Everything the backend needs to rebuild this exact <text> (and cover the
      // stale pixels underneath it) when the SVG rasteriser is available. Falls
      // back to the box fields above when it is not.
      svg: {
        cx: centerX, cy: centerY,
        size: fontSize,
        maxWidth: svgMaxWidth,
        anchor,
        bold,
        color: colorHex,
        bg: backgroundHex,
        x: Math.round(x), y: Math.round(y), w: Math.round(boxWidth), h: Math.round(boxHeight),
      },
    };
  },

  // Pair up the <text> runs of the marker-injected document with the ones the
  // template actually renders right now.
  //
  // These used to be walked by position, which silently assumed both documents
  // hold the same runs in the same order. They do not: a value that is empty at
  // this moment (an unavailable entity, a sensor that has not reported yet)
  // produces no <text> element at all - _svgText returns "" rather than an empty
  // element - so injecting a marker *adds* a run, and every run after it shifted
  // by one. Each of those shifted runs then compared unequal and was credited to
  // the variable being probed, complete with the geometry of whichever run now
  // sat at its index. On the weather template one unavailable value was enough to
  // hand eleven runs to one entity, eight of them cells of the forecast strip - so
  // every automatic refresh painted that entity's value on top of the days and
  // temperatures the strip itself draws.
  //
  // A longest common subsequence over the run texts pairs the untouched runs
  // (identical text on both sides) and leaves exactly the marker-changed slots
  // unpaired, which is what the caller wants to look at. A slot with no current
  // counterpart is one that renders nothing today: there is no run on the display
  // to bind, and the caller skips it instead of stealing a neighbour's.
  _alignTemplateTextRuns(markedTexts, currentTexts) {
    const textOf = (node) => String(node?.textContent || "");
    const rows = markedTexts.length;
    const cols = currentTexts.length;
    const lengths = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
    for (let i = rows - 1; i >= 0; i -= 1) {
      for (let j = cols - 1; j >= 0; j -= 1) {
        lengths[i][j] = textOf(markedTexts[i]) === textOf(currentTexts[j])
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
      }
    }
    const operations = [];
    let i = 0;
    let j = 0;
    while (i < rows || j < cols) {
      if (i < rows && j < cols && textOf(markedTexts[i]) === textOf(currentTexts[j])) {
        operations.push({ kind: "same", marked: markedTexts[i], current: currentTexts[j] });
        i += 1; j += 1;
      } else if (i < rows && (j >= cols || lengths[i + 1][j] >= lengths[i][j + 1])) {
        operations.push({ kind: "added", marked: markedTexts[i] });
        i += 1;
      } else {
        operations.push({ kind: "removed", current: currentTexts[j] });
        j += 1;
      }
    }
    // A slot whose text merely changed shows up as an added run next to a removed
    // one; rejoining those two recovers the run's current node, which is the whole
    // point - that node carries the geometry and the value on the display today.
    const pairs = [];
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      if (operation.kind === "same") {
        pairs.push({ marked: operation.marked, current: operation.current });
        continue;
      }
      if (operation.kind !== "added") continue;
      const neighbour = operations[index + 1];
      if (neighbour?.kind === "removed") {
        pairs.push({ marked: operation.marked, current: neighbour.current });
        index += 1;
        continue;
      }
      pairs.push({ marked: operation.marked, current: null });
    }
    return pairs;
  },

  async _preparedTemplateEntityBindings(device, width, height) {
    const renderingScope = this._pushRenderingDevice(device?.address);
    try {
      const request = this._currentDisplayTemplateSvgRequest(device);
    if (!request?.templates?.length || typeof DOMParser === "undefined") return { bindings: [], svgTemplate: "" };
    const currentSvg = await this._buildDisplayTemplateSvg(request.templates, width, height, request.layout);
    const currentDocument = new DOMParser().parseFromString(currentSvg, "image/svg+xml");
    const currentTexts = [...currentDocument.querySelectorAll("text")];
    const bindings = [];
    this._templateAutomationBindingOverrides ||= {};

    for (const template of request.templates) {
      if (!template) continue;
      // A ratio()-driven dial/ring/meter row is fully redrawn by its own
      // "ratio" binding below (fill, label AND the value text together, the
      // same way _blockDial/_blockRing/_blockMeters draw it as one shape) -
      // the variable indices it declares must NOT also get an independent
      // "text" binding here, or the value would be painted twice: once
      // small and precisely positioned by this loop, once again as part of
      // the full row by the ratio renderer.
      const ratioClaimedIndices = new Set(
        (this._templateAutomationDeclarations(template)?.ratio || []).map((entry) => Number(entry.variableIndex))
      );
      for (let index = 0; index < (template.variables || []).length; index += 1) {
        if (ratioClaimedIndices.has(index)) continue;
        const meta = { ...this._templateVariableMeta(template.variables[index], index), templateId: template.id };
        const rawBinding = String(this._templateBinding(template, meta) || "").trim();
        const entityId = rawBinding || (meta.automatic ? `internal:${meta.key}` : "");
        if (!entityId || entityId.startsWith("literal:") || (!entityId.includes(".") && !entityId.startsWith("internal:"))) continue;
        const bindingKey = `${template.id}:${meta.key}`;
        const marker = `QZ${index}X`;
        this._templateAutomationBindingOverrides[bindingKey] = marker;
        let markedSvg = "";
        try {
          markedSvg = await this._buildDisplayTemplateSvg(request.templates, width, height, request.layout);
        } finally {
          delete this._templateAutomationBindingOverrides[bindingKey];
        }
        const markedDocument = new DOMParser().parseFromString(markedSvg, "image/svg+xml");
        const markedTexts = [...markedDocument.querySelectorAll("text")];
        let occurrence = 0;
        for (const { marked: markedNode, current: currentText } of this._alignTemplateTextRuns(markedTexts, currentTexts)) {
          const markedText = String(markedNode?.textContent || "");
          // A slot belongs to this variable when injecting the marker changed the
          // rendered text - whether the marker survived verbatim or the block
          // reformatted it (a number slot, an ellipsis clip, an empty value). The
          // old test only matched a verbatim marker, so those reformatting slots
          // produced no binding and silently never auto-updated.
          const drivenByVariable =
            markedText.includes(marker) || markedText !== String(currentText?.textContent || "");
          if (!drivenByVariable) continue;
          // Nothing is rendered for this slot today, so there is no run on the
          // display to bind - and no geometry to bind it at.
          if (!currentText) continue;
          // A run inside a series()/ratio()/day()/event() row is redrawn by that
          // row's own binding further down, value text and all - the whole row is
          // one shape to _blockBars/_blockDial/_blockStrip/_blockDatebox. Capturing
          // it here as well would paint the entity's value a second time, on top of
          // what the row draws. This is the general form of the ratioClaimedIndices
          // guard above, which only ever covered ratio() rows.
          if (currentText.closest?.("[data-template-block]")) continue;
          // A row that writes a literal alongside the bound value in the same
          // run (security.js's checklist: `Dveře · ${v(1, "Zamčeno")}`) diffs
          // out as one binding for the *whole* run - substituting only the
          // resolved value during an automatic refresh would silently drop
          // "Dveře · ". Splitting the marked text on the still-verbatim
          // marker recovers exactly what surrounded it, empty for the (far
          // more common) case where the variable is the entire run. Only
          // possible when the marker survived intact - a reformatting slot
          // (number/ellipsis) has nothing stable to split on and gets none.
          let valuePrefix = "";
          let valueSuffix = "";
          if (markedText.includes(marker)) {
            const markerIndex = markedText.indexOf(marker);
            valuePrefix = markedText.slice(0, markerIndex);
            valueSuffix = markedText.slice(markerIndex + marker.length);
          }
          bindings.push(this._templateAutomationTextBinding(
            currentDocument, currentText, entityId, meta, occurrence++, width, height, valuePrefix, valueSuffix
          ));
        }
      }
    }
    // series()/ratio()/day()/event() rows (a sparkline, a gauge, a forecast
    // strip, a calendar entry) never produce a <text> node whose content is
    // the raw bound value - a chart draws numbers as bar heights, day()/
    // event() call a service the backend cannot reach from inside the plain
    // v()-marker loop above - so none of them were ever captured for
    // automatic refresh; they stayed frozen at whatever was true on the last
    // manual send. Each such row is tagged with a `group` in its template's
    // design() (see air.js and weather.js), wrapped by _stackTemplateBlocks
    // in <g data-template-block="...">, and resolved here into its own
    // binding the same way camera/text bindings are.
    const slots = this._displayTemplateLayoutSlots(request.layout, width, height);
    const graphicOccurrences = {};
    request.templates.forEach((template, slotIndex) => {
      if (!template) return;
      const slot = slots[slotIndex] || slots[0];
      const graphicRows = this._templateGraphicRowBoxes(template, slot.w, slot.h);
      for (const [group, { box, row }] of Object.entries(graphicRows)) {
        // Scope both the search and the occurrence counter to this slot. They
        // used to disagree: the counter was per template, the node list was
        // the whole document. Two templates using the same block name each
        // took nodes[0] - the first slot's - so the second overwrote the
        // first's id and its own node was never tagged. Only one template then
        // refreshed, and every other slot went out with no values and no
        // chart.
        const slotRoot = currentDocument.querySelector(`[data-template-slot="${slotIndex}"]`) || currentDocument;
        const occurrenceKey = `${slotIndex}:${group}`;
        const occurrence = graphicOccurrences[occurrenceKey] || 0;
        graphicOccurrences[occurrenceKey] = occurrence + 1;
        const nodes = [...slotRoot.querySelectorAll(`[data-template-block="${group}"]`)];
        const node = nodes[occurrence];
        if (!node) continue;
        const binding = this._templateAutomationGraphicBinding(template, group, row, {
          x: Math.round(slot.x + box.x), y: Math.round(slot.y + box.y),
          w: Math.round(box.w), h: Math.round(box.h),
        });
        if (!binding) continue;
        // The slot index belongs in the id now that occurrences are counted
        // per slot: the same template placed in two slots would otherwise
        // produce the same id twice, and a duplicate id means the backend's
        // substitution only ever finds the first of them.
        binding.id = `template-${template.id}-${group}-s${slotIndex}-${occurrence}`;
        // Stamps which generation of the row-measuring code recorded this box.
        // Up to 0.1.345 _templateGraphicRowBoxes laid the rows out without
        // `compact`, so the box it wrote here was inset a few pixels from
        // where the row had actually been drawn. The clean-background tier
        // trusts that box completely - it clears it and redraws into it - so
        // an automation saved back then leaves a frame of the old departures
        // board behind and prints the new rows slightly above it. render.py
        // reads this stamp and sends those captures down the SVG-substitution
        // tier instead, which replaces the whole tagged group and therefore
        // cannot leave anything stale behind, whatever the box says.
        binding.capture = GRAPHIC_BINDING_CAPTURE_VERSION;
        node.setAttribute("id", binding.id);
        bindings.push(binding);
      }
    });
    // The Meteoradar row (and anything else built from _blockRadarMap) embeds
    // its map and its info sidebar as two plain <image> elements, not bound HA
    // entity values, so each is tagged and captured the same way but carries
    // its own binding type: an automatic refresh re-fetches the camera/sidebar
    // rather than reading entity state. data-radar-part tells them apart -
    // _blockRadarMap stamps it on both, and it never appears on an ordinary
    // customImage/dither block's <image>.
    const radarImages = [...currentDocument.querySelectorAll("image[data-radar-part]")];
    radarImages.forEach((radarImage, index) => {
      const part = radarImage.getAttribute("data-radar-part");
      const radarId = `template-radar-${part}-${index}`;
      radarImage.setAttribute("id", radarId);
      const radarWidth = Math.round(Number(radarImage.getAttribute("width")) || width);
      const radarHeight = Math.round(Number(radarImage.getAttribute("height")) || height);
      const binding = {
        id: radarId,
        type: "camera",
        entity_id: "camera.meteoradar",
        width: radarWidth,
        height: radarHeight,
        // x/y/w/h let the backend's clean_background tier paste the fresh
        // frame at the exact spot the <image> occupied - the other
        // (SVG-substitution) tier does not need these, it just swaps the
        // href of the very same element and keeps its original geometry.
        x: Math.round(Number(radarImage.getAttribute("x")) || 0),
        y: Math.round(Number(radarImage.getAttribute("y")) || 0),
        w: radarWidth,
        h: radarHeight,
      };
      if (part === "sidebar") {
        binding.radar_part = "sidebar";
      } else {
        binding.country = this._activeMeteoradarCountry();
        binding.show_precipitation = this._displayTemplateConfig?.meteoradar_show_precipitation !== false;
        binding.show_wind = this._displayTemplateConfig?.meteoradar_show_wind === true;
      }
      bindings.push(binding);
    });
    // currentDocument's tagged nodes are what the backend substitutes fresh
    // values into - text runs and the radar image alike - so this capture of the
    // whole template (background art, icons and all) is what makes an automatic
    // refresh reproduce a manual send exactly instead of guessing at what should
    // sit behind each value.
    const svgTemplate = bindings.length ? currentDocument.documentElement.outerHTML : "";
    const cleanBackground = await this._blankedDisplayTemplateBackground(currentDocument, bindings, width, height);
    return { bindings, svgTemplate, cleanBackground };
    } finally {
      this._popRenderingDevice(renderingScope);
    }
  },

  // Builds the true, value-free background an automatic refresh composites
  // fresh values onto (automation.py's clean_background tier): a clone of the
  // exact document captured above with every dynamic binding's footprint
  // removed - tagged <text> runs and the radar <image> href - then rasterised
  // WITHOUT paintOverlay, so free-form chart/gauge/signal/slider widgets (which
  // only ever reach the canvas through that callback, see
  // _rasterizeDisplayTemplateSvg) are absent too. Nothing here is guessed: this
  // is the same real background a manual send draws behind every value, so an
  // automatic refresh can match it exactly on any platform, with no dependency
  // on the backend's optional SVG rasteriser.
  //
  // Not gated on text/camera bindings existing (unlike svgTemplate above) - a
  // chart/gauge-only design still benefits from a real clean background, since
  // paintOverlay is what would have baked their stale values in otherwise.
  async _blankedDisplayTemplateBackground(currentDocument, bindings, width, height) {
    const clone = currentDocument.cloneNode(true);
    for (const binding of bindings) {
      const elementId = String(binding.id || "");
      if (!elementId) continue;
      const node = clone.getElementById(elementId);
      if (!node) continue; // best-effort, mirrors the backend's own id-collision tolerance
      if (binding.type === "camera") {
        node.removeAttribute("href");
        continue;
      }
      if (["text", "ratio", "series", "history", "forecast", "calendar", "transit", "todo"].includes(binding.type)) {
        node.remove();
      }
    }
    try {
      return await this._rasterizeSvgStringToPng(clone.documentElement.outerHTML, width, height);
    } catch {
      return ""; // falls back to the older tiers on the backend, same as a missing svg_template
    }
  },

  async _displayTemplateEntityAutomation(image, device, gatewayId = "") {
    const request = this._currentDisplayTemplateSvgRequest(device);
    const routing = this._displayAutomationRouting(device, gatewayId);
    const usesCustomImage = request?.templates?.some((template) =>
      template?.id === "custom_image" || template?.base_template_id === "custom_image"
    );
    if (usesCustomImage) {
      const assets = (this._customImageCycleIds || []).slice(0, 12)
        .map((id) => (this._templateImageLibrary || []).find((asset) => asset.id === id))
        .filter((asset) => Boolean(asset?.source || asset?.src));
      if (!this._customImageCycleEnabled || assets.length < 2) return undefined;
      const cycleImages = [];
      for (const asset of assets) {
        cycleImages.push(await this._renderCurrentDisplayTemplateImage(device, asset.source || asset.src));
      }
      const intervalSeconds = Math.max(60, Math.min(86400, Number(this._customImageCycleMinutes) * 60 || 600));
      return {
        enabled: true,
        base_image: image,
        image_cycle: cycleImages,
        image_cycle_ids: assets.map((asset) => asset.id),
        image_cycle_interval_seconds: intervalSeconds,
        bindings: [],
        layout: request?.layout || "single",
        template_ids: (request?.templates || []).filter(Boolean).map((template) => template.id),
        sdk_type: Number(device.sdk_type),
        software_version: Number(device.sw || 0),
        orientation: this._displayTemplateOrientation === "portrait" ? "portrait" : "landscape",
        transform: this._displayTransform || "rotate_cw",
        refresh_interval_seconds: intervalSeconds,
        refresh_trigger_mode: "interval_only",
        ...routing,
      };
    }
    const size = this._devicePreviewSize(device);
    const landscape = this._displayTemplateOrientation !== "portrait";
    const width = landscape ? Math.max(size.width, size.height) : Math.min(size.width, size.height);
    const height = landscape ? Math.min(size.width, size.height) : Math.max(size.width, size.height);
    const px = (value, extent, minimum = 0) => Math.max(minimum, Math.round(Number(value || 0) * extent / 100));
    const bindings = [];

    const prepared = await this._preparedTemplateEntityBindings(device, width, height);
    bindings.push(...prepared.bindings);

    // Designer elements (chart/gauge/signal/slider/text) live in
    // _templateEditorElements only while their own template is the one open
    // in the editor - every other slot's template keeps its saved elements in
    // _templateEditorStates (see _rememberActiveTemplateEditorState), which is
    // where they land the instant editing moves to a different template. A
    // multi-slot layout (grid-6 etc.) must read every assigned slot's own
    // elements here, not just whichever one happens to be open right now, or
    // charts/gauges placed in slot 2+ never produce a binding at all - not
    // "silently dropped", never created in the first place.
    const activeEditorTemplateId = this._activeTemplateEditorStateId();
    const automationSlots = this._displayTemplateLayoutSlots(request.layout, width, height);
    (request.templates || []).forEach((slotTemplate, slotIndex) => {
      if (!slotTemplate) return;
      const slot = automationSlots[slotIndex] || automationSlots[0] || { x: 0, y: 0, w: width, h: height };
      const slotElements = slotTemplate.id === activeEditorTemplateId
        ? (this._templateEditorElements || [])
        : (this._templateEditorStates?.[slotTemplate.id]?.editor_elements
          || (slotTemplate.user_created ? slotTemplate.editor_elements : [])
          || []);
      for (const source of slotElements) {
      const item = this._quarterTurnedUserTemplateElement(source);
      const entityId = String(item.entityId || "").trim();
      if (!entityId || !["text", "chart", "gauge", "signal", "slider"].includes(item.type)) continue;
      const x = slot.x + px(item.x, slot.w);
      const y = slot.y + px(item.y, slot.h);
      const w = Math.min(slot.x + slot.w - x, px(item.w, slot.w, 1));
      const h = Math.min(slot.y + slot.h - y, px(item.h, slot.h, 1));
      const common = {
        // Slot-suffixed: the same reusable template can occupy more than one
        // slot, and each occurrence needs its own binding id.
        id: `${String(item.id || `entity-${bindings.length + 1}`)}-slot${slotIndex}`,
        entity_id: entityId,
        entity_attribute: String(item.entityAttribute || ""),
        x, y, w, h,
        fallback: String(item.value ?? ""),
        backgroundColor: "white",
        rotation: Number(item.rotation || 0),
      };

      if (item.type === "text") {
        bindings.push({
          ...common,
          type: "text",
          fallback: String(item.text || ""),
          include_unit: true,
          fontSize: Math.max(8, Math.round(Number(item.fontSize || 17) * height / 128)),
          minFontSize: 7,
          bold: ["700", "900"].includes(String(item.fontWeight)),
          textAlign: item.textAlign || "left",
          verticalAlign: "middle",
          color: this._templateAutomationPalette(item.color, "black"),
        });
        continue;
      }

      if (item.type === "chart") {
        bindings.push({
          ...common,
          type: "chart",
          fallback: JSON.stringify((item.historyValues || []).map(Number).filter(Number.isFinite).slice(-Number(item.historyLimit || 10))),
          chartType: ["bar", "area"].includes(item.variant) ? item.variant : "line",
          maxPoints: Math.max(1, Math.min(20, Number(item.historyLimit || 10))),
          history_mode: String(item.sampleInterval || "change") === "attribute" ? "attribute" : "rolling",
          color: "red",
          graphColor: "black",
          strokeWidth: Math.max(1, Number(item.strokeWidth || 2)),
          showGrid: item.showGrid !== false,
          showAxes: item.variant !== "sparkline",
          showValues: item.showValue !== false,
          // _drawChart (panel-draw-charts.mixin.js) reads all of these from
          // the same item - never captured before, so a manual send's title,
          // axis labels, custom min/max and legend font size all silently
          // reset to render.py's own defaults on every automatic refresh.
          legendFontSize: Math.max(10, Math.min(24, Number(item.legendFontSize || 12))),
          chartTitle: String(item.chartTitle || ""),
          xLabel: String(item.xLabel || ""),
          yLabel: String(item.yLabel || ""),
          chartMin: item.chartMin != null && String(item.chartMin).trim() !== "" ? Number(item.chartMin) : "",
          chartMax: item.chartMax != null && String(item.chartMax).trim() !== "" ? Number(item.chartMax) : "",
          chartLabels: String(item.chartLabels || ""),
          barColor: item.barColor || "red",
        });
        continue;
      }

      if (item.type === "signal") {
        bindings.push({
          ...common,
          type: "text",
          status_icons: true,
          status_on_symbol: item.showState === false ? String(item.text || "Aktivní") : `${String(item.text || "Stav")}  ON`,
          status_off_symbol: item.showState === false ? String(item.text || "Vypnuto") : `${String(item.text || "Stav")}  OFF`,
          status_on_values: "on,true,1,open,home,active,heat,heating,playing,unlocked",
          fontSize: Math.max(8, Math.round(Number(item.fontSize || 10) * height / 128)),
          minFontSize: 7,
          bold: true,
          textAlign: "center",
          verticalAlign: "middle",
          color: "black",
        });
        continue;
      }

      const objectType = item.type === "slider" ? "slider" : (item.variant === "donut" ? "pie" : "gauge");
      bindings.push({
        ...common,
        type: "layered",
        entity_ids: [entityId],
        canvas_width: w,
        canvas_height: h,
        default_symbol: "default",
        fallback: "default",
        layers: [{ id: "default", objects: [{
          type: objectType,
          entity_id: entityId,
          entity_attribute: String(item.entityAttribute || ""),
          x: 0, y: 0, w, h,
          min_value: 0,
          max_value: 100,
          unit: item.showPercent === false ? "" : "%",
          color: "red",
          fill: "red",
          stroke: "black",
          stroke_width: Math.max(1, Number(item.strokeWidth || 2)),
          show_value: item.showValue !== false,
          show_arc: item.showTrack !== false,
          show_needle: item.variant === "semicircle",
          arc_mode: item.variant === "semicircle" ? "180" : "360",
        }] }],
      });
      }
    });

    if (!bindings.length) return undefined;
    return {
      enabled: true,
      base_image: image,
      // The full template SVG, with every bound value's <text> node tagged by
      // id. An automatic refresh substitutes fresh values into this document
      // and rasterises the whole thing, so its background art, icons and
      // colours always match what a manual send draws - base_image alone
      // cannot reconstruct that once it is baked to a bitmap.
      svg_template: prepared.svgTemplate,
      // A real, value-free render of this exact template (icons/gradients/photos
      // included, chart/gauge/signal/slider widgets excluded since they never
      // reach this document) captured by the panel itself. An automatic refresh
      // composites fresh values on top of this instead of guessing a flat
      // rectangle for whatever the value's box actually sits on - unlike
      // svg_template, this needs no backend SVG rasteriser, so it works the
      // same on every Home Assistant platform.
      clean_background: prepared.cleanBackground || "",
      bindings,
      layout: request?.layout || "single",
      template_ids: (request?.templates || []).filter(Boolean).map((t) => t.id),
      sdk_type: Number(device.sdk_type),
      software_version: Number(device.sw || 0),
      orientation: landscape ? "landscape" : "portrait",
      transform: this._displayTransform || "rotate_cw",
      refresh_interval_seconds: Math.max(30, Math.min(86400, Number(this._refreshIntervalSeconds) || 600)),
      refresh_trigger_mode: ["both", "change_only", "interval_only"].includes(this._refreshTriggerMode)
        ? this._refreshTriggerMode
        : "interval_only",
      ...routing,
    };
  },

  _displayAutomationRouting(device, gatewayId = "") {
    const activeGatewayId = String(gatewayId || "");
    const manuallyLocked = device?.gateway_selection === "manual";
    const manualRoute = manuallyLocked
      ? String(device?.selected_gateway_id || (activeGatewayId ? activeGatewayId : "local"))
      : "";
    return {
      gateway_selection: manuallyLocked ? "manual" : "auto",
      manual_gateway_id: manualRoute,
      route_type: activeGatewayId ? "gateway" : "local",
      gateway_id: activeGatewayId,
      transport_name: activeGatewayId ? "DRATEK eInk gateway" : "Home Assistant Bluetooth",
    };
  },

  async _sendLocalDisplayDesignChunked(payload) {
    const encoded = String(payload.image || "").replace(/^data:[^,]*,/, "");
    if (!encoded) throw new Error("Vykreslený obrázek je prázdný.");
    const chunkSize = 64 * 1024;
    const total = Math.ceil(encoded.length / chunkSize);
    const uploadId = globalThis.crypto?.randomUUID?.()
      || `dratek-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    for (let index = 0; index < total; index += 1) {
      try {
        await this._hass.callWS({
          type: "dratek_eink/upload_design_chunk",
          upload_id: uploadId,
          index,
          total,
          data: encoded.slice(index * chunkSize, (index + 1) * chunkSize),
        });
      } catch (err) {
        throw new Error(
          `Home Assistant nepřijal část obrázku ${index + 1}/${total}: ${this._message(err)}`
        );
      }
    }
    try {
      return await this._hass.callWS({
        type: "dratek_eink/commit_design_upload",
        upload_id: uploadId,
        address: payload.address,
        sdk_type: payload.sdk_type,
        software_version: payload.software_version,
        orientation: payload.orientation,
        transform: payload.transform,
        automation: payload.automation,
        template_ids: Array.isArray(payload.template_ids) ? payload.template_ids : [],
      });
    } catch (err) {
      throw new Error(`Home Assistant nezařadil přijatý obrázek do fronty: ${this._message(err)}`);
    }
  },

  async _sendDisplayTemplatePreview() {
    const device = this._device();
    if (!device || !this._hass || this._templateSending) return;
    this._templateSending = true;
    this._templateSendResult = null;
    let image = "";
    const sendButton = this.shadowRoot.querySelector("[data-template-send]");
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.querySelector("ha-icon")?.setAttribute("icon", "mdi:loading");
      sendButton.querySelector("ha-icon")?.classList.add("spin");
      const label = sendButton.querySelector("strong");
      if (label) label.textContent = "Odesílám náhled…";
    }
    try {
      if (this._assignedDisplayTemplates(device).includes("custom_image")) {
        await this._useBundledCustomImageTemplate();
      }
      await this._saveDisplayTemplateDraft();
      image = await this._renderCurrentDisplayTemplateImage(device);
      const gatewayId = String(this._selectedGatewayId || "");
      const payload = {
        address: device.address,
        sdk_type: Number(device.sdk_type),
        software_version: Number(device.sw || 0),
        image,
        orientation: this._displayTemplateOrientation === "portrait" ? "portrait" : "landscape",
        transform: this._displayTransform || "rotate_cw",
        template_ids: [...this._assignedDisplayTemplates(device)],
      };
      payload.automation = await this._displayTemplateEntityAutomation(image, device, gatewayId);
      const result = gatewayId
        ? await this._hass.callWS({
          type: "dratek_eink/gateways/send_design",
          gateway_id: gatewayId,
          ...payload,
        })
        : await this._sendLocalDisplayDesignChunked(payload);
      if (result?.ok === false) throw new Error(result.error || "Odeslání se nezdařilo.");
      if (result?.queued) {
        this._templateSendResult = {
          ok: true,
          message: `Náhled byl zařazen do fronty přes ${gatewayId ? "zvolenou gateway" : "Home Assistant Bluetooth"}. Průběh a případnou chybu uvidíte na kartě Fronta zápisu.`,
        };
      } else {
        this._rememberSentDisplayPreview(device, image);
        this._templateSendResult = {
          ok: true,
          message: `Náhled byl úspěšně zapsán přes ${gatewayId ? "zvolenou gateway" : "Home Assistant Bluetooth"}.${payload.automation ? " Navázané hodnoty se nyní aktualizují automaticky po změně." : " Další zápis proběhne pouze ručně."}`,
        };
      }
      await this._loadQueue?.(true);
    } catch (err) {
      const websocketMessage = this._message(err);
      await this._loadQueue?.(false);
      const address = String(device.address || "").toUpperCase();
      const latestJob = (this._queue?.jobs || []).find((job) =>
        String(job.address || "").toUpperCase() === address
        && ["design", "partial_design"].includes(job.operation)
      );
      if (latestJob?.status === "succeeded") {
        this._rememberSentDisplayPreview(device, image);
        this._templateSendResult = {
          ok: true,
          message: "Přenos byl dokončen. Home Assistant pouze ztratil odpověď websocketu.",
        };
      } else if (latestJob?.status === "writing" || latestJob?.status === "queued") {
        this._templateSendResult = {
          ok: true,
          message: "Přenos pokračuje ve frontě Home Assistantu. Stav najdete na kartě Fronta.",
        };
      } else {
        const transferMessage = String(
          latestJob?.error
          || [...(latestJob?.log || [])].reverse().find((line) => String(line || "").trim())
          || websocketMessage
        ).trim();
        this._templateSendResult = { ok: false, message: `Odeslání selhalo: ${transferMessage}` };
      }
    } finally {
      this._templateSending = false;
      this._render();
      this._paint();
      window.clearTimeout(this._templateSendResultTimer);
      const displayedResult = this._templateSendResult;
      if (displayedResult) {
        this._templateSendResultTimer = window.setTimeout(() => {
          if (this._templateSendResult !== displayedResult) return;
          this._templateSendResult = null;
          this._render();
          this._paint();
        }, displayedResult.ok ? 4500 : 8000);
      }
    }
  },

  _rememberSentDisplayPreview(device, image) {
    const address = String(device?.address || "").toUpperCase();
    if (!address || !String(image || "").startsWith("data:image/")) return;
    const base = this._baseDisplaySize(device);
    const portrait = this._displayTemplateOrientation === "portrait";
    const width = portrait ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
    const height = portrait ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
    const previous = this._deviceDrafts?.[address] || {};
    this._deviceDrafts ||= {};
    this._deviceDrafts[address] = {
      ...previous,
      width,
      height,
      orientation: portrait ? "portrait" : "landscape",
      preview_image: image,
      preview_updated_at: Date.now(),
      preview_width: width,
      preview_height: height,
      preview_orientation: portrait ? "portrait" : "landscape",
      sent_template_ids: [...this._assignedDisplayTemplates(device)],
    };
    this._forgetCachedDisplayImages(address);
    this._saveCachedDeviceDrafts?.();
  },

  _findSvgDeep(root) {
    if (!root) return null;
    const direct = root.querySelector("svg");
    if (direct) return direct;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.shadowRoot) {
        const found = this._findSvgDeep(node.shadowRoot);
        if (found) return found;
      }
      node = walker.nextNode();
    }
    return null;
  },

  _findRenderedIconSvg(root) {
    const svg = this._findSvgDeep(root);
    return svg?.querySelector("path[d],circle,rect,polygon,polyline,ellipse,line,text,image,use") ? svg : null;
  },

  // Everything this panel remembers about how a display currently looks. A fresh
  // upload replaces the picture on the hardware, so every cached rendering of the
  // previous one has to go with it or the cards keep showing a stale image.
  _forgetCachedDisplayImages(address) {
    const key = String(address || "").toUpperCase();
    if (!key) return;
    this._devicePreviewImages?.delete(key);
    this._devicePreviewRequests?.delete(key);
    if (this._ditheredPreviewCache) delete this._ditheredPreviewCache[key];
    if (this._ditheredPreviewPending) delete this._ditheredPreviewPending[key];
  },

  // What the tile remembers has to be what the panel was given, so it comes from
  // the same builder rather than from a second rendering of its own.
  async _captureCurrentDisplayTemplatePreview() {
    const device = this._device();
    if (!device) return false;
    try {
      const image = await this._renderCurrentDisplayTemplateImage(device);
      this._rememberSentDisplayPreview(device, image);
      return true;
    } catch (err) {
      console.warn("DRATEK eInk template preview capture failed:", err);
      return false;
    }
  },

  _renderTemplatePhysicalDevicePreview(device, templates, orientation, layout, autoFit = false) {
    const address = String(device.address || "").toUpperCase();
    const renderingScope = this._pushRenderingDevice(address);
    try {
      const base = this._baseDisplaySize(device);
      const sourceWidth = orientation === "portrait" ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
      const sourceHeight = orientation === "portrait" ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
      const large400Layout = this._isLarge400Device(device);
      const wide800Layout = this._isWide800Device(device);
      const labelledLargeLayout = large400Layout || wide800Layout;
      const pe29Layout = this._isPe29Device(device);
      const baseWidth = Math.max(base.width, base.height);
      const baseHeight = Math.min(base.width, base.height);
      const frameRatio = wide800Layout ? 1014 / 658 : large400Layout ? 1039 / 898 : Math.max(0.48, Math.min(3.7, (baseWidth / baseHeight) / 0.95));
      const frameWidth = Math.max(150, Math.round(baseWidth / (wide800Layout ? 0.9142 : large400Layout ? 0.77 : 0.76)));
      const frameHeight = Math.round(frameWidth / frameRatio);
      const outerWidth = orientation === "portrait" ? frameHeight : frameWidth;
      const outerHeight = orientation === "portrait" ? frameWidth : frameHeight;
      const frameRadius = Math.max(4, Math.min(28, Math.round(Math.min(frameWidth, frameHeight) * 0.06)));
      const physicalCode = device.physical_code || "00.00.00.00";
      const previewZoom = Math.max(0.5, Math.min(16, Number(this._displayTemplatePreviewZoom || 1)));
      const layoutDefinition = this._displayTemplateLayoutDefinition(layout);
      const layoutTransposed = sourceHeight > sourceWidth;
      const layoutColumns = layoutTransposed ? layoutDefinition.rows : layoutDefinition.columns;
      const layoutRows = layoutTransposed ? layoutDefinition.columns : layoutDefinition.rows;
      const visibleTemplates = (Array.isArray(templates) ? templates : [templates]).filter(Boolean).slice(0, layoutDefinition.capacity);
      const hasConfigWarning = visibleTemplates.some((template) => this._templateBindingStatus(template).state !== "complete");
      const layoutSlots = this._displayTemplateLayoutSlots(layout, sourceWidth, sourceHeight);
      const primaryFillsDisplay = autoFit || !large400Layout;
      const ditherKey = autoFit ? this._escape(JSON.stringify({
        t: visibleTemplates.map((template) => template.id),
        o: orientation,
        l: layout,
        b: this._displayTemplateBindings || null,
        a: this._templateElementAdjustments || null,
        e: this._templateEditorElements || null,
        d: this._deviceDrafts?.[address] || null,
      })) : "";
      return `<div class="template-physical-preview device-preview-wrap" style="--template-preview-zoom:${previewZoom}">
        <div class="device-preview-fit" style="--frame-ratio:${(outerWidth / outerHeight).toFixed(4)};--preview-width:${Math.min(620, Math.max(250, Math.round(470 * outerWidth / outerHeight)))}px">
          <svg class="device-preview-designer-svg" viewBox="0 0 ${outerWidth} ${outerHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Náhled šablony v rámečku displeje">
            <foreignObject x="0" y="0" width="${outerWidth}" height="${outerHeight}">
              <div xmlns="http://www.w3.org/1999/xhtml" class="designer-device-stage device-preview-designer-copy designer-stage-${orientation}" style="--designer-stage-width:${outerWidth}px;--designer-stage-height:${outerHeight}px;--designer-frame-ratio:${frameRatio.toFixed(4)};--designer-frame-width:${frameWidth}px;--designer-frame-rotation:${orientation === "portrait" ? "90deg" : "0deg"};--designer-screen-width:${sourceWidth}px;--designer-screen-height:${sourceHeight}px;--designer-body-width:${baseWidth}px;--device-frame-radius:${frameRadius}px">
                <div class="designer-device-bezel ${pe29Layout ? "designer-device-pe29" : ""} ${labelledLargeLayout ? "designer-device-large400" : ""} ${wide800Layout ? "designer-device-wide800" : ""} designer-device-landscape">${labelledLargeLayout ? `<span class="device-large400-top-band"></span><span class="device-large400-bottom-band"><span class="device-large400-label">${this._renderDeviceBarcode(address, true)}<span class="device-large400-mac">${this._escape(address)}</span></span></span>` : pe29Layout ? `<span class="designer-device-identification"><span class="designer-device-code">${this._escape(physicalCode)}</span>${this._renderDeviceBarcode(physicalCode, false)}</span>` : `<span class="designer-device-code">${this._escape(physicalCode)}</span>`}</div>
                <div class="designer-device-screen template-designer-screen" data-has-config-warning="${hasConfigWarning ? "true" : "false"}">
                  <div class="template-device-layout layout-${layout} ${layoutTransposed ? "is-layout-transposed" : ""} ${large400Layout ? "is-large-display" : "is-small-display"}" style="--layout-columns:${layoutColumns};--layout-rows:${layoutRows}">
                    ${visibleTemplates.map((template, index) => {
                      const slotGeometry = layoutSlots[index] || layoutSlots[0];
                      const slotFormat = slotGeometry.w >= slotGeometry.h ? "wide" : "narrow";
                      return this._renderDisplayTemplateSurface(template, large400Layout ? (autoFit ? slotFormat : template?.user_created ? (orientation === "landscape" ? "wide" : "narrow") : (index ? "narrow" : (this._displayTemplateFormats?.primary || "narrow"))) : (orientation === "landscape" ? "wide" : "narrow"), index === 0, index === 0 ? "primary" : index === 1 ? "secondary" : `slot-${index + 1}`, autoFit || !large400Layout, large400Layout ? (index ? "small" : (this._displayTemplateSizes?.primary || "large")) : "large", autoFit, primaryFillsDisplay ? slotGeometry.w : 0, primaryFillsDisplay ? slotGeometry.h : 0);
                    }).join("")}
                  </div>
                  ${autoFit ? `<canvas class="template-dithered-preview" data-dithered-preview="${ditherKey}" data-dithered-address="${this._escape(address)}" width="${sourceWidth}" height="${sourceHeight}"></canvas>` : ""}
                </div>
              </div>
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>`;
    } finally {
      this._popRenderingDevice(renderingScope);
    }
  },

  _renderTemplateEditorTools() {
    const categories = [
      ["blocks", "view-dashboard-variant-outline", "Prvky šablon"],
      ["text", "format-text", "Text"], ["shapes", "shape-outline", "Tvary"], ["icons", "emoticon-outline", "Ikony"],
      ["codes", "qrcode", "Kódy"],
      ["charts", "chart-box-outline", "Grafy"], ["gauges", "gauge", "Ukazatele"], ["controls", "toggle-switch-outline", "Signalizace"],
      ["images", "image-outline", "Obrázky"], ["layers", "layers-triple-outline", "Vrstvy"],
    ];
    const active = String(this._templateElementPaletteCategory || "");
    return `<nav class="template-tool-rail" aria-label="Kategorie prvků">${categories.map(([id, icon, title]) => `<button type="button" class="${active === id ? "is-active" : ""}" data-template-palette-category="${id}" title="${title}" aria-label="${title}" aria-pressed="${active === id}"><ha-icon icon="mdi:${icon}"></ha-icon></button>`).join("")}</nav>`;
  },

  _renderTemplateElementPalette() {
    const category = String(this._templateElementPaletteCategory || "");
    if (!category) return "";
    const meta = {
      blocks: ["Prvky šablon", "Stejné bloky, ze kterých jsou složené připravené šablony"],
      text: ["Text", "Texty a popisky"], shapes: ["Tvary", "Základní geometrické prvky"], icons: ["Ikony", "Symboly Material Design"],
      codes: ["QR a čárové kódy", "Generované kódy s upravitelným obsahem"],
      charts: ["Grafy", "Vizuální průběhy, sloupce a podíly"], gauges: ["Ukazatele", "Hodnoty, kapacita a průběh"], controls: ["Signalizace", "Stavy zapnuto, vypnuto a aktivita"],
      images: ["Obrázky", "Vlastní soubor z počítače"], layers: ["Vrstvy", "Pořadí objektů na displeji"],
    };
    const [title, description] = meta[category] || meta.shapes;
    const anchorIndex = ["blocks", "text", "shapes", "icons", "codes", "charts", "gauges", "controls", "images", "layers"].indexOf(category);
    const toolPreview = (type, settings) => {
      const item = this._normalizeTemplateEditorElement({ type, ...settings });
      const style = `--element-color:${item.color};--element-fill:${item.fill};--element-stroke:${item.stroke};--element-stroke-width:${item.strokeWidth}px;--element-radius:${item.radius}px;--element-font-size:${item.fontSize}px;--element-font-weight:${item.fontWeight};--element-value:${Math.max(0, Math.min(100, item.value))}%`;
      let preview = "";
      if (item.type === "text") preview = `<b class="template-palette-text-sample">${this._escape(item.text || item.label)}</b>`;
      else if (item.type === "rect") preview = `<i class="template-palette-shape-sample is-rect"></i>`;
      else if (item.type === "circle") preview = `<i class="template-palette-shape-sample is-circle"></i>`;
      else if (item.type === "line") preview = `<i class="template-palette-line-sample"></i>`;
      // The tile is the component itself, at the proportions it will land in.
      else if (this._isTemplateComponentKind(item.type)) preview = this._renderTemplateComponentSvg(item, 296, 128);
      const componentClass = this._isTemplateComponentKind(item.type) ? ` template-overlay-${item.type}` : "";
      return `<span class="template-palette-visual template-palette-preview${componentClass} variant-${this._escape(item.variant || item.type)}" style="${style}">${preview}</span>`;
    };
    const tool = (type, icon, label, preset = {}) => {
      const settings = typeof preset === "string" ? { icon: preset } : { ...preset };
      settings.label ||= label;
      return `<button type="button" class="template-palette-item variant-${this._escape(settings.variant || type)}" draggable="true" data-template-editor-tool="${type}" data-template-editor-icon="${this._escape(settings.icon || "")}" data-template-editor-preset="${this._escape(JSON.stringify(settings))}" title="Vložit ${this._escape(label)}">${toolPreview(type, settings)}<span>${this._escape(label)}</span></button>`;
    };
    const iconNames = [
      ["star", "Hvězda"], ["heart", "Srdce"], ["home", "Dům"], ["account", "Osoba"],
      ["weather-sunny", "Slunce"], ["weather-cloudy", "Mrak"], ["thermometer", "Teplota"], ["water-percent", "Vlhkost"],
      ["wifi", "Wi-Fi"], ["bluetooth", "Bluetooth"], ["lightning-bolt", "Energie"], ["battery", "Baterie"],
      ["calendar", "Kalendář"], ["clock-outline", "Čas"], ["lock-outline", "Zámek"], ["shield-lock-outline", "Zabezpečení"],
      ["lightbulb-on-outline", "Světlo"], ["power", "Napájení"], ["check-circle-outline", "Hotovo"], ["alert-circle-outline", "Upozornění"],
      ["information-outline", "Informace"], ["cart-outline", "Košík"], ["currency-usd", "Cena"], ["map-marker-outline", "Místo"],
      ["door-open", "Dveře"], ["window-open-variant", "Okno"], ["fan", "Ventilátor"], ["radiator", "Topení"],
      ["water-pump", "Čerpadlo"], ["sprinkler-variant", "Zavlažování"], ["solar-power", "Fotovoltaika"], ["ev-station", "Nabíjení"],
      ["bell-outline", "Zvonek"], ["camera-outline", "Kamera"], ["package-variant-closed", "Zásilka"], ["tools", "Dílna"],
    ];
    let content = "";
    if (category === "blocks") content = this._renderTemplateBlockPalette();
    else if (category === "text") content = [
      tool("text", "format-title", "Nadpis", { text: "Nadpis", fontSize: 28, fontWeight: "900", h: 13, variant: "heading" }),
      tool("text", "format-text", "Běžný text", { text: "Vlastní text", fontSize: 17, fontWeight: "400", variant: "body" }),
      tool("text", "numeric", "Velká hodnota", { text: "24,5 °C", fontSize: 32, fontWeight: "900", h: 16, variant: "value" }),
      tool("button", "label-outline", "Text v rámečku", { text: "Popisek", fontSize: 14, radius: 7, variant: "label" }),
      tool("text", "database-search-outline", "Proměnný text", { text: "Proměnná", fontSize: 20, fontWeight: "700", variant: "variable" }),
    ].join("");
    else if (category === "shapes") content = [
      tool("rect", "rectangle-outline", "Obdélník", { variant: "outline" }),
      tool("rect", "rectangle", "Plný blok", { fill: "#111111", stroke: "#111111", variant: "filled" }),
      tool("rect", "rectangle-rounded-outline", "Zaoblený blok", { radius: 12, variant: "rounded" }),
      tool("circle", "circle-outline", "Kruh", { variant: "circle" }),
      tool("circle", "circle", "Plný kruh", { fill: "#111111", variant: "circle-filled" }),
      tool("line", "vector-line", "Čára", { variant: "line" }),
    ].join("");
    else if (category === "icons") content = iconNames.map(([icon, label]) => tool("icon", icon, label, icon)).join("");
    else if (category === "codes") content = [
      tool("qr", "qrcode", "QR kód", { text: "https://dratek.cz", variant: "qr" }),
      tool("qr", "wifi", "QR pro Wi-Fi", { text: "WIFI:T:WPA;S:MojeWiFi;P:heslo;;", variant: "wifi" }),
      tool("qr", "link-variant", "QR odkaz", { text: "https://", variant: "url" }),
      tool("barcode", "barcode", "EAN-13", { text: "859123456789", variant: "ean13" }),
    ].join("");
    else if (category === "charts") content = [
      tool("chart", "chart-bar", "Sloupcový graf", { variant: "bars", color: "#111111" }),
      tool("chart", "chart-line-variant", "Trend", { variant: "spark", color: "#d71912" }),
    ].join("");
    else if (category === "gauges") content = [
      tool("gauge", "gauge", "Kruhový ukazatel", { variant: "ring", value: 68, color: "#d71912" }),
      tool("gauge", "gauge-low", "Půlkruhový ukazatel", { variant: "dial", value: 54, color: "#d71912" }),
      tool("slider", "progress-check", "Průběh", { value: 68, color: "#d71912" }),
    ].join("");
    else if (category === "controls") content = [
      tool("signal", "toggle-switch", "Zapnuto", { variant: "on", text: "Stav", color: "#111111" }),
      tool("signal", "toggle-switch-off-outline", "Vypnuto", { variant: "off", text: "Stav", color: "#111111" }),
      tool("signal", "alert-circle", "Výstraha", { variant: "on", text: "Výstraha", color: "#d71912" }),
    ].join("");
    else if (category === "images") {
      const assets = this._templateImageLibrary || [];
      content = `<button type="button" class="template-palette-item is-import" data-template-editor-import><ha-icon icon="mdi:image-plus"></ha-icon><span>Nahrát obrázek</span></button><input id="templateEditorImage" type="file" accept="image/*" hidden>${assets.map((asset) => `<span class="template-library-image"><button type="button" data-template-library-image="${this._escape(asset.id)}" title="Vložit ${this._escape(asset.name || "obrázek")}"><img src="${this._escape(this._paletteImageSrc(asset))}" alt=""><span>${this._escape(asset.name || "Obrázek")}</span></button><button type="button" class="template-library-image-remove" data-template-library-remove="${this._escape(asset.id)}" title="Odstranit z knihovny" aria-label="Odstranit ${this._escape(asset.name || "obrázek")} z knihovny"><ha-icon icon="mdi:close"></ha-icon></button></span>`).join("")}`;
    }
    else if (category === "layers") {
      const selected = String(this._selectedTemplateEditorElementId || "");
      content = `<div class="template-palette-layers">${(this._templateEditorElements || []).length ? [...this._templateEditorElements].reverse().map((item) => `<div class="${selected === item.id ? "is-selected" : ""}" data-template-editor-select="${this._escape(item.id)}"><ha-icon icon="mdi:${item.type === "block" ? (this._templateBlockSpec(item.blockKind)?.icon || "view-dashboard-variant-outline") : item.type === "image" ? "image-outline" : item.icon || ({ text: "format-text", rect: "rectangle-outline", circle: "circle-outline", line: "vector-line", button: "label-outline", slider: "progress-check", chart: "chart-box-outline", gauge: "gauge", signal: "toggle-switch-outline" }[item.type] || "shape-outline")}"></ha-icon><button type="button" class="template-layer-name" data-template-editor-select="${this._escape(item.id)}">${this._escape(item.label)}</button><button type="button" data-template-editor-remove="${this._escape(item.id)}" title="Odstranit"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div>`).join("") : `<p class="template-layers-empty">Na plátně zatím nejsou žádné vlastní prvky.</p>`}</div>`;
    }
    return `<section class="card template-bottom-palette is-${category}" aria-label="Paleta ${this._escape(title)}" style="--palette-anchor:${Math.max(0, anchorIndex)}"><header><span><strong>${this._escape(title)}</strong><small>${this._escape(description)}</small></span><button type="button" data-template-palette-close title="Zavřít paletu" aria-label="Zavřít paletu"><ha-icon icon="mdi:close"></ha-icon></button></header><div class="template-palette-items ${category === "layers" ? "is-layers" : ""}" data-scroll-key="template-palette:${category}">${content}</div></section>`;
  },

  _templateEditorElement() {
    return (this._templateEditorElements || []).find((item) => item.id === this._selectedTemplateEditorElementId) || null;
  },

  _renderTemplateElementInspector() {
    const item = this._templateEditorElement();
    if (!item) {
      this._selectedTemplateEditorElementId = "";
      return "";
    }
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const field = (title, prop, value, min = 0, max = 100, step = 1, suffix = "%") => `<label class="template-property-field"><span>${title}</span><div><input type="number" min="${min}" max="${max}" step="${step}" value="${number(value)}" data-template-element-prop="${prop}"><small>${suffix}</small></div></label>`;
    const textField = (title, prop, value, placeholder = "") => `<label class="template-property-wide"><span>${title}</span><input type="text" value="${this._escape(value ?? "")}" data-template-element-prop="${prop}" placeholder="${this._escape(placeholder)}"></label>`;
    const freeNumber = (title, prop, value, placeholder = "Automaticky") => `<label class="template-property-wide"><span>${title}</span><input type="number" step="any" value="${value === "" || value == null ? "" : this._escape(value)}" data-template-element-prop="${prop}" placeholder="${placeholder}"></label>`;
    const editorColors = [["#111111", "Černá"], ["#d71912", "Červená"], ...(this._displaySupportsYellow() ? [["#f4c400", "Žlutá"]] : []), ["#ffffff", "Bílá"]];
    const colors = (prop, value, allowTransparent = false, inheritTitle = "") => `<div class="template-property-colors" data-template-color-group="${prop}">${inheritTitle ? `<button type="button" class="is-inherit ${value === "" ? "is-selected" : ""}" data-template-element-color="${prop}:" title="${this._escape(inheritTitle)}"><ha-icon icon="mdi:link-variant"></ha-icon></button>` : ""}${allowTransparent ? `<button type="button" class="is-transparent ${value === "transparent" ? "is-selected" : ""}" data-template-element-color="${prop}:transparent" title="Bez barvy"><ha-icon icon="mdi:water-off-outline"></ha-icon></button>` : ""}${editorColors.map(([color, title]) => `<button type="button" style="--swatch:${color}" class="${value === color ? "is-selected" : ""}" data-template-element-color="${prop}:${color}" title="${title}"></button>`).join("")}</div>`;
    const toggles = (items) => `<div class="template-component-toggles">${items.map(([prop, label]) => `<label><input type="checkbox" data-template-element-toggle="${prop}" ${item[prop] !== false ? "checked" : ""}><span><i></i>${label}</span></label>`).join("")}</div>`;
    const intervalOptions = [["change", "Při každé změně"], ["minute", "Nejvýše 1× za minutu"], ["hour", "Nejvýše 1× za hodinu"], ["day", "Nejvýše 1× denně"], ["week", "Nejvýše 1× týdně"]];
    const resetOptions = [["never", "Nemazat automaticky"], ["hour", "Vymazat po hodině"], ["day", "Vymazat po dni"], ["week", "Vymazat po týdnu"]];
    const select = (title, prop, value, options) => `<label class="template-property-wide"><span>${title}</span><select data-template-element-prop="${prop}">${options.map(([key, label]) => `<option value="${key}" ${value === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
    const entity = item.entityId ? this._hass?.states?.[item.entityId] : null;
    const entityValue = this._templateElementEntityRaw?.(item);
    const propertyTab = (title, content, open = false, extraClass = "") => `<details class="template-property-section ${extraClass}" ${open ? "open" : ""}><summary><span>${title}</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="template-property-section-body">${content}</div></details>`;
    const entityBinding = ["text", "chart", "gauge", "signal", "slider"].includes(item.type) ? propertyTab("Home Assistant", `<label class="template-property-wide"><span>Entita nebo pomocník</span><ha-selector data-template-element-entity-picker="${this._escape(item.id)}"></ha-selector></label><label class="template-property-wide"><span>Entity ID</span><input type="text" value="${this._escape(item.entityId || "")}" data-template-element-entity-id placeholder="sensor.teplota"></label><label class="template-property-wide"><span>Atribut (volitelné)</span><input type="text" value="${this._escape(item.entityAttribute || "")}" data-template-element-prop="entityAttribute" placeholder="Například prices"></label>${item.entityId ? `<div class="template-entity-current"><ha-icon icon="mdi:home-assistant"></ha-icon><span><strong>${this._escape(entity?.attributes?.friendly_name || item.entityId)}</strong><small>${this._escape(entityValue === undefined ? "Entita nemá hodnotu" : String(entityValue))}</small></span></div>` : `<p class="template-entity-help">Bez vybrané entity se používá ručně nastavená hodnota.</p>`}`, true, "template-ha-binding") : "";
    const textTypes = ["text", "button", "signal"];
    const shapeTypes = ["rect", "circle", "button", "signal"];
    return `<div class="template-element-inspector">
      <div class="template-editor-panel-heading"><ha-icon icon="mdi:tune-vertical-variant"></ha-icon><span><strong>Vlastnosti prvku</strong><small>${this._escape(item.label)}</small></span></div>
      <div class="template-inspector-actions"><button type="button" data-template-element-duplicate><ha-icon icon="mdi:content-duplicate"></ha-icon>Duplikovat</button><button type="button" class="is-danger" data-template-element-delete><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat</button></div>
      ${propertyTab("Umístění, velikost a barva", `<div class="template-property-row">${field("X", "x", item.x, 0, 100, .1, "%")}${field("Y", "y", item.y, 0, 100, .1, "%")}</div><div class="template-property-row">${field("Šířka", "w", item.w, 2, 100, .1, "%")}${field("Výška", "h", item.h, 2, 100, .1, "%")}</div>${field("Natočení", "rotation", item.rotation, -180, 180, 1, "°")}${item.type === "block" ? "" : `<label class="template-property-wide"><span>Barva podkladu</span>${colors("fill", item.fill, true)}</label>`}`, true)}
      ${item.type === "block" ? this._renderTemplateBlockInspector(item) : ""}
      ${this._isTemplateComponentKind(item.type) ? propertyTab("Barvy jednotlivých částí", `${this._templateComponentParts(item.type).map(([prop, title, inherits]) => `<label class="template-property-wide"><span>${this._escape(title)}</span>${colors(prop, item[prop] || "", true, inherits ? "Podle hlavní barvy" : "")}</label>`).join("")}<p class="template-entity-help">${this._displaySupportsYellow() ? "Displej tiskne jen černou, bílou, červenou a žlutou - jiné odstíny na něm neexistují." : "Displej tiskne jen černou, bílou a červenou - jiné odstíny na něm neexistují."}</p>`, true) : ""}
      ${["qr", "barcode"].includes(item.type) ? propertyTab(item.type === "qr" ? "Obsah QR kódu" : "Data EAN-13", `<label class="template-property-wide"><span>${item.type === "qr" ? "Text, URL nebo Wi-Fi konfigurace" : "12 nebo 13 číslic"}</span><input type="text" value="${this._escape(item.text || "")}" data-template-element-prop="text"></label><p class="template-entity-help">Kód se po změně automaticky znovu vygeneruje.</p>`, true) : ""}
      ${textTypes.includes(item.type) ? `${propertyTab("Text a typografie", `
        <label class="template-property-wide"><span>Obsah</span><input type="text" value="${this._escape(item.text || "")}" data-template-element-prop="text"></label>
        <div class="template-property-row">${field("Velikost", "fontSize", item.fontSize, 6, 72, 1, "px")}${select("Řez", "fontWeight", String(item.fontWeight), [["400", "Normální"], ["700", "Tučný"], ["900", "Extra tučný"]])}</div>
        <label class="template-property-wide"><span>Zarovnání</span><div class="template-align-buttons">${[["left", "format-align-left"], ["center", "format-align-center"], ["right", "format-align-right"]].map(([value, icon]) => `<button type="button" class="${item.textAlign === value ? "is-selected" : ""}" data-template-element-align="${value}"><ha-icon icon="mdi:${icon}"></ha-icon></button>`).join("")}</div></label>
        <label class="template-property-wide"><span>Barva textu</span>${colors("color", item.color)}</label>
      `, true)}` : ""}
      ${["icon", "signal"].includes(item.type) ? propertyTab("Ikona", `<label class="template-property-wide"><span>Název MDI ikony</span><input type="text" value="${this._escape(item.icon || "star")}" data-template-element-prop="icon"></label><label class="template-property-wide"><span>Barva</span>${colors("color", item.color)}</label>`, true) : ""}
      ${shapeTypes.includes(item.type) && item.type !== "signal" ? propertyTab("Vzhled", `<label class="template-property-wide"><span>Výplň</span>${colors("fill", item.fill, true)}</label><label class="template-property-wide"><span>Rámeček</span>${colors("stroke", item.stroke)}</label>${field("Tloušťka rámečku", "strokeWidth", item.strokeWidth, 0, 12, 1, "px")}`, true) : ""}
      ${item.type === "signal" ? propertyTab("Stav", `${textField("Popisek", "text", item.text || "", "Stav")}<label class="template-property-wide"><span>Barva</span>${colors("color", item.color)}</label>`, true) : ""}
      ${item.type === "slider" ? propertyTab("Průběh a hodnota", `${textField("Popisek", "text", item.text || "", "Průběh")}${field("Hodnota", "value", item.value, 0, 100, 1, "%")}${textField("Jednotka", "unit", item.unit || "%", "%")}<label class="template-property-wide"><span>Barva</span>${colors("color", item.color)}</label>`, true) : ""}
      ${item.type === "chart" ? propertyTab("Graf", `${select("Typ grafu", "variant", item.variant, [["bars", "Sloupcový"], ["spark", "Trend"]])}${textField("Nadpis", "chartTitle", item.chartTitle || "", "Např. Teplota")}<label class="template-property-wide"><span>Barva</span>${colors("color", item.color)}</label>`, true) : ""}
      ${item.type === "gauge" ? propertyTab("Ukazatel", `${select("Typ ukazatele", "variant", item.variant, [["ring", "Kruh"], ["dial", "Půlkruh"]])}${textField("Popisek", "text", item.text || "", "Hodnota")}${textField("Jednotka", "unit", item.unit || "%", "%")}${field("Hodnota", "value", item.value, 0, 100, 1, "%")}<label class="template-property-wide"><span>Barva</span>${colors("color", item.color)}</label>`, true) : ""}
      ${entityBinding}
      ${item.type === "chart" ? propertyTab("Data grafu", `<label class="template-property-wide"><span>Vlastní hodnoty oddělené čárkou</span><textarea rows="3" data-template-chart-values placeholder="18, 24, 21, 32">${this._escape((item.historyValues || []).join(", "))}</textarea></label>${field("Počet posledních hodnot", "historyLimit", item.historyLimit, 2, 20, 1, "")} ${select("Interval ukládání hodnot", "sampleInterval", item.sampleInterval, intervalOptions)}<button type="button" class="template-history-clear" data-template-element-history-clear><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Vymazat uložené hodnoty</button><small class="template-history-count">Uloženo ${(item.historyValues || []).length} z ${item.historyLimit} hodnot</small>`, true) : ""}
      ${item.type === "chart" && item.variant === "spark" ? propertyTab("Popisky", toggles([["showLabel", "Popisek"]])) : ""}
      ${item.type === "gauge" ? propertyTab("Popisky", toggles([["showValue", "Hodnota"], ["showLabel", "Popisek"]])) : ""}
      ${item.type === "signal" ? propertyTab("Popisky", toggles([["showLabel", "Popisek"], ["showState", "Stav"]])) : ""}
      ${item.type === "slider" ? propertyTab("Popisky", toggles([["showValue", "Hodnota"], ["showLabel", "Popisek"]])) : ""}
      ${propertyTab("Pořadí vrstev", `<div class="template-layer-order"><button type="button" data-template-element-order="back"><ha-icon icon="mdi:arrange-send-backward"></ha-icon>Dozadu</button><button type="button" data-template-element-order="front"><ha-icon icon="mdi:arrange-bring-forward"></ha-icon>Dopředu</button></div><p class="template-entity-help">Polohu, velikost a orientaci upravíte v úzkém panelu nad náhledem displeje.</p>`)}
      <button type="button" class="template-inspector-close" data-template-element-deselect><ha-icon icon="mdi:arrow-left"></ha-icon>Zpět k nastavení šablony</button>
    </div>`;
  },

  _renderTemplatePartInspector(activeTemplate) {
    const key = String(this._selectedTemplatePart || "");
    const adjustment = this._templateElementAdjustments?.[key];
    if (!key || !adjustment) return "";
    const partNumber = Number(key.split(":").at(-1)) + 1;
    const field = (label, prop, value, min, max, suffix = "") => `<label class="template-property-field"><span>${label}</span><div><input type="number" min="${min}" max="${max}" step="1" value="${Math.round(Number(value || 0))}" data-template-part-prop="${prop}"><small>${suffix}</small></div></label>`;
    const selectedColor = adjustment.color || "black";
    return `<div class="template-element-inspector template-built-in-inspector">
      <div class="template-editor-panel-heading"><ha-icon icon="mdi:vector-selection"></ha-icon><span><strong>Vlastnosti prvku šablony</strong><small>${this._escape(activeTemplate?.title || "Šablona")} · prvek ${partNumber}</small></span></div>
      <div class="template-inspector-actions"><button type="button" data-template-element-duplicate><ha-icon icon="mdi:content-duplicate"></ha-icon>Duplikovat</button><button type="button" class="is-danger" data-template-element-delete><ha-icon icon="mdi:trash-can-outline"></ha-icon>Skrýt</button></div>
      <details class="template-property-section" open><summary><span>Poloha a transformace</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="template-property-section-body">
        <div class="template-property-row">${field("Posun X", "x", adjustment.x, -1000, 1000, "px")}${field("Posun Y", "y", adjustment.y, -1000, 1000, "px")}</div>
        <div class="template-property-row">${field("Velikost", "scale", Number(adjustment.scale ?? 1) * 100, 20, 300, "%")}${field("Otočení", "rotation", adjustment.rotation, -180, 180, "°")}</div>
        <button type="button" class="template-history-clear" data-template-part-reset="${this._escape(key)}"><ha-icon icon="mdi:restore"></ha-icon>Obnovit původní stav</button>
      </div></details>
      <details class="template-property-section" open><summary><span>Vzhled a viditelnost</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="template-property-section-body">
        <label class="template-property-wide"><span>Barva prvku</span><div class="template-property-colors"><button type="button" style="--swatch:#111111" class="${selectedColor === "black" ? "is-selected" : ""}" data-template-part-color="black" title="Černá"></button><button type="button" style="--swatch:#d71912" class="${selectedColor === "red" ? "is-selected" : ""}" data-template-part-color="red" title="Červená"></button>${this._displaySupportsYellow() ? `<button type="button" style="--swatch:#f4c400" class="${selectedColor === "yellow" ? "is-selected" : ""}" data-template-part-color="yellow" title="Žlutá"></button>` : ""}<button type="button" style="--swatch:#ffffff" class="${selectedColor === "white" ? "is-selected" : ""}" data-template-part-color="white" title="Bílá"></button></div></label>
        <div class="template-component-toggles"><label><input type="checkbox" data-template-part-toggle="hidden" ${adjustment.hidden ? "" : "checked"}><span><i></i>Viditelný</span></label><label><input type="checkbox" data-template-part-toggle="locked" ${adjustment.locked ? "checked" : ""}><span><i></i>Zamknutý</span></label></div>
      </div></details>
      <details class="template-property-section"><summary><span>Pořadí vrstev</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="template-property-section-body"><div class="template-layer-order"><button type="button" data-template-element-order="back"><ha-icon icon="mdi:arrange-send-backward"></ha-icon>Dozadu</button><button type="button" data-template-element-order="front"><ha-icon icon="mdi:arrange-bring-forward"></ha-icon>Dopředu</button></div></div></details>
      <button type="button" class="template-inspector-close" data-template-part-deselect><ha-icon icon="mdi:arrow-left"></ha-icon>Zrušit výběr</button>
    </div>`;
  },

  _applyTemplatePartAdjustment(element, surface, adjustment) {
    const x = Number(adjustment.x || 0);
    const y = Number(adjustment.y || 0);
    const scale = Math.max(.2, Math.min(3, Number(adjustment.scale ?? 1)));
    const rotation = Number(adjustment.rotation || 0);
    if (typeof element.setAttribute === "function") {
      element.setAttribute("transform", `translate(${x}, ${y}) rotate(${rotation}) scale(${scale})`);
    }
    element.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;
    element.style.transformOrigin = "center";
    element.style.display = adjustment.hidden ? "none" : "";
    element.style.pointerEvents = adjustment.locked ? "none" : "";
    element.style.position = "relative";
    element.style.zIndex = String(Number(adjustment.order || 0));
    element.classList.toggle("is-locked", !!adjustment.locked);
    const color = { black: "#111111", red: "#d71912", yellow: this._displaySupportsYellow() ? "#f4c400" : "#d71912", white: "#ffffff" }[adjustment.color];
    if (color) {
      element.style.color = color;
      [element, ...element.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text")].forEach((node) => {
        const fill = node.getAttribute?.("fill");
        const stroke = node.getAttribute?.("stroke");
        if (fill && fill !== "none" && !["#fff", "#ffffff", "white"].includes(fill.toLowerCase())) node.style.fill = color;
        if (stroke && stroke !== "none" && !["#fff", "#ffffff", "white"].includes(stroke.toLowerCase())) node.style.stroke = color;
      });
    }
  },

  _bindTemplatePartEditor() {
    if (this._activeTab !== "display-settings" || this._displaySettingsView !== "designer") return;
    this._templateElementAdjustments ||= {};
    this.shadowRoot.querySelectorAll(".display-template-editor-stage .display-template-surface").forEach((surface) => {
      const templateId = surface.dataset.previewTemplate || "";
      const slot = surface.dataset.templateCanvasSlot || "primary";
      const templateRoot = surface.querySelector(".tpl") || surface.querySelector(".template-responsive-preview-body") || surface.querySelector("svg.template-responsive-preview");
      if (!templateRoot) return;
      const parts = [...templateRoot.children].filter((child) => child.tagName !== "rect" || child.getAttribute("fill") !== "#ffffff");
      parts.forEach((element, index) => {
        const key = `${slot}:${templateId}:${index}`;
        const adjustment = this._templateElementAdjustments[key] || { x: 0, y: 0, scale: 1, rotation: 0 };
        this._templateElementAdjustments[key] = adjustment;
        const nativeBounds = element.getBBox?.();
        const visualBounds = element.getBoundingClientRect?.();
        adjustment.baseX ??= Number(nativeBounds?.x || 0);
        adjustment.baseY ??= Number(nativeBounds?.y || 0);
        adjustment.baseWidth ||= Number(nativeBounds?.width || visualBounds?.width || 1);
        adjustment.baseHeight ||= Number(nativeBounds?.height || visualBounds?.height || 1);
        element.dataset.templateEditablePart = key;
        element.classList.add("template-editable-part");
        element.classList.toggle("is-selected", this._selectedTemplatePart === key);
        this._applyTemplatePartAdjustment(element, surface, adjustment);
        element.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || adjustment.locked) return;
          event.preventDefault();
          event.stopPropagation();
          this._selectedTemplatePart = key;
          this._selectedTemplateEditorElementId = "";
          this.shadowRoot.querySelectorAll(".template-editable-part.is-selected").forEach((item) => item.classList.remove("is-selected"));
          element.classList.add("is-selected");

          const svg = surface.querySelector("svg.template-responsive-preview") || surface.querySelector("svg");
          const bounds = (svg || surface).getBoundingClientRect();
          const viewBox = svg?.viewBox?.baseVal;
          const nativeWidth = viewBox?.width || Number(svg?.getAttribute("width")) || bounds.width || 1;
          const nativeHeight = viewBox?.height || Number(svg?.getAttribute("height")) || bounds.height || 1;
          const ctm = svg?.getScreenCTM?.();
          const scaleX = ctm?.a ? (1 / ctm.a) : (bounds.width > 0 ? (nativeWidth / bounds.width) : 1);
          const scaleY = ctm?.d ? (1 / ctm.d) : (bounds.height > 0 ? (nativeHeight / bounds.height) : 1);

          this._templatePartDrag = {
            key,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: Number(adjustment.x || 0),
            originY: Number(adjustment.y || 0),
            scaleX,
            scaleY,
            historyPushed: false,
          };
          element.setPointerCapture?.(event.pointerId);
        });
        element.addEventListener("pointermove", (event) => {
          const drag = this._templatePartDrag;
          if (!drag || drag.key !== key || drag.pointerId !== event.pointerId) return;
          if (!drag.historyPushed) {
            this._pushTemplateHistory();
            drag.historyPushed = true;
          }
          const dxScreen = event.clientX - drag.startX;
          const dyScreen = event.clientY - drag.startY;
          adjustment.x = drag.originX + (dxScreen * drag.scaleX);
          adjustment.y = drag.originY + (dyScreen * drag.scaleY);
          this._applyTemplatePartAdjustment(element, surface, adjustment);
        });
        const finish = (event) => {
          const drag = this._templatePartDrag;
          if (!drag || drag.key !== key || drag.pointerId !== event.pointerId) return;
          this._templatePartDrag = null;
          element.releasePointerCapture?.(event.pointerId);
          this._templateSaveResult = null;
          this._render();
          this._paint();
        };
        element.addEventListener("pointerup", finish);
        element.addEventListener("pointercancel", finish);
      });
    });
  },

  _normalizeTemplateEditorElement(source = {}) {
    const type = String(source.type || "rect");
    const defaults = {
      text: { w: 42, h: 10, text: "Vlastní text", fontSize: 18, fill: "transparent", fontFamily: "DRATEK eInk Sans", fontStyle: "normal", textDecoration: "none", textOutlineWidth: 0, textOutlineColor: "#ffffff", textBorderWidth: 0, textBorderColor: "#111111", overlayOpacity: 100 },
      rect: { w: 36, h: 22, fill: "transparent" }, circle: { w: 25, h: 25, fill: "transparent" },
      line: { w: 42, h: 4, fill: "#111111" }, icon: { w: 18, h: 18, icon: "star", fill: "transparent" },
      qr: { w: 30, h: 30, text: "https://dratek.cz", fill: "#ffffff", color: "#111111", strokeWidth: 0 },
      barcode: { w: 52, h: 24, text: "859123456789", fill: "#ffffff", color: "#111111", strokeWidth: 0 },
      image: { w: 34, h: 28, fill: "transparent" }, button: { w: 42, h: 14, text: "Popisek", fontSize: 15, fill: "#ffffff", radius: 6 },
      slider: { w: 48, h: 15, value: 60, unit: "%", fill: "#ffffff", radius: 0, strokeWidth: 2, entityId: "", entityAttribute: "", showValue: true, showPercent: true, showScale: true, showTrack: true },
      chart: { w: 52, h: 32, value: 68, fill: "#ffffff", radius: 0, strokeWidth: 2, entityId: "", entityAttribute: "", chartTitle: "Vývoj hodnoty", unit: "%", chartMin: "", chartMax: "", barColor: "#d71912", historyLimit: 10, sampleInterval: "change", resetInterval: "never", historyValues: [], historyUpdatedAt: 0, historyResetAt: 0, showValue: true, showPercent: false, showLabel: true, showGrid: true, showPoints: true, showFill: true, showTrack: true },
      gauge: { w: 26, h: 34, value: 72, text: "Hodnota", unit: "%", fill: "#ffffff", radius: 0, strokeWidth: 2, entityId: "", entityAttribute: "", variant: "ring", showValue: true, showPercent: true, showLabel: true, showTrack: true },
      signal: { w: 40, h: 14, value: 100, text: "Aktivní", icon: "check-circle", fontSize: 9, fill: "#ffffff", radius: 6, strokeWidth: 2, entityId: "", entityAttribute: "", variant: "active", showIcon: true, showLabel: true, showState: true },
      // A template block carries its own spec in `block` and paints itself
      // through _renderTemplateBlock, so the overlay wrapper must add nothing:
      // a fill or a border here would frame every block with a box no prepared
      // template has.
      block: { w: 70, h: 20, fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 0, blockKind: "text" },
    }[type] || { w: 30, h: 20, fill: "transparent" };
    const legacy = source.w === undefined || source.h === undefined;
    const w = Math.max(2, Math.min(100, Number(source.w ?? defaults.w)));
    const h = Math.max(2, Math.min(100, Number(source.h ?? defaults.h)));
    const sourceX = Number(source.x ?? 50);
    const sourceY = Number(source.y ?? 50);
    const paletteColor = (value, fallback, transparent = false) => {
      const normalized = String(value ?? fallback).toLowerCase();
      if (transparent && normalized === "transparent") return "transparent";
      if (["#fff", "#ffffff", "white"].includes(normalized)) return "#ffffff";
      if (["#e31b1b", "#d71912", "#f00", "#ff0000", "red"].includes(normalized)) return "#d71912";
      if (["#f4c400", "#ffd400", "#ffff00", "yellow"].includes(normalized)) return this._displaySupportsYellow() ? "#f4c400" : "#d71912";
      return "#111111";
    };
    // Part colours are stored empty when untouched, which is what "inherit
    // from the main colour" means. Running them through paletteColor instead
    // would turn every unset part black and repaint every template already
    // saved.
    const partColor = (value) => {
      const normalized = String(value ?? "").trim().toLowerCase();
      return ["#111111", "#d71912", "#f4c400", "#ffffff", "transparent"].includes(normalized) ? normalized : "";
    };
    return {
      ...defaults, ...source, type, w, h,
      gridColor: partColor(source.gridColor), labelColor: partColor(source.labelColor),
      valueColor: partColor(source.valueColor), pointColor: partColor(source.pointColor),
      trackColor: partColor(source.trackColor),
      x: Math.max(0, Math.min(100 - w, legacy ? sourceX - w / 2 : sourceX)),
      y: Math.max(0, Math.min(100 - h, legacy ? sourceY - h / 2 : sourceY)),
      rotation: Number(source.rotation || 0), color: paletteColor(source.color, "#111111"), fill: paletteColor(source.fill, defaults.fill ?? "transparent", true),
      stroke: paletteColor(source.stroke, "#111111"), strokeWidth: Number(source.strokeWidth ?? 3), radius: Number(source.radius ?? defaults.radius ?? 0),
      fontSize: Number(source.fontSize ?? defaults.fontSize ?? 16), fontWeight: String(source.fontWeight || "700"), fontFamily: ["DRATEK eInk Sans", "Arial", "Georgia", "Courier New"].includes(source.fontFamily) ? source.fontFamily : (defaults.fontFamily || "DRATEK eInk Sans"), fontStyle: source.fontStyle === "italic" ? "italic" : "normal", textDecoration: ["underline", "line-through"].includes(source.textDecoration) ? source.textDecoration : "none", textAlign: source.textAlign || "center",
      textOutlineWidth: Math.max(0, Math.min(6, Number(source.textOutlineWidth ?? defaults.textOutlineWidth ?? 0))), textOutlineColor: paletteColor(source.textOutlineColor, defaults.textOutlineColor || "#ffffff"), textBorderWidth: Math.max(0, Math.min(12, Number(source.textBorderWidth ?? defaults.textBorderWidth ?? 0))), textBorderColor: paletteColor(source.textBorderColor, defaults.textBorderColor || "#111111"), overlayOpacity: Math.max(0, Math.min(100, Number(source.overlayOpacity ?? defaults.overlayOpacity ?? 100))),
      value: Number(source.value ?? defaults.value ?? 50), historyLimit: Math.max(1, Math.min(20, Number(source.historyLimit ?? defaults.historyLimit ?? 10))),
    };
  },

  _templateHistorySnapshot() {
    return {
      elements: structuredClone(this._templateEditorElements || []),
      adjustments: structuredClone(this._templateElementAdjustments || {}),
      selectedElementId: String(this._selectedTemplateEditorElementId || ""),
      selectedPart: String(this._selectedTemplatePart || ""),
    };
  },

  _pushTemplateHistory() {
    this._templateUndoStack ||= [];
    this._templateRedoStack ||= [];
    const snapshot = this._templateHistorySnapshot();
    const last = this._templateUndoStack.at(-1);
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;
    this._templateUndoStack.push(snapshot);
    if (this._templateUndoStack.length > (this._templateHistoryLimit || 60)) this._templateUndoStack.shift();
    this._templateRedoStack = [];
  },

  _restoreTemplateHistory(snapshot) {
    if (!snapshot) return;
    this._templateEditorElements = structuredClone(snapshot.elements || []);
    this._templateElementAdjustments = structuredClone(snapshot.adjustments || {});
    this._selectedTemplateEditorElementId = String(snapshot.selectedElementId || "");
    this._selectedTemplatePart = String(snapshot.selectedPart || "");
    this._templateOverlayDrag = null;
    this._templatePropertyHistoryKey = "";
    this._templateSaveResult = null;
    this._render();
    this._paint();
  },

  _undoTemplateHistory() {
    if (!this._templateUndoStack?.length) return;
    this._templateRedoStack ||= [];
    this._templateRedoStack.push(this._templateHistorySnapshot());
    this._restoreTemplateHistory(this._templateUndoStack.pop());
  },

  _redoTemplateHistory() {
    if (!this._templateRedoStack?.length) return;
    this._templateUndoStack ||= [];
    this._templateUndoStack.push(this._templateHistorySnapshot());
    this._restoreTemplateHistory(this._templateRedoStack.pop());
  },

  _deleteSelectedTemplateElement() {
    const id = String(this._selectedTemplateEditorElementId || "");
    if (!id || !(this._templateEditorElements || []).some((item) => item.id === id)) return;
    this._pushTemplateHistory();
    this._templateEditorElements = this._templateEditorElements.filter((item) => item.id !== id);
    this._selectedTemplateEditorElementId = "";
    this._templateSaveResult = null;
    this._render();
    this._paint();
  },

  _addTemplateEditorElement(type, icon = "", position = null, preset = {}) {
    const settings = preset && typeof preset === "object" && !Array.isArray(preset) ? preset : {};
    const labels = { text: "Vlastní text", rect: "Obdélník", circle: "Kruh", line: "Čára", icon: "Ikona", qr: "QR kód", barcode: "EAN-13", button: "Text v rámečku", slider: "Stupnice", chart: "Graf", gauge: "Ukazatel", signal: "Signalizace", block: "Prvek šablony" };
    this._templateEditorElements ||= [];
    this._pushTemplateHistory();
    const item = this._normalizeTemplateEditorElement({
      ...settings,
      id: `template-element-${Date.now()}-${this._templateEditorElements.length}`,
      type, icon: settings.icon || icon || undefined, label: settings.label || (type === "icon" ? `Ikona ${icon || "star"}` : labels[type] || "Prvek"),
      x: position?.x, y: position?.y,
    });
    // Circular primitives start with an exact visual selection. Users can still
    // resize width and height independently afterwards.
    if (["icon", "circle", "qr"].includes(type) || (type === "chart" && item.variant === "donut") || (type === "gauge" && ["ring", "semicircle"].includes(item.variant))) this._fitTemplateElementVisualAspect(item, 1);
    // A block whose drawing is a circle (the ring gauge, a lone icon) is only
    // round if its box is - every other block wants the width the palette
    // proposed for it.
    if (type === "block" && this._templateBlockSpec?.(item.blockKind)?.square) this._fitTemplateElementVisualAspect(item, 1);
    item.x = Math.max(0, Math.min(100 - item.w, Number(position?.x ?? 50) - item.w / 2));
    item.y = Math.max(0, Math.min(100 - item.h, Number(position?.y ?? 50) - item.h / 2));
    this._templateEditorElements.push(item);
    this._selectedTemplateEditorElementId = item.id;
    this._selectedTemplatePart = "";
    this._templateSaveResult = null;
    this._render();
    this._paint();
  },

  _quantizeImportedTemplatePixel(red, green, blue, alpha = 255) {
    if (alpha < 40) return [255, 255, 255, 255];
    // Imported assets are stored in the complete four-colour palette.  The
    // target display is deliberately not consulted here: keeping yellow in
    // the reusable source lets a four-colour panel render it as yellow, while
    // the final device quantizer maps it to red on a three-colour panel.
    const yellow = red >= 161 && green >= 128 && blue < 96;
    if (yellow) return [244, 196, 0, 255];
    // Restore the colour classifier used by the original canvas designer.
    // A nearest-palette calculation turns beige, brown and warm greys red even
    // though the source is not red.  The physical panel has a separate red
    // pigment, so only pixels with a genuinely dominant red channel may use it.
    const redScore = red - Math.max(green, blue);
    const luminance = (38 * red + 75 * green + 15 * blue) >> 7;
    // The extra channel ratios keep skin, beige and warm paper tones out of the
    // red plane while still mapping saturated red, orange and magenta correctly.
    if (redScore > 45 && red > 120 && green < red * 0.68 && blue < red * 0.72) {
      return [220, 20, 12, 255];
    }
    if (luminance < 160) return [0, 0, 0, 255];
    return [255, 255, 255, 255];
  },

  _ditherImportedTemplateImageData(pixels, width, height, paletteKey = "") {
    const supportsYellow = paletteKey === "bwry"
      || (paletteKey !== "bwr" && this._displaySupportsYellow?.(this._device?.() ?? null) === true);
    // Keep the natural v0.1.292 colour mapping: choose the physically nearest
    // ink in plain RGB space, then distribute only the quantization error.
    // The only change is that each hardware family gets its own real palette.
    const palette = supportsYellow
      ? [[255, 255, 255], [0, 0, 0], [220, 20, 12], [244, 196, 0]]
      : [[255, 255, 255], [0, 0, 0], [220, 20, 12]];
    const original = new Uint8ClampedArray(pixels.data);
    const work = new Float32Array(pixels.data.length);
    // Recover depth before reducing the photograph to physical inks. A small
    // local-contrast pass separates feather/face/branch midtones that would
    // otherwise collapse into one bright dither pattern. The summed-area table
    // keeps this linear even on a 400x300 panel.
    const luminance = new Float32Array(width * height);
    const integral = new Float32Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y += 1) {
      let rowSum = 0;
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        const value = (0.2126 * original[offset]
          + 0.7152 * original[offset + 1]
          + 0.0722 * original[offset + 2]) / 255;
        luminance[pixel] = value;
        rowSum += value;
        integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + rowSum;
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        const left = Math.max(0, x - 2);
        const right = Math.min(width - 1, x + 2);
        const top = Math.max(0, y - 2);
        const bottom = Math.min(height - 1, y + 2);
        const stride = width + 1;
        const localSum = integral[(bottom + 1) * stride + right + 1]
          - integral[top * stride + right + 1]
          - integral[(bottom + 1) * stride + left]
          + integral[top * stride + left];
        const localAverage = localSum / ((right - left + 1) * (bottom - top + 1));
        const sourceLuminance = luminance[pixel];
        const localContrast = (sourceLuminance - localAverage) * 0.55;
        const shapedLuminance = Math.max(0, Math.min(1,
          0.42 + (sourceLuminance - 0.42) * 1.10 - 0.015 + localContrast));
        for (let channel = 0; channel < 3; channel += 1) {
          const chroma = original[offset + channel] - sourceLuminance * 255;
          work[offset + channel] = Math.max(0, Math.min(255, shapedLuminance * 255 + chroma * 0.96));
        }
        work[offset + 3] = original[offset + 3];
      }
    }
    // All physical inks participate at every pixel. This is intentional:
    // Floyd-Steinberg error diffusion uses sparse red/black/white dots to
    // reproduce hue, brightness, shadows and highlights as an optical mixture.
    const chooseInk = (source) => palette.reduce((best, color) => {
        const distance = (source[0] - color[0]) ** 2
          + (source[1] - color[1]) ** 2
          + (source[2] - color[2]) ** 2;
        return distance < best.distance ? { color, distance } : best;
      }, { color: palette[0], distance: Number.POSITIVE_INFINITY }).color;
    // A regular 8x8 threshold pattern adds a controlled amount of red ink to
    // saturated BWR colours (especially greens/blues). At normal viewing
    // distance those sparse red dots optically mix with black and white. The
    // density is deliberately derived from the untouched source pixel, so the
    // Floyd error feedback cannot turn the complete picture solid red.
    const opticalThreshold = [
      0, 48, 12, 60, 3, 51, 15, 63,
      32, 16, 44, 28, 35, 19, 47, 31,
      8, 56, 4, 52, 11, 59, 7, 55,
      40, 24, 36, 20, 43, 27, 39, 23,
      2, 50, 14, 62, 1, 49, 13, 61,
      34, 18, 46, 30, 33, 17, 45, 29,
      10, 58, 6, 54, 9, 57, 5, 53,
      42, 26, 38, 22, 41, 25, 37, 21,
    ];
    const redInk = palette[2];
    const addError = (x, y, error, weight) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) work[offset + channel] += error[channel] * weight;
    };
    for (let y = 0; y < height; y += 1) {
      const reverse = y % 2 === 1;
      for (let step = 0; step < width; step += 1) {
        const x = reverse ? width - 1 - step : step;
        const offset = (y * width + x) * 4;
        if (work[offset + 3] < 40) {
          [work[offset], work[offset + 1], work[offset + 2], work[offset + 3]] = [255, 255, 255, 255];
          continue;
        }
        const source = [work[offset], work[offset + 1], work[offset + 2]];
        let chosen = chooseInk(source);
        if (!supportsYellow && chosen !== redInk) {
          const red = original[offset];
          const green = original[offset + 1];
          const blue = original[offset + 2];
          const maximum = Math.max(red, green, blue);
          const saturation = maximum > 0
            ? (maximum - Math.min(red, green, blue)) / maximum
            : 0;
          const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
          const redDensity = saturation * 0.45 * (0.35 + 0.65 * luminance);
          const threshold = (opticalThreshold[(y % 8) * 8 + (x % 8)] + 0.5) / 64;
          if (threshold < redDensity) chosen = redInk;
        }
        const error = source.map((value, channel) => value - chosen[channel]);
        [work[offset], work[offset + 1], work[offset + 2], work[offset + 3]] = [...chosen, 255];
        const direction = reverse ? -1 : 1;
        addError(x + direction, y, error, 7 / 16);
        addError(x - direction, y + 1, error, 3 / 16);
        addError(x, y + 1, error, 5 / 16);
        addError(x + direction, y + 1, error, 1 / 16);
      }
    }
    for (let index = 0; index < pixels.data.length; index += 1) pixels.data[index] = Math.max(0, Math.min(255, Math.round(work[index])));
    return pixels;
  },

  _renderCustomImageTemplateForDevice(source, device = this._device()) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const physical = this._devicePreviewSize?.(device) || { width: 296, height: 128 };
        const portrait = this._displayTemplateOrientation === "portrait";
        const width = Math.max(1, Math.round(portrait ? Math.min(physical.width, physical.height) : Math.max(physical.width, physical.height)));
        const height = Math.max(1, Math.round(portrait ? Math.max(physical.width, physical.height) : Math.min(physical.width, physical.height)));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        this._drawCustomImageFitted(context, image, width, height);
        const pixels = context.getImageData(0, 0, width, height);
        this._ditherImportedTemplateImageData(pixels, width, height, this._displayPaletteKey(device));
        context.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
      image.src = source;
    });
  },

  _drawCustomImageFitted(context, image, width, height, fitMode = this._customImageFitMode) {
    const mode = ["cover", "contain", "stretch"].includes(fitMode) ? fitMode : "cover";
    if (mode === "stretch") {
      context.drawImage(image, 0, 0, width, height);
      return;
    }
    const scale = mode === "contain"
      ? Math.min(width / image.width, height / image.height)
      : Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  },

  // Rotating the device in settings changes the exact pixel canvas an image is
  // fitted to. The stored bitmaps are already dithered to the old canvas size,
  // so without this the panel just stretches or squashes those pixels into the
  // new frame instead of re-cropping the original photo for it.
  _renderCustomImageOrientedVariants(source, fitMode, device = this._device()) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const physical = this._devicePreviewSize?.(device) || { width: 296, height: 128 };
        const portrait = this._displayTemplateOrientation === "portrait";
        const width = Math.max(1, Math.round(portrait ? Math.min(physical.width, physical.height) : Math.max(physical.width, physical.height)));
        const height = Math.max(1, Math.round(portrait ? Math.max(physical.width, physical.height) : Math.min(physical.width, physical.height)));
        const renderVariant = (paletteKey) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.fillStyle = "#fff";
          context.fillRect(0, 0, width, height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          this._drawCustomImageFitted(context, image, width, height, fitMode);
          const pixels = context.getImageData(0, 0, width, height);
          this._ditherImportedTemplateImageData(pixels, width, height, paletteKey);
          context.putImageData(pixels, 0, 0);
          return canvas.toDataURL("image/png");
        };
        resolve({ bwr: renderVariant("bwr"), bwry: renderVariant("bwry") });
      };
      image.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
      image.src = source;
    });
  },

  // ----------------------------------------------- per-slot custom image dither ---

  // The size custom_image_data/variants were dithered at - the same computation
  // _renderCustomImageTemplateForDevice and _renderCustomImageOrientedVariants
  // use to pick a canvas. A slot this size is already showing the correct
  // bitmap; only a smaller slot (one of several templates sharing a large
  // display) needs its own re-dithered copy.
  _customImageFullDeviceSize(device = this._device()) {
    const physical = this._devicePreviewSize?.(device) || { width: 296, height: 128 };
    const portrait = this._displayTemplateOrientation === "portrait";
    return {
      width: Math.max(1, Math.round(portrait ? Math.min(physical.width, physical.height) : Math.max(physical.width, physical.height))),
      height: Math.max(1, Math.round(portrait ? Math.max(physical.width, physical.height) : Math.min(physical.width, physical.height))),
    };
  },

  // null means "row.customImage.src (customImage()'s own result) is already
  // the correct bitmap for this size, nothing to redo" - the common
  // single-template case with a real uploaded photo stays exactly as fast as
  // it was before per-slot dithering existed. A template that was never
  // customized has no such bitmap at any size - customImage() can only offer
  // the raw, undithered parrot-source.png as an immediate placeholder (see its
  // own comment) - so that case always needs a real dither pass, even at the
  // full device size.
  _customImageSlotDitherSpec(width, height, device = this._device()) {
    const active = this._activeCustomImageAsset?.();
    const customSource = active?.source || this._customImageSourceUrl || "";
    const hasCustomSource = !!customSource;
    const source = customSource || this._frontendAssetUrl("images/parrot-source.png");
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (hasCustomSource) {
      const full = this._customImageFullDeviceSize(device);
      if (w === full.width && h === full.height) return null;
    }
    const paletteKey = this._displayPaletteKey(device);
    const fitMode = ["cover", "contain", "stretch"].includes(this._customImageFitMode) ? this._customImageFitMode : "cover";
    return { source, paletteKey, fitMode, w, h, cacheKey: `${paletteKey}:${fitMode}:${w}x${h}:${hasCustomSource ? "u" : "d"}:${source.length}:${source.slice(-40)}` };
  },

  _customImageSlotDitherEntry(width, height, device = this._device()) {
    const spec = this._customImageSlotDitherSpec(width, height, device);
    if (!spec) return "";
    return this._customImageSlotDitherCache?.get(spec.cacheKey) || "";
  },

  _renderCustomImageBitmapAtSize(source, fitMode, width, height, paletteKey) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        this._drawCustomImageFitted(context, image, width, height, fitMode);
        const pixels = context.getImageData(0, 0, width, height);
        this._ditherImportedTemplateImageData(pixels, width, height, paletteKey);
        context.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
      image.src = source;
    });
  },

  _rememberCustomImageSlotDither(cacheKey, dataUrl) {
    this._customImageSlotDitherCache ||= new Map();
    this._customImageSlotDitherCache.set(cacheKey, dataUrl);
    // A large display's own layouts top out at six slots; a handful of past
    // sizes (rotations, layout switches) is plenty of history to keep around.
    if (this._customImageSlotDitherCache.size > 16) {
      this._customImageSlotDitherCache.delete(this._customImageSlotDitherCache.keys().next().value);
    }
  },

  // Non-blocking: the live designer/catalog preview must never stall layout on
  // a redither, so it draws the full-display bitmap once more (already correct
  // for most templates, just soft for this one slot) and repaints once the
  // slot-sized version is ready - the same trade _requestTemplateRadarImage
  // makes for the meteoradar's live fetch.
  _requestCustomImageSlotDither(width, height, device = this._device()) {
    const spec = this._customImageSlotDitherSpec(width, height, device);
    if (!spec) return;
    this._customImageSlotDitherCache ||= new Map();
    if (this._customImageSlotDitherCache.has(spec.cacheKey)) return;
    this._customImageSlotDitherPending ||= new Set();
    if (this._customImageSlotDitherPending.has(spec.cacheKey)) return;
    this._customImageSlotDitherPending.add(spec.cacheKey);
    this._renderCustomImageBitmapAtSize(spec.source, spec.fitMode, spec.w, spec.h, spec.paletteKey)
      .then((dataUrl) => {
        this._rememberCustomImageSlotDither(spec.cacheKey, dataUrl);
        this._scheduleTemplateIconRepaint?.();
      })
      .catch(() => {})
      .finally(() => this._customImageSlotDitherPending.delete(spec.cacheKey));
  },

  // Blocking counterpart for a manual send: it must never go out with a slot
  // image still scaled down from the full-display bitmap, so it waits for the
  // redither instead of drawing whatever _requestCustomImageSlotDither last
  // cached - the same distinction _preloadTemplateRadarImage draws against
  // _requestTemplateRadarImage for the meteoradar frame.
  async _preloadCustomImageForSlot(rows, width, height, device = this._device()) {
    if (!rows.some((row) => row.customImage)) return;
    const spec = this._customImageSlotDitherSpec(width, height, device);
    if (!spec) return;
    if (this._customImageSlotDitherCache?.has(spec.cacheKey)) return;
    const dataUrl = await this._renderCustomImageBitmapAtSize(spec.source, spec.fitMode, spec.w, spec.h, spec.paletteKey);
    this._rememberCustomImageSlotDither(spec.cacheKey, dataUrl);
  },

  async _resyncCustomImagesForOrientation(device = this._device()) {
    const assets = this._templateImageLibrary || [];
    if (!assets.length) return;
    await Promise.all(assets.map(async (asset) => {
      if (!String(asset.source || "").startsWith("data:image/")) return;
      try {
        asset.variants = await this._renderCustomImageOrientedVariants(asset.source, asset.fit_mode || "cover", device);
        asset.src = this._paletteImageSrc({ source: asset.source, variants: asset.variants });
      } catch (error) {
        console.warn("DRATEK eInk image orientation refresh failed:", error);
      }
    }));
    const active = this._activeCustomImageAsset?.();
    if (active?.variants) {
      this._customImageVariants = { bwr: active.variants.bwr, bwry: active.variants.bwry };
      this._customImageDataUrl = this._paletteImageSrc(active, device);
    }
    this._displayTemplateConfig ||= {};
    this._displayTemplateConfig.custom_image_data = this._customImageDataUrl;
    this._displayTemplateConfig.custom_image_variants = structuredClone(this._customImageVariants || {});
    const address = String(this._selectedDeviceAddress || "").toUpperCase();
    if (address) {
      this._deviceDrafts ||= {};
      const draft = this._deviceDrafts[address] || {};
      draft.template_config ||= {};
      draft.template_config.custom_image_data = this._customImageDataUrl;
      draft.template_config.custom_image_variants = structuredClone(this._customImageVariants || {});
      draft.template_config.image_library = structuredClone(this._templateImageLibrary || []);
      this._deviceDrafts[address] = draft;
    }
    this._scheduleDraftSave();
    this._render();
    this._paint();
  },

  _storeCustomImageTemplateData(source, variants, name, aspect = 1) {
    const asset = this._rememberTemplateImageAsset(source, variants, name, aspect);
    this._customImageActiveId = asset.id;
    this._customImageCycleIds ||= [];
    if (!this._customImageCycleIds.includes(asset.id)) this._customImageCycleIds.push(asset.id);
    this._customImageSourceUrl = source;
    this._customImageVariants = { bwr: variants.bwr, bwry: variants.bwry };
    this._customImageRendererVersion = this._importedImageRendererVersion();
    this._customImageDataUrl = this._paletteImageSrc({ source, variants: this._customImageVariants });
    this._customImageName = String(name || "Vlastní obrázek");
    this._displayTemplateConfig ||= {};
    this._displayTemplateConfig.custom_image_data = this._customImageDataUrl;
    this._displayTemplateConfig.custom_image_source = this._customImageSourceUrl;
    this._displayTemplateConfig.custom_image_variants = structuredClone(this._customImageVariants);
    this._displayTemplateConfig.custom_image_renderer_version = this._customImageRendererVersion;
    this._displayTemplateConfig.custom_image_name = this._customImageName;
    const address = String(this._selectedDeviceAddress || "").toUpperCase();
    if (address) {
      this._deviceDrafts ||= {};
      const draft = this._deviceDrafts[address] || {};
      draft.template_config ||= {};
      draft.template_config.custom_image_data = this._customImageDataUrl;
      draft.template_config.custom_image_source = this._customImageSourceUrl;
      draft.template_config.custom_image_variants = structuredClone(this._customImageVariants);
      draft.template_config.custom_image_renderer_version = this._customImageRendererVersion;
      draft.template_config.custom_image_name = this._customImageName;
      this._deviceDrafts[address] = draft;
    }
    this._scheduleDraftSave();
    this._render();
    this._paint();
    return this._customImageDataUrl;
  },

  _convertCustomImageTemplateSource(source, name = "Vlastní obrázek") {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const device = this._device?.();
        const physical = this._devicePreviewSize?.(device) || { width: 296, height: 128 };
        const portrait = this._displayTemplateOrientation === "portrait";
        const width = Math.max(1, Math.round(portrait ? Math.min(physical.width, physical.height) : Math.max(physical.width, physical.height)));
        const height = Math.max(1, Math.round(portrait ? Math.max(physical.width, physical.height) : Math.min(physical.width, physical.height)));
        const renderVariant = (paletteKey) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.fillStyle = "#fff";
          context.fillRect(0, 0, width, height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          this._drawCustomImageFitted(context, image, width, height);
          const pixels = context.getImageData(0, 0, width, height);
          this._ditherImportedTemplateImageData(pixels, width, height, paletteKey);
          context.putImageData(pixels, 0, 0);
          return canvas.toDataURL("image/png");
        };
        // Generate each hardware palette directly from the decoded original.
        // Never quantize an already quantized variant into the other palette.
        const variants = { bwr: renderVariant("bwr"), bwry: renderVariant("bwry") };
        const storedSource = this._downscaleImageSourceForStorage(image, source);
        resolve(this._storeCustomImageTemplateData(storedSource, variants, name, image.width / Math.max(1, image.height)));
      };
      image.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
      image.src = source;
    });
  },

  // A phone photo saved as-is (several MB, more as base64) blows well past
  // the websocket connection's message-size limit once it rides along in
  // the device draft on every save, closing the connection ("Connection
  // lost") before the gallery can be written. The palette variants are
  // already downsized to the display's own resolution; only the kept
  // "original" (used later to re-derive variants after a fit/orientation
  // change) needs shrinking here.
  _downscaleImageSourceForStorage(image, originalSource) {
    const MAX_DIMENSION = 1600;
    const longest = Math.max(Number(image.width) || 0, Number(image.height) || 0);
    if (!longest || longest <= MAX_DIMENSION) return originalSource;
    const scale = MAX_DIMENSION / longest;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.85);
  },

  async _useBundledCustomImageTemplate(force = false) {
    if (this._customImageDataUrl && !force) return this._customImageDataUrl;
    if (this._bundledCustomImagePromise && !force) return this._bundledCustomImagePromise;
    const pending = this._convertCustomImageTemplateSource(
      this._frontendAssetUrl("images/parrot-source.png"),
      "Ukázkový papoušek",
    );
    this._bundledCustomImagePromise = pending;
    try {
      return await pending;
    } finally {
      if (this._bundledCustomImagePromise === pending) this._bundledCustomImagePromise = null;
    }
  },

  _importCustomImageTemplate(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this._convertCustomImageTemplateSource(reader.result, file.name || "Vlastní obrázek")
      .catch((error) => {
        this._templateSendResult = { ok: false, message: this._message(error) };
        this._render();
      });
    reader.readAsDataURL(file);
  },

  _templateEditorSurfaceRatio() {
    const surface = this.shadowRoot?.querySelector(".display-template-editor-stage .display-template-surface");
    const bounds = surface?.getBoundingClientRect?.();
    if (bounds?.width > 0 && bounds?.height > 0) return bounds.width / bounds.height;
    const size = this._devicePreviewSize?.(this._device?.()) || { width: 296, height: 128 };
    const long = Math.max(1, Number(size.width || 296), Number(size.height || 128));
    const short = Math.max(1, Math.min(Number(size.width || 296), Number(size.height || 128)));
    return this._displayTemplateOrientation === "portrait" ? short / long : long / short;
  },

  _fitTemplateElementVisualAspect(item, visualAspect = 1) {
    const surfaceRatio = Math.max(.05, this._templateEditorSurfaceRatio());
    const aspect = Math.max(.05, Number(visualAspect || 1));
    let width = Math.max(2, Number(item.w || 2));
    let height = Math.max(2, Number(item.h || 2));
    const currentAspect = width * surfaceRatio / height;
    if (currentAspect > aspect) width = height * aspect / surfaceRatio;
    else height = width * surfaceRatio / aspect;
    item.w = Math.round(Math.max(2, Math.min(100, width)) * 100) / 100;
    item.h = Math.round(Math.max(2, Math.min(100, height)) * 100) / 100;
    item.visualAspect = aspect;
    return item;
  },

  _rememberTemplateImageAsset(source, variants, name = "Obrázek", aspect = 1) {
    this._templateImageLibrary ||= [];
    const existing = this._templateImageLibrary.find((asset) => (asset.source || asset.src) === source);
    if (existing) {
      existing.variants = { bwr: variants.bwr, bwry: variants.bwry };
      existing.src = this._paletteImageSrc({ source, variants });
      existing.fit_mode = this._customImageFitMode || "cover";
      return existing;
    }
    const asset = {
      id: `template-library-image-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      name: String(name || "Obrázek"),
      source,
      variants: { bwr: variants.bwr, bwry: variants.bwry },
      src: this._paletteImageSrc({ source, variants }),
      aspect: Math.max(.05, Number(aspect || 1)),
      created_at: new Date().toISOString(),
      fit_mode: this._customImageFitMode || "cover",
    };
    this._templateImageLibrary = [asset, ...this._templateImageLibrary].slice(0, 30);
    return asset;
  },

  _insertTemplateLibraryImage(asset, position = null) {
    const src = this._paletteImageSrc(asset);
    if (!src) return null;
    this._templateEditorElements ||= [];
    this._pushTemplateHistory();
    const aspect = Math.max(.05, Number(asset.aspect || 1));
    const item = this._normalizeTemplateEditorElement({ id: `template-image-${Date.now()}-${this._templateEditorElements.length}`, type: "image", label: asset.name || "Obrázek", src, source: asset.source || asset.src, variants: structuredClone(asset.variants || {}) });
    item.w = Math.min(55, Math.max(18, aspect >= 1 ? 38 : 26));
    item.h = Math.min(55, Math.max(14, item.w / Math.max(.3, aspect)));
    this._fitTemplateElementVisualAspect(item, aspect);
    item.x = Math.max(0, Math.min(100 - item.w, Number(position?.x ?? 50) - item.w / 2));
    item.y = Math.max(0, Math.min(100 - item.h, Number(position?.y ?? 50) - item.h / 2));
    this._templateEditorElements.push(item);
    this._selectedTemplateEditorElementId = item.id;
    this._templateSaveResult = null;
    this._render();
    this._paint();
    return item;
  },

  _importTemplateEditorImage(file, position = null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 240 / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const renderVariant = (paletteKey) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height);
          this._ditherImportedTemplateImageData(pixels, width, height, paletteKey);
          context.putImageData(pixels, 0, 0);
          return canvas.toDataURL("image/png");
        };
        const variants = { bwr: renderVariant("bwr"), bwry: renderVariant("bwry") };
        const aspect = width / Math.max(1, height);
        const asset = this._rememberTemplateImageAsset(reader.result, variants, file.name || "Obrázek", aspect);
        this._templateElementPaletteCategory = "";
        this._insertTemplateLibraryImage(asset, position);
        this._saveDisplayTemplateDraft?.().catch(() => {});
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  },

  _templateElementEntityRaw(item) {
    const entityId = String(item?.entityId || "").trim();
    if (!entityId) return undefined;
    const state = this._hass?.states?.[entityId];
    if (!state) return undefined;
    const attribute = String(item.entityAttribute || "").trim();
    return attribute ? state.attributes?.[attribute] : state.state;
  },

  // Mirrors _state_value in automation.py: word translation for known
  // domains (light/lock/person/...) when reading the bare state, otherwise a
  // Czech-formatted number with the entity's own unit appended. Manual sends
  // and automatic refreshes must format an entity-bound text element the
  // same way, so this and the backend function stay in lockstep.
  _templateElementEntityText(item) {
    const entityId = String(item?.entityId || "").trim();
    if (!entityId) return undefined;
    const state = this._hass?.states?.[entityId];
    const attribute = String(item.entityAttribute || "").trim();
    const raw = attribute ? state?.attributes?.[attribute] : state?.state;
    if (raw === undefined || raw === null || ["", "unknown", "unavailable"].includes(String(raw).toLowerCase())) return undefined;
    if (!attribute) {
      const words = this._templateStateWords(entityId, state, "");
      if (words) return words;
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      const unit = String(state?.attributes?.unit_of_measurement || "").trim();
      const text = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(numeric);
      return unit ? `${text} ${unit}` : text;
    }
    return String(raw);
  },

  _templateEntityIntervalMs(interval) {
    return { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[interval] || 0;
  },

  _templateEntityIsActive(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    return !["", "0", "off", "false", "no", "closed", "unavailable", "unknown", "none", "null"].includes(normalized);
  },

  _refreshTemplateEntityElements(now = Date.now()) {
    let changed = false;
    for (const item of this._templateEditorElements || []) {
      if (!["text", "chart", "gauge", "signal", "slider"].includes(item.type) || !item.entityId) continue;
      if (item.type === "text") {
        const text = this._templateElementEntityText(item);
        if (text !== undefined && item.text !== text) { item.text = text; changed = true; }
        continue;
      }
      const raw = this._templateElementEntityRaw(item);
      if (raw === undefined || raw === null) continue;
      if (item.type === "signal") {
        const active = this._templateEntityIsActive(raw);
        if (item.resolvedActive !== active || item.value !== (active ? 100 : 0)) {
          item.resolvedActive = active; item.value = active ? 100 : 0; changed = true;
        }
        continue;
      }
      const array = Array.isArray(raw) ? raw : typeof raw === "object" && raw ? Object.values(raw) : null;
      if (item.type === "chart" && array) {
        const values = array.map(Number).filter(Number.isFinite).slice(-item.historyLimit);
        if (values.length && JSON.stringify(values) !== JSON.stringify(item.historyValues || [])) {
          item.historyValues = values; item.value = values.at(-1); item.historyUpdatedAt = now; changed = true;
        }
        continue;
      }
      const numeric = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(numeric)) continue;
      if (item.type !== "chart") {
        const next = Math.max(0, Math.min(100, numeric));
        if (item.value !== next) { item.value = next; changed = true; }
        continue;
      }
      item.historyValues = Array.isArray(item.historyValues) ? item.historyValues.map(Number).filter(Number.isFinite) : [];
      const resetMs = this._templateEntityIntervalMs(item.resetInterval);
      const resetAt = Number(item.historyResetAt || item.historyUpdatedAt || now);
      if (resetMs && now - resetAt >= resetMs) {
        item.historyValues = []; item.historyResetAt = now; changed = true;
      } else if (!item.historyResetAt) item.historyResetAt = now;
      const sampleMs = this._templateEntityIntervalMs(item.sampleInterval);
      const last = item.historyValues.at(-1);
      const due = !item.historyValues.length || (sampleMs ? now - Number(item.historyUpdatedAt || 0) >= sampleMs : numeric !== last);
      if (due) {
        item.historyValues = [...item.historyValues, numeric].slice(-item.historyLimit);
        item.historyUpdatedAt = now; changed = true;
      }
      if (item.value !== numeric) { item.value = numeric; changed = true; }
    }
    if (changed && this._rendered) {
      window.clearTimeout(this._templateEntityHistorySaveTimer);
      this._templateEntityHistorySaveTimer = window.setTimeout(() => this._saveDisplayTemplateDraft?.().catch(() => {}), 1200);
    }
    return changed;
  },

  _templateElementSeries(item) {
    const values = (Array.isArray(item?.historyValues) ? item.historyValues : []).map(Number).filter(Number.isFinite).slice(-Math.max(1, Math.min(20, Number(item?.historyLimit || 10))));
    return values.length ? values : [18, 34, 27, 58, 43, 76, Number(item?.value ?? 68)];
  },

  _templateChartNormalizedPoints(item) {
    const values = this._templateElementSeries(item);
    const requestedMin = Number(item?.chartMin);
    const requestedMax = Number(item?.chartMax);
    const automaticMin = Math.min(...values);
    const automaticMax = Math.max(...values);
    let min = item?.chartMin !== "" && Number.isFinite(requestedMin) ? requestedMin : automaticMin;
    let max = item?.chartMax !== "" && Number.isFinite(requestedMax) ? requestedMax : automaticMax;
    if (max <= min) { min = automaticMin; max = automaticMax; }
    const span = Math.max(1e-9, max - min);
    return values.map((value, index) => {
      const ratio = Math.max(0, Math.min(1, (value - min) / span));
      return { value, x: values.length === 1 ? 50 : 2 + (index / (values.length - 1)) * 96, y: 54 - ratio * 44 };
    });
  },

  // These four delegate straight to the same block-drawing functions every
  // built-in template uses (_blockBars/_blockSpark/_blockRing/_blockDial/
  // _blockBand/_blockMeters in panel-template-svg.mixin.js) instead of
  // maintaining a second, parallel set of chart/gauge/signal graphics - one
  // drawing routine per shape, reused by both the free-form designer and
  // every prepared template.
  _renderTemplateEditorOverlays(template = this._currentUserDisplayTemplate(), targetOrientation = this._displayTemplateOrientation, targetRatio = 0, canvasWidth = 0, canvasHeight = 0) {
    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    const canvasRotation = this._userTemplateCanvasRotationStyle(template, targetOrientation, targetRatio);
    const sourceElements = String(template?.id || "") === String(this._selectedDisplayTemplateId || "")
      ? (this._templateEditorElements || [])
      : (template?.editor_elements || this._templateEditorStates?.[template?.id]?.editor_elements || []);
    return `<div class="template-editor-overlays ${canvasRotation.turn ? "is-whole-canvas-rotated" : ""}" style="${canvasRotation.style}">${sourceElements.map((raw) => {
      const normalized = this._normalizeTemplateEditorElement(raw);
      if (String(template?.id || "") === String(this._selectedDisplayTemplateId || "")) Object.assign(raw, normalized);
      const item = this._orientedUserTemplateElement(normalized, template, targetOrientation);
      const selected = item.id === this._selectedTemplateEditorElementId;
      const style = `left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;transform:rotate(${item.rotation}deg);--element-color:${item.color};--element-fill:${item.fill};--element-stroke:${item.stroke};--element-stroke-width:${item.strokeWidth}px;--element-radius:${item.radius}px;--element-font-size:${item.fontSize}px;--element-font-weight:${item.fontWeight};--element-font-family:${item.fontFamily};--element-font-style:${item.fontStyle};--element-text-decoration:${item.textDecoration};--element-text-outline-width:${item.textOutlineWidth}px;--element-text-outline-color:${item.textOutlineColor};--element-text-border-width:${item.textBorderWidth}px;--element-text-border-color:${item.textBorderColor};--element-overlay-opacity:${item.overlayOpacity}%;${this._overlayFillScreenStyle(item.fill, item.overlayOpacity)};--element-text-align:${item.textAlign};--element-value:${Math.max(0, Math.min(100, item.value))}%`;
      let content = "";
      if (item.type === "image") content = `<img src="${this._escape(this._paletteImageSrc(item))}" alt="${this._escape(item.label)}">`;
      // Composite elements are one SVG drawn by the component renderer;
      // the same markup is rasterised for the bitmap, so preview and print
      // cannot drift apart the way they had.
      else if (this._isTemplateComponentKind(item.type)) content = this._renderTemplateComponentSvg(item, canvasWidth, canvasHeight);
      else if (item.type === "text") content = `<span>${this._escape(item.text || item.label)}</span>`;
      else if (item.type === "block") content = this._renderTemplateBlockVisual(item, canvasWidth, canvasHeight);
      return `<span class="template-overlay template-overlay-${item.type} variant-${this._escape(item.blockKind || item.variant || "default")} ${selected ? "is-selected" : ""}" data-template-overlay-id="${this._escape(item.id)}" style="${style}" role="button" tabindex="0" aria-label="${this._escape(item.label)}">${content}${selected ? `<span class="template-overlay-selection">${handles.map((name) => `<i class="template-resize-handle is-${name}" data-template-resize-handle="${name}"></i>`).join("")}</span>` : ""}</span>`;
    }).join("")}</div>`;
  },

  _bindTemplateEditorOverlays() {
    if (this._activeTab !== "display-settings" || this._displaySettingsView !== "designer") return;
    const surfaces = [...this.shadowRoot.querySelectorAll(".display-template-editor-stage .display-template-surface")];
    const pointInSurface = (event, surface) => {
      const box = surface.getBoundingClientRect();
      const targetX = ((event.clientX - box.left) / Math.max(1, box.width)) * 100;
      const targetY = ((event.clientY - box.top) / Math.max(1, box.height)) * 100;
      const surfaceOrientation = surface.classList.contains("format-wide") ? "landscape" : "portrait";
      const turn = this._userTemplateQuarterTurn(this._currentUserDisplayTemplate(), surfaceOrientation);
      if (turn === 1) return { x: targetY, y: 100 - targetX, box };
      if (turn === -1) return { x: 100 - targetY, y: targetX, box };
      return { x: targetX, y: targetY, box };
    };
    this.shadowRoot.querySelectorAll("[data-template-editor-tool]").forEach((button) => {
      button.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "copy";
        let preset = {};
        try { preset = JSON.parse(button.dataset.templateEditorPreset || "{}"); } catch (_err) { /* Invalid third-party preset. */ }
        event.dataTransfer.setData("application/x-dratek-template-element", JSON.stringify({ type: button.dataset.templateEditorTool, icon: button.dataset.templateEditorIcon || "", preset }));
      });
    });
    surfaces.forEach((surface) => {
      surface.addEventListener("dragover", (event) => {
        if ([...(event.dataTransfer?.types || [])].some((type) => type === "Files" || type === "application/x-dratek-template-element")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          surface.classList.add("is-element-drag-over");
        }
      });
      surface.addEventListener("dragleave", () => surface.classList.remove("is-element-drag-over"));
      surface.addEventListener("drop", (event) => {
        event.preventDefault();
        surface.classList.remove("is-element-drag-over");
        const position = pointInSurface(event, surface);
        const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith("image/"));
        if (file) return this._importTemplateEditorImage(file, position);
        try {
          const payload = JSON.parse(event.dataTransfer.getData("application/x-dratek-template-element") || "{}");
          if (payload.type) this._addTemplateEditorElement(payload.type, payload.icon || "", position, payload.preset || {});
        } catch (_err) { /* Ignore foreign drag data. */ }
      });
      surface.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".template-overlay") || event.target.closest(".template-editable-part")) return;
        if (this._selectedTemplateEditorElementId) {
          this._selectedTemplateEditorElementId = "";
          this._render();
          this._paint();
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-template-overlay-id]").forEach((element) => {
      element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const id = element.dataset.templateOverlayId;
        const item = (this._templateEditorElements || []).find((entry) => entry.id === id);
        const surface = element.closest(".display-template-surface");
        if (!item || !surface) return;
        const handle = event.target.closest("[data-template-resize-handle]")?.dataset.templateResizeHandle || "";
        this._selectedTemplateEditorElementId = id;
        this._selectedTemplatePart = "";
        const position = pointInSurface(event, surface);
        const viewItem = this._normalizeTemplateEditorElement(item);
        this._templateOverlayDrag = { id, pointerId: event.pointerId, mode: handle ? "resize" : "move", handle, startX: position.x, startY: position.y, origin: { x: viewItem.x, y: viewItem.y, w: viewItem.w, h: viewItem.h }, historyPushed: false };
        element.setPointerCapture?.(event.pointerId);
        if (!element.classList.contains("is-selected")) {
          element.classList.add("is-selected");
          this.shadowRoot.querySelectorAll("[data-template-overlay-id].is-selected").forEach((other) => { if (other !== element) other.classList.remove("is-selected"); });
        }
      });
      element.addEventListener("pointermove", (event) => {
        const drag = this._templateOverlayDrag;
        if (!drag || drag.id !== element.dataset.templateOverlayId || drag.pointerId !== event.pointerId) return;
        const item = (this._templateEditorElements || []).find((entry) => entry.id === drag.id);
        const surface = element.closest(".display-template-surface");
        if (!item || !surface) return;
        if (!drag.historyPushed) {
          this._pushTemplateHistory();
          drag.historyPushed = true;
        }
        const point = pointInSurface(event, surface);
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        let viewItem;
        if (drag.mode === "move") {
          const x = Math.max(0, Math.min(100 - drag.origin.w, drag.origin.x + dx));
          const y = Math.max(0, Math.min(100 - drag.origin.h, drag.origin.y + dy));
          viewItem = { ...this._normalizeTemplateEditorElement(item), x, y, w: drag.origin.w, h: drag.origin.h };
        } else {
          let { x, y, w, h } = drag.origin;
          if (drag.handle.includes("w")) { x += dx; w -= dx; }
          if (drag.handle.includes("e")) w += dx;
          if (drag.handle.includes("n")) { y += dy; h -= dy; }
          if (drag.handle.includes("s")) h += dy;
          if (w < 2) { if (drag.handle.includes("w")) x -= 2 - w; w = 2; }
          if (h < 2) { if (drag.handle.includes("n")) y -= 2 - h; h = 2; }
          x = Math.max(0, Math.min(98, x)); y = Math.max(0, Math.min(98, y));
          w = Math.max(2, Math.min(100 - x, w)); h = Math.max(2, Math.min(100 - y, h));
          viewItem = { ...this._normalizeTemplateEditorElement(item), x, y, w, h };
        }
        Object.assign(item, { x: viewItem.x, y: viewItem.y, w: viewItem.w, h: viewItem.h });
        element.style.left = `${viewItem.x}%`; element.style.top = `${viewItem.y}%`; element.style.width = `${viewItem.w}%`; element.style.height = `${viewItem.h}%`;
      });
      const finish = (event) => {
        const drag = this._templateOverlayDrag;
        if (!drag || drag.id !== element.dataset.templateOverlayId || drag.pointerId !== event.pointerId) return;
        this._templateOverlayDrag = null;
        element.releasePointerCapture?.(event.pointerId);
        this._templateSaveResult = null;
        this._render(); this._paint();
      };
      element.addEventListener("pointerup", finish);
      element.addEventListener("pointercancel", finish);
      element.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault(); this._selectedTemplateEditorElementId = element.dataset.templateOverlayId; this._render(); this._paint();
      });
    });
  },

  // --------------------------------------------------- template switches ---

  // Some templates carry a state that is a decision rather than a reading: a price
  // tag is on promotion because someone says so, not because a sensor changed. Such
  // a switch can still be driven by an entity - a helper toggle, a binary sensor
  // from the till system - so the manual switch and the bound entity are ORed: the
  // shop can flip it by hand today and automate it tomorrow without rebuilding.
  // Whether one template switch is on, for one display.
  //
  // This is the single reader. It used to be two: the renderer asked here and
  // the AKCE badge on a device card asked _devicePriceSaleActive, and the two
  // walked different stores in different orders - so they disagreed in both
  // directions at once. Turning the switch off in the designer left the drawn
  // tag on promotion (a stale flat `options.sale` in the draft outranked the
  // live editor state here), while a sale set from a card and then autosaved -
  // which drops that flat key, since _projectPayload never writes one - left
  // the badge lit over a tag drawn without it, because this function never
  // looked at template_config.options at all.
  //
  // Order, newest and most specific first:
  //   1. the live editor state, but only for the display the editor has open;
  //   2. that display's stored draft, in the shape a draft is reloaded from;
  //   3. the same draft's flat legacy key, written by panels before 0.1.356;
  //   4. an entity bound to the switch.
  _templateOptionState(template, option, address = "") {
    const device = (typeof this._device === "function" ? this._device() : null);
    const upperAddr = String(address || device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const key = `${template?.id ?? ""}:${option}`;
    const isSelected = !!upperAddr && upperAddr === String(this._selectedDeviceAddress || "").toUpperCase();
    if (isSelected && this._displayTemplateOptions?.[key] !== undefined) {
      return !!this._displayTemplateOptions[key];
    }
    const draft = this._deviceDrafts?.[upperAddr] || {};
    const stored = draft.template_config?.options?.[key];
    if (stored !== undefined) return !!stored;
    const legacy = draft.options?.[option];
    if (typeof legacy === "boolean") return legacy;
    const entity = this._templateEntityForKind(template, [option]);
    const state = entity ? this._hass?.states?.[entity] : null;
    return ["on", "true", "1", "akce", "sale"].includes(String(state?.state ?? "").toLowerCase());
  },

  _templateOptionActive(template, option) {
    return this._templateOptionState(template, option);
  },

  _renderTemplateOptionSettings(template) {
    const options = template?.options || [];
    if (!options.length) return "";
    return `<div class="template-option-settings">${options.map(([option, label, help]) => {
      const active = !!this._displayTemplateOptions?.[`${template.id}:${option}`];
      const bound = this._templateEntityForKind(template, [option]);
      return `<label class="template-option-switch ${active ? "is-active" : ""}">
        <input type="checkbox" data-template-option="${this._escape(`${template.id}:${option}`)}" ${active ? "checked" : ""}>
        <span><strong>${this._escape(label)}</strong><small>${this._escape(help)}${bound ? ` Řídí i entita ${bound}.` : ""}</small></span>
      </label>`;
    }).join("")}</div>`;
  },

  // ------------------------------------------------------- live template data ---

  // Home Assistant stopped publishing forecasts as a weather attribute in 2024.4;
  // they come from the weather.get_forecasts service now, which is why the forecast
  // row of the weather template had been showing sample data on every install since.
  // Rendering is synchronous, so the fetch fills a cache and asks for a repaint when
  // it lands - the same shape the icon warm-up uses.
  _templateForecast(entityId) {
    if (!entityId || !this._hass?.callService) return null;
    this._templateForecastCache ||= new Map();
    if (this._templateForecastCache.has(entityId)) return this._templateForecastCache.get(entityId);
    this._templateForecastCache.set(entityId, null);
    if (this._templateForecastCache.size > 64) {
      this._templateForecastCache.delete(this._templateForecastCache.keys().next().value);
    }
    Promise.resolve()
      .then(() => this._hass.callService("weather", "get_forecasts", { type: "daily" }, { entity_id: entityId }, false, true))
      .then((result) => {
        const forecast = result?.response?.[entityId]?.forecast;
        if (Array.isArray(forecast) && forecast.length) {
          this._templateForecastCache.set(entityId, forecast);
          this._scheduleTemplateDataRepaint();
        }
      })
      .catch(() => {
        // An installation too old for response data, or a weather integration
        // without a daily forecast. The sample row stays, which is honest.
      });
    return null;
  },

  _templateCalendarEvents(entityId) {
    if (!entityId || !this._hass?.callService) return null;
    this._templateCalendarCache ||= new Map();
    if (this._templateCalendarCache.has(entityId)) return this._templateCalendarCache.get(entityId);
    this._templateCalendarCache.set(entityId, null);
    if (this._templateCalendarCache.size > 64) {
      this._templateCalendarCache.delete(this._templateCalendarCache.keys().next().value);
    }
    Promise.resolve()
      // A duration avoids formatting a local timestamp by hand, which is the part
      // of calendar.get_events that goes wrong across time zones.
      .then(() => this._hass.callService("calendar", "get_events", { duration: { days: 21 } }, { entity_id: entityId }, false, true))
      .then((result) => {
        const events = result?.response?.[entityId]?.events;
        if (Array.isArray(events)) {
          this._templateCalendarCache.set(entityId, events);
          this._scheduleTemplateDataRepaint();
        }
      })
      .catch(() => {});
    return null;
  },

  // The items of a todo.* list. Same shape of fetch as the calendar above and
  // for the same reason: a todo entity's state is the number of items left, and
  // the items themselves are not in its attributes at all - `todo.get_items` is
  // the only way to read them.
  _templateTodoItems(entityId) {
    if (!entityId || !this._hass?.callService) return null;
    this._templateTodoCache ||= new Map();
    if (this._templateTodoCache.has(entityId)) return this._templateTodoCache.get(entityId);
    this._templateTodoCache.set(entityId, null);
    if (this._templateTodoCache.size > 64) {
      this._templateTodoCache.delete(this._templateTodoCache.keys().next().value);
    }
    Promise.resolve()
      // No `status` filter: a shopping list that shows only what is left has
      // nothing to strike through, and the struck rows are what make the page
      // read as a list being worked through rather than a list being retyped.
      .then(() => this._hass.callService("todo", "get_items", {}, { entity_id: entityId }, false, true))
      .then((result) => {
        const items = result?.response?.[entityId]?.items;
        if (Array.isArray(items)) {
          this._templateTodoCache.set(entityId, items);
          this._scheduleTemplateDataRepaint();
        }
      })
      .catch(() => {
        // An installation too old for response data, or a list that has since
        // been removed. The sample list stays, which is honest.
      });
    return null;
  },

  // A recorded series for one entity, for the templates that draw a graph of
  // something Home Assistant does not keep in an attribute.
  //
  // _templateSeries covers the other case - an entity that publishes its own
  // array (spot prices, a soil-moisture list) - and needs no call at all. A
  // thermostat has neither: `climate.*` carries one number for right now, and
  // the only place its past lives is the recorder.
  _templateHistorySeries(entityId, hours = 12, points = 24) {
    if (!entityId || !this._hass?.callWS) return null;
    const key = `${entityId}:${hours}:${points}`;
    this._templateHistoryCache ||= new Map();
    if (this._templateHistoryCache.has(key)) return this._templateHistoryCache.get(key);
    this._templateHistoryCache.set(key, null);
    if (this._templateHistoryCache.size > 32) {
      this._templateHistoryCache.delete(this._templateHistoryCache.keys().next().value);
    }
    const climate = entityId.startsWith("climate.");
    Promise.resolve()
      .then(() => this._hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(Date.now() - hours * 3600 * 1000).toISOString(),
        entity_ids: [entityId],
        // A climate entity keeps the room temperature in an attribute, so the
        // minimal response - which is state strings only - would come back as
        // a list of "heat" with no number in it anywhere.
        minimal_response: !climate,
        no_attributes: !climate,
        significant_changes_only: false,
      }))
      .then((response) => {
        const rows = response?.[entityId];
        if (!Array.isArray(rows)) return;
        const numbers = rows
          .map((entry) => Number(climate ? (entry?.a?.current_temperature ?? entry?.attributes?.current_temperature) : (entry?.s ?? entry?.state)))
          .filter(Number.isFinite);
        if (numbers.length < 2) return;
        this._templateHistoryCache.set(key, this._resampleSeries(numbers, points));
        this._scheduleTemplateDataRepaint();
      })
      .catch(() => {
        // No recorder, an entity excluded from it, or an installation too old
        // for this message. The sample curve stays, which is honest.
      });
    return null;
  },

  // Evenly spaced buckets rather than the raw recorder rows: a thermostat can
  // report twice a minute or twice an hour, and a graph drawn straight from
  // those rows would show the sampling rate rather than the temperature. Each
  // bucket is its own mean, so a dense stretch cannot outvote a sparse one.
  _resampleSeries(numbers, points) {
    if (numbers.length <= points) return numbers;
    const out = [];
    for (let index = 0; index < points; index += 1) {
      const from = Math.floor((index * numbers.length) / points);
      const to = Math.max(from + 1, Math.floor(((index + 1) * numbers.length) / points));
      const slice = numbers.slice(from, to);
      out.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
    }
    return out;
  },

  // Both fetches land independently; coalescing the repaint keeps a template with a
  // forecast and a calendar from redrawing the whole panel twice.
  _scheduleTemplateDataRepaint() {
    if (this._templateDataRepaintPending) return;
    this._templateDataRepaintPending = true;
    setTimeout(() => {
      this._templateDataRepaintPending = false;
      this._render();
      this._paint();
    }, 0);
  },

  // The entity bound to the first slot of a template that asks for one of `kinds`.
  _templateEntityForKind(template, kinds) {
    const variables = template?.variables || [];
    for (let index = 0; index < variables.length; index++) {
      const meta = this._templateVariableMeta(variables[index], index);
      if (!kinds.includes(this._templateSlotKind(meta.label, meta.icon))) continue;
      const binding = this._templateBinding(template, meta);
      if (binding && !binding.startsWith("internal:") && !binding.startsWith("literal:")) return binding;
    }
    return "";
  },

  _weatherConditionIcon(condition) {
    return {
      "clear-night": "weather-night",
      cloudy: "weather-cloudy",
      exceptional: "alert-circle-outline",
      fog: "weather-fog",
      hail: "weather-hail",
      lightning: "weather-lightning",
      "lightning-rainy": "weather-lightning-rainy",
      partlycloudy: "weather-partly-cloudy",
      pouring: "weather-pouring",
      rainy: "weather-rainy",
      snowy: "weather-snowy",
      "snowy-rainy": "weather-snowy-rainy",
      sunny: "weather-sunny",
      windy: "weather-windy",
      "windy-variant": "weather-windy",
    }[String(condition || "")] || "";
  },

  _weatherConditionLabel(condition) {
    return {
      "clear-night": "Jasná noc",
      cloudy: "Zataženo",
      exceptional: "Výjimečné",
      fog: "Mlha",
      hail: "Krupobití",
      lightning: "Bouřky",
      "lightning-rainy": "Bouřky s deštěm",
      partlycloudy: "Polojasno",
      pouring: "Vydatný déšť",
      rainy: "Déšť",
      snowy: "Sněžení",
      "snowy-rainy": "Déšť se sněhem",
      sunny: "Jasno",
      windy: "Větrno",
      "windy-variant": "Větrno",
    }[String(condition || "")] || "";
  },

  // One column of the forecast strip. Falls back to the sample day so the template
  // still reads as a weather template before the service call returns.
  _templateForecastDay(template, index) {
    // Seven entries, not four: weather.js can now ask for up to a full
    // week's worth of cells on a wide panel, and a sample day() should look
    // like real data at every length it might be called with, not fall back
    // to blank cards past the fourth one.
    const sample = [
      { label: "PÁ", icon: "weather-partly-cloudy", value: "22°C" },
      { label: "SO", icon: "weather-sunny", value: "25°C" },
      { label: "NE", icon: "weather-rainy", value: "18°C" },
      { label: "PO", icon: "weather-cloudy", value: "20°C" },
      { label: "ÚT", icon: "weather-lightning-rainy", value: "17°C" },
      { label: "ST", icon: "weather-snowy", value: "12°C" },
      { label: "ČT", icon: "weather-windy", value: "19°C" },
    ][index] || { label: "", icon: "", value: "" };
    const forecast = this._templateForecast(this._templateEntityForKind(template, ["forecast", "weather"]));
    const entry = Array.isArray(forecast) ? forecast[index] : null;
    if (!entry) return sample;
    const date = new Date(entry.datetime);
    const temperature = Number(entry.temperature);
    return {
      label: Number.isNaN(date.getTime())
        ? sample.label
        : new Intl.DateTimeFormat("cs-CZ", { weekday: "short" }).format(date).replace(/\./g, "").toLocaleUpperCase("cs"),
      icon: this._weatherConditionIcon(entry.condition) || sample.icon,
      // Unit on every cell, matching render.py's _temperature and
      // automation.py - an automatic refresh redraws this exact strip.
      value: Number.isFinite(temperature) ? `${Math.round(temperature)}°C` : sample.value,
    };
  },

  // The glyph for weather.js's top icon row: the same weather.* entity as
  // "Stav počasí" (v(1)), read as an icon name instead of its translated
  // Czech word. That row used to hardcode "weather-partly-cloudy" and so
  // never reflected the bound entity's real condition, no matter what was
  // bound or how the forecast changed.
  _templateCurrentConditionIcon(template, fallback) {
    const binding = this._templateEntityForKind(template, ["weather"]);
    const state = binding ? this._hass?.states?.[binding] : null;
    return this._weatherConditionIcon(state?.state) || fallback;
  },

  // One entry of the calendar template: a boxed date beside what is happening.
  _templateCalendarEntry(template, index) {
    const samples = [
      { day: "23", month: "KVĚ", title: "Schůzka", detail: "15:00 · kancelář" },
      { day: "24", month: "KVĚ", title: "Narozeniny", detail: "Tomáš · celý den" },
    ];
    const sample = samples[index] || samples[0];
    const events = this._templateCalendarEvents(this._templateEntityForKind(template, ["calendar"]));
    const event = Array.isArray(events) ? events[index] : null;
    if (!event) return sample;
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) return { ...sample, title: event.summary || sample.title };
    const allDay = !String(event.start).includes("T");
    const time = new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(start);
    return {
      day: String(start.getDate()),
      month: new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(start).replace(/\./g, "").slice(0, 3).toLocaleUpperCase("cs"),
      title: event.summary || sample.title,
      detail: [allDay ? "celý den" : time, event.location].filter(Boolean).join(" · "),
    };
  },

  // thermostat.js's whole page: where the room is inside the range the
  // thermostat itself works over, and how it got there.
  //
  // The dial used to be `percent: 0.5` with the scale ends written out as
  // "15°"/"28°" - a drawing of a gauge rather than a reading of one. Every
  // number here comes off the bound entity, and the span is the thermostat's
  // own min_temp/max_temp so the needle and the numbers under it agree.
  _templateThermostat(template) {
    const binding = this._templateEntityForKind(template, ["temperature"]);
    const state = binding ? this._hass?.states?.[binding] : null;
    const climate = String(binding || "").startsWith("climate.");
    const attributes = state?.attributes || {};
    const number = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const current = climate ? number(attributes.current_temperature) : number(state?.state);
    const target = climate ? number(attributes.temperature) : null;
    // A thermostat publishes the range it can actually be set to. A plain
    // temperature sensor does not, and a domestic comfort span reads far
    // better on a half-dial than a 0-100 one would.
    const min = number(attributes.min_temp) ?? 10;
    const max = number(attributes.max_temp) ?? 30;
    const span = max - min;
    const percent = current == null || span <= 0
      ? 0
      : Math.max(0, Math.min(1, (current - min) / span));
    const degrees = (value) => (value == null ? "" : `${Math.round(value)}°`);
    return {
      current,
      target,
      min,
      max,
      percent,
      minLabel: degrees(min),
      maxLabel: degrees(max),
      // Sampled from the same entity the dial reads, so the curve and the
      // needle can never be about two different rooms.
      history: this._templateHistorySeries(binding, 12, 24),
      entityId: binding || "",
    };
  },

  // shopping.js's whole page: the bound list's real items with the unchecked
  // ones first, plus the counts the band and the footer print.
  //
  // Unchecked first is not a preference, it is what the page is for - the items
  // still to be picked up are the reason the display is on the fridge, and a
  // panel with room for six rows of a twenty-item list must not spend them on
  // the fourteen already in the basket.
  _templateShoppingList(template) {
    const sample = [
      { label: "Mléko", done: true },
      { label: "Chléb", done: true },
      { label: "Jablka", done: false },
      { label: "Káva", done: false },
      { label: "Prací gel", done: false },
      { label: "Vejce", done: false },
    ];
    const entityId = this._templateEntityForKind(template, ["todo_list"]);
    const raw = this._templateTodoItems(entityId);
    const state = entityId ? this._hass?.states?.[entityId] : null;
    const name = String(state?.attributes?.friendly_name || "").trim() || "Nákupní seznam";
    const items = Array.isArray(raw)
      ? raw
        .map((item) => ({
          label: String(item?.summary || "").trim(),
          done: String(item?.status || "").toLowerCase() === "completed",
        }))
        .filter((item) => item.label)
      : sample;
    const pending = items.filter((item) => !item.done);
    const done = items.filter((item) => item.done);
    return {
      name,
      // An empty real list is a real answer - everything is ticked off - so it
      // must not fall back to the sample the way a list still loading does.
      items: [...pending, ...done],
      remaining: pending.length,
      total: items.length,
    };
  },

  // States that are words rather than numbers. Left raw they reach the panel in
  // English - a presence template that prints "not_home" is not a finished feature.
  _templateStateWords(entityId, state, kind) {
    const domain = String(entityId || "").split(".")[0];
    const value = String(state?.state ?? "").toLowerCase();
    const deviceClass = String(state?.attributes?.device_class || "");
    if (domain === "weather") return this._weatherConditionLabel(value);
    if (domain === "person" || domain === "device_tracker") {
      // A person's own name is never their entity's *state* (that's always
      // home/not_home/a zone) - a name-seeking slot has to read friendly_name.
      if (kind === "person_name") return String(state?.attributes?.friendly_name || "");
      if (value === "home") return "Doma";
      if (value === "not_home") return "Pryč";
      return state?.state ? String(state.state) : "";
    }
    if (domain === "lock") return value === "locked" ? "Zamčeno" : value === "unlocked" ? "Odemčeno" : "";
    if (domain === "light" || domain === "switch") return value === "on" ? "Zapnuto" : value === "off" ? "Vypnuto" : "";
    if (domain === "alarm_control_panel") {
      return { disarmed: "Vypnuto", armed_home: "Doma", armed_away: "Mimo dům", armed_night: "Noc", arming: "Aktivuji", pending: "Čekám", triggered: "POPLACH" }[value] || "";
    }
    if (domain === "binary_sensor") {
      const on = value === "on";
      if (["door", "garage_door", "opening"].includes(deviceClass) || kind === "door") return on ? "Otevřeno" : "Zavřeno";
      if (["window"].includes(deviceClass) || kind === "window") return on ? "Otevřeno" : "Zavřeno";
      if (["motion", "occupancy", "presence"].includes(deviceClass) || kind === "motion") return on ? "Pohyb" : "Klid";
      if (["moisture"].includes(deviceClass)) return on ? "Vlhko" : "Sucho";
      return on ? "Ano" : "Ne";
    }
    return "";
  },

  _templateDisplayValue(template, variableIndex, fallback = "") {
    const variable = template?.variables?.[variableIndex];
    if (!variable) return fallback;
    const meta = this._templateVariableMeta(variable, variableIndex);
    const binding = this._templateBinding(template, meta);
    if (!binding) return fallback;
    if (binding.startsWith("literal:")) return binding.slice("literal:".length);
    if (!binding.includes(".") && !binding.startsWith("internal:")) {
      return binding;
    }
    const normalized = String(meta.label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (binding?.startsWith("internal:")) {
      const now = new Date();
      if (normalized.includes("datum")) {
        return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long" }).format(now);
      }
      if (normalized.includes("cas") || normalized.includes("aktualizace")) {
        return new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(now);
      }
      if (normalized.includes("interval")) {
        const next = new Date(now.getTime() + 60 * 60 * 1000);
        const format = (date) => new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(date);
        return `${format(now)}–${format(next)}`;
      }
      if (normalized.includes("svatek")) {
        return CZECH_NAME_DAYS[now.getMonth()][now.getDate() - 1] || fallback;
      }
      return fallback;
    }
    const state = binding ? this._hass?.states?.[binding] : null;
    const kind = this._templateSlotKind(meta.label, meta.icon);
    const weatherState = String(binding || "").startsWith("weather.");
    const weatherAttributes = state?.attributes || {};
    const climateState = String(binding || "").startsWith("climate.");
    let raw = state?.state;
    let forcedUnit = "";
    if (template?.id === "cz_spot_prices" && variableIndex === 5 && Number.isFinite(Number(raw))) {
      const intervals = this._czSpotIntervalCount(binding, state);
      return `${Math.round(Number(raw))} / ${intervals}`;
    }
    if (weatherState && normalized.includes("teplot")) {
      raw = weatherAttributes.temperature;
      forcedUnit = weatherAttributes.temperature_unit || "°C";
    } else if (weatherState && kind === "humidity") {
      raw = weatherAttributes.humidity;
      forcedUnit = "%";
    } else if (weatherState && kind === "wind_speed") {
      raw = weatherAttributes.wind_speed;
      forcedUnit = weatherAttributes.wind_speed_unit || "km/h";
    } else if (weatherState && kind === "pressure") {
      raw = weatherAttributes.pressure;
      forcedUnit = weatherAttributes.pressure_unit || "hPa";
    } else if (climateState && kind === "temperature") {
      // A climate.* entity's own `state` is its HVAC mode ("heat", "off", ...),
      // never a number - "Cílová teplota" needs the `temperature` attribute
      // (the setpoint), "Teplota" needs `current_temperature` (what the
      // thermostat is actually reading right now). Neither is the raw state.
      raw = normalized.includes("cil")
        ? state?.attributes?.temperature
        : state?.attributes?.current_temperature;
      forcedUnit = state?.attributes?.temperature_unit || "°C";
    } else if (climateState && normalized.includes("vykon")) {
      // hvac_action is what the thermostat is doing right now (heating/idle/
      // off/...) - a much more useful "Výkon topení" than the HVAC *mode*
      // (heat/auto/off) the bare state would otherwise return.
      const action = String(state?.attributes?.hvac_action || "").toLowerCase();
      return { heating: "Topí", idle: "Klid", off: "Vypnuto", cooling: "Chladí", drying: "Vysouší", fan: "Ventilace" }[action] || fallback;
    } else if (kind === "forecast") {
      // The service-backed forecast, not the attribute Home Assistant removed.
      const tomorrow = this._templateForecast(binding)?.[1];
      const high = Number(tomorrow?.temperature);
      const low = Number(tomorrow?.templow);
      raw = Number.isFinite(high)
        ? `${Math.round(high)}° / ${Number.isFinite(low) ? Math.round(low) : "-"}°`
        : undefined;
    } else if (kind === "calendar") {
      raw = this._templateCalendarEvents(binding)?.[0]?.summary;
    } else {
      const words = this._templateStateWords(binding, state, kind);
      if (words) return words;
    }
    if (raw === undefined || raw === null || ["", "unknown", "unavailable"].includes(String(raw).toLowerCase())) return fallback;
    const unit = String(forcedUnit || state?.attributes?.unit_of_measurement || "").trim();
    const numeric = Number(raw);
    const text = Number.isFinite(numeric)
      ? new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(numeric)
      : String(raw);
    let result = unit && !String(text).toLowerCase().endsWith(unit.toLowerCase()) ? `${text} ${unit}` : text;
    for (const u of ["°C", "%", "kW", "kWh", "hPa", "bar", "V", "A", "W", "l/min", "ppm", "°", "dBm", "EUR", "Kč"]) {
      const dupe = `${u} ${u}`;
      while (result.includes(dupe)) result = result.replaceAll(dupe, u);
    }
    return result;
  },

  _czSpotIntervalCount(binding, state) {
    if (/15min/i.test(String(binding || ""))) return 96;
    const timestamps = Object.keys(state?.attributes || {})
      .filter((key) => key.startsWith("20") || key.includes("T"))
      .map((key) => Date.parse(key))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    const gaps = timestamps.slice(1)
      .map((value, index) => (value - timestamps[index]) / 60000)
      .filter((minutes) => minutes > 0 && minutes <= 120)
      .sort((left, right) => left - right);
    const typicalGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 60;
    return typicalGap < 45 ? 96 : 24;
  },

  _templateSeries(template, variableIndex, fallback) {
    const variable = template?.variables?.[variableIndex];
    if (!variable) return fallback;
    const meta = this._templateVariableMeta(variable, variableIndex);
    const binding = this._templateBinding(template, meta);
    if (!binding || binding.startsWith("internal:")) return fallback;
    const state = this._hass?.states?.[binding];
    if (!state) return fallback;
    const isTimestampOrHourKey = (key) => key.startsWith("20") || key.includes("T") || /^\d{1,2}:\d{2}$/.test(key) || !Number.isNaN(Date.parse(key));
    const timestampPrices = Object.fromEntries(
      Object.entries(state.attributes || {}).filter(([key, value]) => isTimestampOrHourKey(key) && Number.isFinite(Number(value)))
    );
    if (template?.id === "cz_spot_prices") {
      const entries = Object.entries(timestampPrices).sort(([left], [right]) => (left > right ? 1 : left < right ? -1 : 0));
      const intervalCount = this._czSpotIntervalCount(binding, state);
      const today = new Date();
      const sameLocalDay = (value) => {
        const date = new Date(value);
        return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
      };
      const todayPrices = entries.filter(([timestamp]) => sameLocalDay(timestamp)).map(([, value]) => Number(value)).filter(Number.isFinite);
      if (todayPrices.length > 1) return todayPrices.slice(0, intervalCount);
      const allPrices = entries.map(([, value]) => Number(value)).filter(Number.isFinite);
      if (allPrices.length > 1) return allPrices.slice(0, intervalCount);
    }
    const candidates = [
      timestampPrices,
      state.attributes?.today_prices,
      state.attributes?.today,
      state.attributes?.raw_today,
      state.attributes?.current_day,
      state.attributes?.values,
      state.attributes?.prices,
      state.attributes?.data,
      state.attributes?.history,
      state.state,
    ];
    for (const candidate of candidates) {
      let value = candidate;
      if (typeof value === "string") {
        try { value = JSON.parse(value); } catch (_err) { value = value.split(/[;,\s]+/); }
      }
      if (value && !Array.isArray(value) && typeof value === "object") value = Object.values(value);
      if (!Array.isArray(value)) continue;
      const numbers = value.map((item) => Number(typeof item === "object" ? item?.value ?? item?.price ?? item?.state ?? item?.cost ?? item?.czk ?? item?.eur : item)).filter(Number.isFinite);
      if (numbers.length > 1) return numbers.slice(-96);
    }
    return fallback;
  },

  _templatePercent(template, variableIndex, fallback = 0) {
    const raw = String(this._templateDisplayValue(template, variableIndex, fallback)).replace(",", ".");
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    const numeric = match ? Number(match[0]) : Number(fallback);
    return Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : Number(fallback) || 0));
  },

  _templateVariableMeta(variable, index = 0) {
    const [icon, label] = variable;
    const normalized = String(label || "").toLocaleLowerCase("cs");
    // Word-bounded, not a bare substring test: "čas" as a plain .includes()
    // also matches inside "počasí" ("po-ČAS-í"), which silently turned
    // weather.js's "Stav počasí" into an internal/automatic slot - it could
    // never be bound to an entity at all and always showed its static
    // design-time fallback text, in a manual send as much as an automatic
    // refresh.
    const paddedLabel = ` ${normalized} `;
    const automatic = ["čas", "datum", "aktualizace", "cenový interval", "svátek"].some((part) => paddedLabel.includes(` ${part} `));
    const descriptions = {
      teplota: "Senzor teploty místnosti nebo venkovního prostoru.",
      vlhkost: "Senzor relativní vlhkosti vzduchu nebo půdy.",
      vítr: "Senzor rychlosti větru.",
      tlak: "Senzor atmosférického tlaku.",
      signál: "Síla signálu vybraného zařízení.",
      baterie: "Stav baterie zařízení v procentech.",
      cena: "Senzor aktuální ceny nebo tarifu.",
      výkon: "Senzor okamžitého výkonu.",
      spotřeba: "Senzor spotřeby za zvolené období.",
      stav: "Entita, jejíž aktuální stav chcete zobrazit.",
      program: "Entita se stavem aktuálního programu.",
      osoba: "Osoba nebo tracker přítomnosti.",
      událost: "Kalendářová entita s nejbližší událostí.",
    };
    const descriptionKey = Object.keys(descriptions).find((key) => normalized.includes(key));
    return {
      icon,
      label,
      key: `${index}-${String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      automatic,
      description: automatic
        ? "Interní údaj Home Assistantu – není potřeba vybírat vlastní entitu."
        : descriptions[descriptionKey] || `Vyberte entitu Home Assistantu, která poskytuje hodnotu „${label}“.`,
    };
  },

  // What a template slot is actually asking for, independent of how its label reads.
  // Matching on label text alone picked the wrong entity constantly - "Teplota"
  // matched anything containing "teplo", the heating switch included - because a
  // name is a description while a device_class is a declaration.
  _templateSlotKind(label, icon = "") {
    const text = `${label} ${icon}`.toLocaleLowerCase("cs");
    const has = (...needles) => needles.some((needle) => text.includes(needle));
    if (has("akce", "sleva")) return "sale";
    if (has("název zboží", "zboží")) return "product";
    if (has("původní cena")) return "monetary";
    if (has("jednotková cena")) return "monetary";
    if (has("kód")) return "barcode";
    if (has("skladem", "zásob")) return "stock";
    if (has("předpově")) return "forecast";
    if (has("počas")) return "weather";
    if (has("narozenin")) return "nameday";
    if (has("událost", "kalend")) return "calendar";
    if (has("svátek")) return "nameday";
    // A person.*/device_tracker.* entity's *state* is always "home"/"not_home" -
    // never a name - so a slot asking for a name ("Osoby", "Jméno") and one
    // asking for a status ("Přítomnost", "Stav osoby") need different kinds:
    // only the status kind should read the entity's state, the name kind has
    // to read its friendly_name instead (see _templateStateWords).
    if (has("jméno")) return "person_name";
    if (has("osob") && !has("stav")) return "person_name";
    if (has("osob", "přítom")) return "person_status";
    if (has("teplot", "termostat")) return "temperature";
    if (has("vlhkost")) return "humidity";
    if (has("tlak")) return "pressure";
    // "Úspora CO₂" (solar's cumulative kilograms saved) is a completely
    // different physical quantity from a device_class carbon_dioxide sensor
    // (a live ppm air-quality reading) despite sharing the words "CO₂" - a
    // plain sensor is the honest target, not a demand for a ppm sensor.
    if (has("úspora")) return "generic";
    if (has("co₂", "co2")) return "carbon_dioxide";
    if (has("pm2", "aqi", "kvalit")) return "air_quality";
    if (has("bateri")) return "battery";
    if (has("signál")) return "signal_strength";
    // "cena" alone misses its own adjective form: cz_spot_prices' "Cenový
    // průběh dnes" (the chart series feed) contains "cenov", never the bare
    // noun stem "cena" - so it fell all the way through to generic and lost
    // the monetary device_class/unit hint that actually finds the right
    // sensor automatically.
    if (has("cena", "cenov", "tarif", "minimum")) return "monetary";
    if (has("výkon")) return "power";
    // "výrob" alone (solar's "Výroba …"), not "spotřeb" - that word is shared
    // with the water template's "Spotřeba vody …" labels below, and checking
    // it here first used to steal that match before "vod" ever got a turn.
    if (has("výrob")) return "energy";
    // "Další zálivka" (garden's *next scheduled watering time*) used to also
    // match here via a "zálivk" keyword - but that is a schedule, not a water
    // *consumption* reading, so it needs a timestamp/duration sensor instead
    // (matched separately below with the rest of the "next X" slots).
    if (has("vod")) return "water";
    if (has("svoz", "odpad", "popelnic")) return "waste";
    if (has("zastáv", "odjezd", "link", "spoj")) return "transport";
    if (has("vzdálenost")) return "distance";
    if (has("vít")) return "wind_speed";
    if (has("světl")) return "light";
    if (has("zám")) return "lock";
    if (has("dveř")) return "door";
    if (has("okn")) return "window";
    if (has("pohyb")) return "motion";
    if (has("alarm", "režim")) return "alarm";
    if (has("zásilk", "sledovac", "doruč")) return "shipment";
    // "Položky"/"Splněné" bind one item's *name text* (see shopping.js's
    // design - a checklist row's label), not a reference to a whole todo
    // list - a todo.* entity's own state is a number (items left), which
    // would show as the item's name if suggested here. A "remaining count"
    // wording is the one case that really does want the list entity itself.
    // The full phrase "počet zbývajících", not a bare "zbývaj" stem: that stem
    // is also the start of washer's "Zbývající čas" and must still fall through
    // to the timestamp check below rather than be caught here.
    if (has("počet zbývajících")) return "todo_count";
    // The list entity itself, not one item's name. Has to be tested before the
    // todo_item line below, whose bare "seznam" stem also matches this label.
    if (has("nákupní seznam", "úkolovník")) return "todo_list";
    if (has("položk", "splněn", "seznam")) return "todo_item";
    if (has("program")) return "program";
    if (has("věk", "číslo")) return "generic";
    // Requires the full "zbývající čas" phrase, not the bare "zbývaj" stem -
    // that stem alone also shows up in the shopping template's "Počet
    // zbývajících" (a remaining-items count, not a duration), which used to
    // get misclassified as a timestamp/duration sensor because of it.
    // "zálivk" (garden's "Další zálivka") belongs here too - see the comment
    // by the water kind above for why it moved.
    // "aktualiz" (presence's "Aktualizace") is a last-updated timestamp, same
    // shape as the others on this line - it fell through to generic only
    // because none of the existing stems happened to cover that word.
    if (has("zbývající čas", "dokonč", "změn", "zálivk", "aktualiz")) return "timestamp";
    return "generic";
  },

  // Domains and device classes each kind accepts. A declared device_class outranks
  // any keyword match in the score below, which is what makes the binding reliable
  // on an installation whose entities are not named in Czech.
  _templateSlotTargets(kind) {
    const targets = {
      forecast: { domains: ["weather"] },
      weather: { domains: ["weather"] },
      radar: { domains: ["camera", "sensor"] },
      camera: { domains: ["camera", "sensor"] },

      calendar: { domains: ["calendar"] },
      person_name: { domains: ["person", "device_tracker"] },
      person_status: { domains: ["person", "device_tracker"] },
      temperature: { domains: ["sensor", "climate"], classes: ["temperature"] },
      humidity: { domains: ["sensor"], classes: ["humidity", "moisture"] },
      carbon_dioxide: { domains: ["sensor"], classes: ["carbon_dioxide"] },
      air_quality: { domains: ["sensor"], classes: ["aqi", "pm25"] },
      battery: { domains: ["sensor"], classes: ["battery"] },
      signal_strength: { domains: ["sensor"], classes: ["signal_strength"] },
      monetary: { domains: ["sensor"], classes: ["monetary"], units: ["kč", "czk", "eur", "/kwh"] },
      power: { domains: ["sensor"], classes: ["power"], units: ["kw", "w"] },
      energy: { domains: ["sensor"], classes: ["energy"], units: ["kwh", "wh", "mwh"] },
      water: { domains: ["sensor"], classes: ["water"], units: ["l", "m³"] },
      // Neither has a dedicated device_class - waste collection and transit
      // departures almost always come from a community integration, most
      // commonly exposed as a plain sensor (or a calendar entity for waste
      // schedules), so keyword matching against the entity id/name carries
      // more of the score here than for classes above.
      waste: { domains: ["calendar", "sensor"] },
      transport: { domains: ["sensor"] },
      distance: { domains: ["sensor"], classes: ["distance"] },
      wind_speed: { domains: ["sensor"], classes: ["wind_speed"] },
      pressure: { domains: ["sensor"], classes: ["atmospheric_pressure", "pressure"] },
      light: { domains: ["light", "switch"] },
      lock: { domains: ["lock"] },
      door: { domains: ["binary_sensor", "cover"], classes: ["door", "garage_door", "opening"] },
      window: { domains: ["binary_sensor", "cover"], classes: ["window", "opening"] },
      motion: { domains: ["binary_sensor"], classes: ["motion", "occupancy", "presence"] },
      alarm: { domains: ["alarm_control_panel"] },
      // A todo.* list entity's own state is a number (items left) - the right
      // fit for a "how many remain" slot, but the wrong fit for a slot that
      // wants one item's name as text.
      todo_item: { domains: ["input_text", "sensor"] },
      todo_count: { domains: ["todo", "sensor", "input_number"] },
      // The list itself. Only a todo.* entity can answer todo.get_items, so
      // unlike todo_count there is nothing else worth offering here.
      todo_list: { domains: ["todo"] },
      program: { domains: ["sensor", "select", "vacuum", "humidifier"] },
      timestamp: { domains: ["sensor", "input_datetime"], classes: ["timestamp", "duration"] },
      shipment: { domains: ["sensor"] },
      nameday: { domains: ["sensor", "calendar"] },
      // A promotion is a decision, so the entity that carries it is a helper the
      // shop can flip - or a binary sensor fed by the till system.
      sale: { domains: ["input_boolean", "binary_sensor", "switch"] },
      product: { domains: ["input_text", "sensor"] },
      barcode: { domains: ["input_text", "sensor"] },
      stock: { domains: ["sensor", "input_number"] },
      generic: { domains: ["sensor", "binary_sensor", "input_number", "input_text"] },
    };
    return targets[kind] || targets.generic;
  },

  _suggestTemplateEntity(meta) {
    const states = this._hass?.states || {};
    const entries = Object.entries(states)
      .filter(([entityId]) => !this._isDratekDisplayDiagnosticEntity(entityId));
    if (!entries.length) return "";
    const kind = this._templateSlotKind(meta.label, meta.icon);
    const { domains = [], classes = [], units = [] } = this._templateSlotTargets(kind);
    const strip = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    // A UI label like "CPU" or "RAM" is the abbreviation a person reads, but
    // Home Assistant's own core System Monitor integration names its entities
    // by the English word instead ("Processor use", "Memory use") - so the
    // plain keyword match below saw zero overlap and this fell back to
    // manual selection even though the right entity was sitting right there.
    // server.js's own setup guide already calls this out as a known gap; this
    // is what actually closes it instead of just warning about it.
    const SYNONYMS = { cpu: ["processor"], ram: ["memory"], disk: ["storage"] };
    const keywords = strip(meta.label).split(/\s+/).filter((word) => word.length > 2)
      .flatMap((word) => [word, ...(SYNONYMS[word] || [])]);
    const scored = entries.map(([entityId, state]) => {
      const domain = entityId.split(".")[0];
      const attributes = state?.attributes || {};
      let score = 0;
      let keywordHit = false;
      if (domains.includes(domain)) score += 6;
      if (classes.length && classes.includes(String(attributes.device_class || ""))) score += 10;
      if (units.length && units.some((unit) => strip(attributes.unit_of_measurement).includes(strip(unit)))) score += 4;
      keywords.forEach((word) => {
        if (strip(`${entityId} ${attributes.friendly_name || ""}`).includes(word)) { score += 3; keywordHit = true; }
      });
      if ([attributes.values, attributes.prices, attributes.data, attributes.history].some(Array.isArray)) score += 2;
      // An unavailable entity renders as its fallback anyway, so anything live is
      // a better binding than one that will show nothing.
      if (["unavailable", "unknown"].includes(String(state?.state).toLowerCase())) score -= 5;
      return { entityId, score, keywordHit };
    }).sort((a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId));
    const best = scored[0];
    if (!best || best.score < 6) return "";
    // "generic" has no device_class to lean on, so its domain list (sensor,
    // binary_sensor, input_number, input_text) is broad enough that a bare
    // domain match is close to no signal at all - on a real install with
    // dozens of sensors, that used to silently wire a slot to an unrelated
    // entity just because it sorted first alphabetically among same-score
    // candidates, which is worse than leaving it unbound: a wrong answer
    // reads as configured when it is not. Require at least one keyword hit
    // (a word from the slot's own label found in the entity's id/name)
    // before trusting a generic-kind guess enough to auto-apply it.
    if (kind === "generic" && classes.length === 0 && !best.keywordHit) return "";
    return best.entityId;
  },

  _templateBinding(template, meta) {
    const overrideKey = `${template?.id}:${meta.key}`;
    if (Object.prototype.hasOwnProperty.call(this._templateAutomationBindingOverrides || {}, overrideKey)) {
      return this._templateAutomationBindingOverrides[overrideKey];
    }
    const device = (typeof this._device === "function" ? this._device() : null);
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const draftBindings = this._deviceDrafts?.[address]?.bindings || {};
    if (draftBindings[meta.key] !== undefined) return draftBindings[meta.key];
    if (draftBindings[`${template?.id}:${meta.key}`] !== undefined) return draftBindings[`${template?.id}:${meta.key}`];

    const key = `${template?.id}:${meta.key}`;
    if (Object.prototype.hasOwnProperty.call(this._displayTemplateBindings || {}, key)) {
      const stored = this._displayTemplateBindings[key];
      // Entity ids can change when the integration is recreated or translated.
      // A stale saved id must not permanently suppress fresh auto-discovery.
      if (template?.id === "cz_spot_prices") {
        if (stored && this._hass?.states?.[stored]) return stored;
      } else if (stored !== undefined && stored !== "") {
        return stored;
      }
    }
    if (template?.id === "cz_spot_prices") {
      const index = Number(String(meta.key || "").split("-", 1)[0]);
      return this._czSpotTemplateBindings()[index] || "";
    }
    // Wi-Fi credentials and price-tag fields are authored values first. Do
    // not guess the same generic sensor for title, price and code; the user can
    // still explicitly choose an entity in the selector next to the text box.
    if (template?.manualValues) return "";
    return meta.automatic ? `internal:${meta.key}` : this._suggestTemplateEntity(meta);
  },

  _renderTemplateVariableSetting(template, variable, index) {
    const meta = this._templateVariableMeta(variable, index);
    const binding = this._templateBinding(template, meta);
    const sample = this._templateSampleValue(meta.label);
    const manualValue = binding?.startsWith("literal:")
      ? binding.slice("literal:".length)
      : (template?.manualValues && binding && !binding.includes(".") && !binding.startsWith("internal:") ? binding : "");
    const entityBinding = binding && !binding.startsWith("literal:") && binding.includes(".") ? binding : "";
    return `<section class="template-variable-setting ${meta.automatic ? "is-automatic" : ""}">
      <div class="template-variable-preview ${meta.automatic ? "is-automatic" : ""}" aria-label="Náhled proměnné ${this._escape(meta.label)}">
        <ha-icon icon="mdi:${meta.icon}"></ha-icon><strong>${this._escape(sample)}</strong><small>${this._escape(meta.label)}</small>
      </div>
      <div class="template-variable-setting-content">
        <div class="template-variable-setting-head"><div><strong>${this._escape(meta.label)}</strong><small>${this._escape(meta.description)}</small></div></div>
        ${meta.automatic
          ? `<div class="template-internal-value"><ha-icon icon="mdi:home-assistant"></ha-icon><span><strong>Automaticky z Home Assistantu</strong><small>Interní systémová proměnná</small></span><ha-icon icon="mdi:check-circle"></ha-icon></div>`
          : `${template?.manualValues ? `<label class="template-literal-setting"><span>Ruční hodnota</span><input type="text" data-template-literal-value="${this._escape(`${template.id}:${meta.key}`)}" value="${this._escape(manualValue)}" placeholder="${this._escape(sample)}"></label><small class="template-picker-help">Vyplněná ruční hodnota má přednost. Pole můžete nechat prázdné a níže vybrat entitu.</small>` : ""}
             <ha-selector data-template-entity-picker="${this._escape(`${template.id}:${meta.key}`)}" data-template-default-entity="${this._escape(entityBinding)}"></ha-selector>
             <small class="template-picker-help">${template?.manualValues ? "Nebo vyberte proměnnou z entity či pomocníka Home Assistantu." : "Vyberte senzor, pomocníka nebo jinou entitu odpovídající tomuto údaji."}</small>`}
      </div>
    </section>`;
  },

  _templateSampleValue(label) {
    const value = String(label || "").toLocaleLowerCase("cs");
    if (value.includes("teplot")) return "22,5 °C";
    if (value.includes("vlhk")) return "46 %";
    if (value.includes("vítr") || value.includes("vitr")) return "12 km/h";
    if (value.includes("tlak")) return "1013 hPa";
    if (value.includes("čas") || value.includes("aktual")) return "12:45";
    if (value.includes("datum")) return "23. května";
    if (value.includes("výkon")) return "2,35 kW";
    if (value.includes("cena")) return "2,45 Kč";
    if (value.includes("spotřeb") || value.includes("výrob")) return "8,2 kWh";
    if (value.includes("bateri")) return "82 %";
    if (value.includes("signál")) return "-48 dBm";
    return "Aktivní";
  },

  _renderDisplayTemplateSurface(template, format, primary = false, slot = "primary", fillDisplay = false, templateSize = "small", autoFit = false, slotWidth = 0, slotHeight = 0) {
    const orientation = format === "wide" ? "landscape" : "portrait";
    // Lay the preview out at the panel's own pixel size whenever it is known.
    // _layoutTemplateSvg derives padding and font sizes from these numbers, so
    // guessing them means the preview shrinks text differently than the panel.
    const nativeWidth = Math.round(Number(slotWidth) || 0);
    const nativeHeight = Math.round(Number(slotHeight) || 0);
    const templateWidth = nativeWidth > 0 ? nativeWidth : (orientation === "landscape" ? 296 : 150);
    const templateHeight = nativeHeight > 0 ? nativeHeight : (orientation === "landscape" ? 150 : 296);
    const placement = this._templateCanvasPlacements?.[slot] || { x: 9, y: 9 };
    const placementX = fillDisplay ? Math.max(0, Math.min(4, Number(placement.x || 0))) : Number(placement.x || 0);
    const placementY = fillDisplay ? Math.max(0, Math.min(4, Number(placement.y || 0))) : Number(placement.y || 0);
    const selected = !autoFit && !fillDisplay && this._selectedTemplateCanvasSlot === slot;
    // A template that covers the whole panel has nowhere to be moved to, so it
    // is drawn edge to edge and offers neither the drag handle nor the outline.
    const fullBleed = fillDisplay && !autoFit;
    const placeable = !autoFit && !fullBleed;
    return `<div class="template-display-slot" data-template-display-slot="${slot}">
      <div class="display-template-surface template-canvas-item size-${templateSize === "large" ? "large" : "small"} format-${format === "wide" ? "wide" : "narrow"} is-${orientation} ${selected ? "is-selected" : ""} ${autoFit ? "is-auto-fit" : ""} ${fullBleed ? "is-full-bleed" : ""}" data-preview-template="${template.id}" data-template-canvas-slot="${slot}" ${placeable ? `tabindex="0" role="button" aria-label="Šablona ${this._escape(template.title)}. Kliknutím vyberte a tažením přesuňte."` : ""} style="--template-item-x:${placementX}%;--template-item-y:${placementY}%">
        <svg class="template-responsive-preview" viewBox="0 0 ${templateWidth} ${templateHeight}" preserveAspectRatio="${fillDisplay ? "none" : "xMidYMid meet"}" aria-hidden="true">
          <foreignObject x="0" y="0" width="${templateWidth}" height="${templateHeight}">
            <div xmlns="http://www.w3.org/1999/xhtml" class="template-responsive-preview-body">${this._templateSvgPreviewBody(template, templateWidth, templateHeight)}</div>
          </foreignObject>
        </svg>
        ${primary && (!autoFit || template.user_created) ? this._renderTemplateEditorOverlays(template, orientation, templateWidth / Math.max(1, templateHeight), templateWidth, templateHeight) : ""}
        ${placeable ? `<span class="template-canvas-selection-label">${this._escape(template.title)}</span>` : ""}
      </div>
    </div>`;
  },

  _batteryInfo(device) {
    const raw = Number(device.battery_raw ?? device.battery);
    const reportedVoltage = Number(device.battery_voltage);
    const voltage = Number.isFinite(reportedVoltage) && reportedVoltage > 0
      ? reportedVoltage
      : Number.isFinite(raw) && raw > 0
        ? (raw > 5 ? raw / 10 : raw)
        : NaN;
    const reportedPercent = Number(device.battery_percent);
    const percent = Number.isFinite(reportedPercent)
      ? Math.max(0, Math.min(100, Math.round(reportedPercent)))
      : this._cr2450Percent(voltage);
    return { voltage, percent };
  },

  _cr2450Percent(voltage) {
    if (!Number.isFinite(voltage)) return NaN;
    const curve = [[3.20, 100], [3.10, 96], [3.00, 85], [2.90, 55], [2.80, 20], [2.70, 8], [2.60, 4], [2.50, 2], [2.00, 0]];
    if (voltage >= curve[0][0]) return 100;
    if (voltage <= curve[curve.length - 1][0]) return 0;
    for (let index = 0; index < curve.length - 1; index++) {
      const [highVoltage, highPercent] = curve[index];
      const [lowVoltage, lowPercent] = curve[index + 1];
      if (voltage >= lowVoltage && voltage <= highVoltage) {
        const ratio = (voltage - lowVoltage) / (highVoltage - lowVoltage);
        return Math.round(lowPercent + ratio * (highPercent - lowPercent));
      }
    }
    return 0;
  },

  _formatBatteryVoltage(voltage) {
    if (!Number.isFinite(voltage)) return "-";
    const decimals = Math.abs(voltage * 10 - Math.round(voltage * 10)) < 0.000001
      ? 1
      : Math.abs(voltage * 100 - Math.round(voltage * 100)) < 0.000001 ? 2 : 3;
    return `${voltage.toFixed(decimals).replace(".", ",")} V`;
  },

  _batteryLevel(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value >= 75) return 4;
    if (value >= 50) return 3;
    if (value >= 25) return 2;
    return 1;
  },

  _renderBatterySegments(value) {
    const level = this._batteryLevel(value);
    const label = Number.isFinite(value) ? `Baterie ${Math.round(value)} %, ${level} ze 4 dílků` : "Stav baterie není dostupný";
    return `<div class="battery-segments level-${level}" role="img" aria-label="${label}" title="${label}">${[1, 2, 3, 4].map((cell) => `<span class="${cell <= level ? "on" : ""}"></span>`).join("")}</div>`;
  },

  _signalLevel(rssi) {
    if (!Number.isFinite(rssi)) return 0;
    if (rssi >= -55) return 4;
    if (rssi >= -68) return 3;
    if (rssi >= -80) return 2;
    return 1;
  },

  _signalClass(rssi) {
    const level = this._signalLevel(rssi);
    if (level >= 3) return "good-signal";
    if (level === 2) return "warn-signal";
    return "bad-signal";
  },

  _formatTime(timestamp) {
    if (!timestamp) return "-";
    return new Date(Number(timestamp) * 1000).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  },

  _formatDuration(started, finished) {
    if (!started || !finished) return "";
    return `${Math.max(0, Number(finished) - Number(started))} s`;
  },

  _renderSignalBars(rssi) {
    const level = this._signalLevel(rssi);
    const label = Number.isFinite(rssi) ? `Signál ${rssi} dBm, ${level} ze 4 dílků` : "Síla signálu není dostupná";
    return `<div class="signal-bars level-${level}" role="img" aria-label="${label}" title="${label}">${[1, 2, 3, 4].map((bar) => `<span class="${bar <= level ? "on" : ""}"></span>`).join("")}</div>`;
  },

};
