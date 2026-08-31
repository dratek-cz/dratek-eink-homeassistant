import {
  EspSerialFlasher,
  describeSerialPort,
  extractJsonObject,
  requestSerialPort,
  webSerialBlockedReason,
} from "./esp-web-flasher.js";

// Druhá cesta k nové gatewayi: deska zapojená do počítače, ze kterého uživatel
// panel ovládá. Firmware se stáhne z integrace a zapíše ho prohlížeč, takže
// Home Assistant nemusí být tam, kde je USB - to je celý smysl téhle cesty.
// Hostitelská cesta přes esptool zůstává beze změny v panel-gateway.mixin.js.

// Rychlost, na kterou se linka přepne po navázání spojení. Přes převodník
// zkrátí zápis aplikace z minut na desítky sekund; nativní USB ji ignoruje,
// tam se o rychlost stará samo USB.
const BROWSER_FLASH_BAUD = 460800;

const FLASH_ROUTES = [
  {
    id: "browser",
    title: "Do tohoto počítače",
    hint: "Firmware nahraje prohlížeč přes USB",
    icon: "mdi:laptop",
  },
  {
    id: "host",
    title: "Do zařízení s Home Assistantem",
    hint: "Firmware nahraje server přes esptool",
    icon: "mdi:server-network",
  },
];

// Schéma kabelu místo obrázku desky: volí se tady jediná věc - kam je deska
// zapojená - a nakreslená trasa ji řekne dřív než popisek.
const ROUTE_DIAGRAMS = {
  browser: `<svg class="route-diagram" viewBox="0 0 200 64" role="img" aria-label="ESP32 zapojená do tohoto počítače, gateway se pak hlásí Home Assistantu přes Wi-Fi">
    <rect x="6" y="20" width="34" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
    <text x="23" y="36" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor">ESP</text>
    <path d="M40 32 H78" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <text x="59" y="26" text-anchor="middle" font-size="7.5" fill="currentColor" opacity=".75">USB</text>
    <path d="M80 20 h36 v20 h-36 z" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M76 44 h44" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M126 32 q10 -8 20 0" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".55" stroke-dasharray="3 3"/>
    <text x="136" y="24" text-anchor="middle" font-size="7.5" fill="currentColor" opacity=".75">Wi-Fi</text>
    <rect x="152" y="20" width="40" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/>
    <text x="172" y="36" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" opacity=".55">HA</text>
  </svg>`,
  host: `<svg class="route-diagram" viewBox="0 0 200 64" role="img" aria-label="ESP32 zapojená přímo do zařízení s Home Assistantem">
    <rect x="20" y="20" width="34" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
    <text x="37" y="36" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor">ESP</text>
    <path d="M54 32 H140" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <text x="97" y="26" text-anchor="middle" font-size="7.5" fill="currentColor" opacity=".75">USB</text>
    <rect x="140" y="18" width="46" height="28" rx="5" fill="none" stroke="currentColor" stroke-width="2"/>
    <text x="163" y="36" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor">HA</text>
  </svg>`,
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const webSerialMixin = {

  _browserFlashBlockReason() {
    return webSerialBlockedReason();
  },

  _browserFlashSupported() {
    return this._browserFlashBlockReason() === "";
  },

  _setGatewayFlashRoute(route) {
    if (this._gatewayBusy || !route || route === this._flashRoute) return;
    this._flashRoute = route;
    this._flashResult = null;
    this._serialResult = null;
    this._render();
    this._paint();
  },

  _maskWifiSecret(line, password) {
    return password ? String(line).split(password).join("********") : String(line);
  },

  _browserSafeHostname(value) {
    // Stejná pravidla jako _safe_network_hostname v gateway.py, aby deska
    // dostala pod oběma cestami tentýž název v síti.
    const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-");
    const safe = normalized.replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
    return (safe || "dratek-eink-gateway").slice(0, 63).replace(/-+$/, "") || "dratek-eink-gateway";
  },

  _browserFlashLog(line) {
    // Diagnostika desky nemá flash výsledek, ale sériové linky se drží stejně,
    // takže její řádky patří do konzole vedle - jinak by se ztratily.
    const sink = this._flashResult || this._serialResult;
    if (!sink) return;
    const password = this._flashForm?.password || "";
    sink.log = [...(sink.log || []), this._maskWifiSecret(line, password)];
    this._browserFlashRender();
  },

  _browserFlashRender(force = false) {
    // Zápis aplikace je přes tisíc bloků. Překreslovat panel u každého z nich
    // by ho zahltilo dřív, než se stihne cokoliv zapsat.
    const now = Date.now();
    if (!force && now - (this._browserFlashRenderAt || 0) < 250) return;
    this._browserFlashRenderAt = now;
    this._render();
    this._scrollGatewayLogsToBottom();
    this._paint();
  },

  async _pickBrowserSerialPort() {
    if (!this._browserFlashSupported() || this._gatewayBusy) return;
    try {
      const port = await requestSerialPort();
      if (!port) return;
      this._browserSerial = { port, label: describeSerialPort(port) };
      this._flashResult = null;
      this._serialResult = null;
    } catch (err) {
      // Zavřený výběr portu není chyba, jen se nic nevybralo.
      if (err?.name !== "NotFoundError") {
        this._flashResult = { ok: false, status: "failed", error: this._message(err), log: [] };
      }
    }
    this._render();
    this._paint();
  },

  _forgetBrowserSerialPort() {
    if (this._gatewayBusy) return;
    this._browserSerial = { port: null, label: "" };
    this._render();
    this._paint();
  },

  async _loadBrowserFlashManifest() {
    const result = await this._hass.callWS({ type: "dratek_eink/gateways/firmware_manifest" });
    if (!result?.ok) throw new Error(result?.error || "Seznam firmware obrazů se nepodařilo načíst.");
    return result;
  },

  async _downloadFirmwareImages(profile) {
    const images = [];
    for (const part of profile.parts || []) {
      const path = `/api/dratek_eink/firmware/${encodeURIComponent(profile.chip)}/${encodeURIComponent(part.part)}`;
      // Podepsaná adresa nese oprávnění v sobě, takže se stahuje obyčejným
      // fetchem a token uživatele nikam do URL nepatří.
      const signed = await this._hass.callWS({ type: "auth/sign_path", path, expires: 600 });
      const response = await fetch(signed.path);
      if (!response.ok) {
        throw new Error(`${part.filename} se nepodařilo stáhnout (HTTP ${response.status}).`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== part.size) {
        throw new Error(`${part.filename} dorazil neúplný (${bytes.length} z ${part.size} B).`);
      }
      images.push({ ...part, bytes });
      this._browserFlashLog(`Staženo ${part.filename} (${bytes.length} B).`);
    }
    if (!images.length) throw new Error("Tahle instalace nemá přibalený žádný firmware obraz.");
    return images;
  },

  async _openBrowserFlasher() {
    const port = this._browserSerial?.port;
    if (!port) throw new Error("Nejdřív vyberte desku připojenou do tohoto počítače.");
    // Klíčem je obraz i desítka procent dohromady: každý obraz začíná od nuly,
    // takže samotná desítka by u druhého obrazu mlčela až do konce prvního.
    this._browserFlashDecile = "";
    const flasher = new EspSerialFlasher(port, {
      log: (line) => this._browserFlashLog(line),
      progress: ({ label, ratio }) => {
        const percent = Math.round(ratio * 100);
        if (this._flashResult) this._flashResult.progress = percent;
        // Aplikace má přes tisíc bloků, takže na jedno procento jich připadá
        // deset. Do protokolu patří každá desítka jednou, ne desetkrát.
        const decile = `${label}:${Math.floor(percent / 10)}`;
        if (decile !== this._browserFlashDecile) {
          this._browserFlashDecile = decile;
          this._browserFlashLog(`${label}: ${percent} %`);
        }
        this._browserFlashRender();
      },
    });
    await flasher.open();
    return flasher;
  },

  async _browserProvisionWifi(flasher) {
    const password = this._flashForm.password || "";
    const payload = JSON.stringify({
      cmd: "wifi",
      ssid: this._flashForm.ssid,
      password,
      hostname: this._browserSafeHostname(this._flashForm.hostname),
    });
    if (flasher.baudRate !== 115200) await flasher.reopen(115200);
    await flasher.resetIntoApp();

    const deadline = Date.now() + 45000;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt += 1;
      this._browserFlashLog(`Posílám Wi-Fi konfiguraci (pokus ${attempt}).`);
      await flasher.writeText(`${payload}\n`);
      const saved = await flasher.waitForTextLine(
        (line) => (line.includes("wifi_config_saved") ? line : null),
        2600,
        (line) => this._browserFlashLog(line),
      );
      if (saved) return true;
    }
    return false;
  },

  async _browserAwaitGatewayStatus(flasher, timeoutMs = 60000) {
    // Firmware se po uložení Wi-Fi restartuje, takže první dotaz ještě nikdo
    // neposlouchá. Ptáme se dokola, dokud se neozve s přidělenou IP adresou.
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      await flasher.writeText(`${JSON.stringify({ cmd: "status" })}\n`);
      const payload = await flasher.waitForTextLine(
        (line) => {
          const parsed = extractJsonObject(line);
          return parsed && parsed.message === "status" ? parsed : null;
        },
        3000,
        (line) => this._browserFlashLog(line),
      );
      if (payload) {
        last = payload;
        if (payload.wifi_connected && payload.ip) return payload;
      }
      await sleep(700);
    }
    return last;
  },

  async _registerBrowserGateway(status) {
    // Deska už je hotová a v síti; jestli ji Home Assistant zrovna nedosáhne,
    // je to samostatný problém a nesmí přebít výsledek nahrávání.
    const host = String(status?.ip || "").trim();
    if (!host) return null;
    const name = String(this._flashForm.hostname || "").trim() || status.hostname || "DRATEK eInk gateway";
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/add", name, host });
      await this._loadGateways(true);
      return result?.gateway || null;
    } catch (err) {
      this._browserFlashLog(
        `Gateway běží na ${host}, ale Home Assistant ji zatím nepřidal: ${this._message(err)}`
      );
      return null;
    }
  },

  async _flashGatewayFromBrowser() {
    if (!this._hass || this._gatewayBusy || !this._browserSerial?.port) return;
    this._gatewayBusy = true;
    this._flashJobId = "";
    this._serialResult = null;
    this._flashResult = { ok: null, status: "running", progress: 0, error: "", log: [] };
    this._render();
    this._scrollGatewayTerminalIntoView();

    let flasher = null;
    try {
      const manifest = await this._loadBrowserFlashManifest();
      flasher = await this._openBrowserFlasher();

      if (!(await flasher.enterBootloader())) {
        throw new Error(
          "Deska se nepřihlásila do bootloaderu. Podržte BOOT, krátce stiskněte RESET, pusťte BOOT a spusťte nahrání znovu."
        );
      }
      const chip = await flasher.detectChip();
      this._browserFlashLog(`Připojená deska: ${chip.label}.`);
      if (chip.chip !== this._flashForm.chip) {
        // Čip řekne pravdu spolehlivěji než výběr v panelu, tak podle něj výběr
        // srovnáme - jinak by se na desku nahrál firmware pro jinou.
        this._browserFlashLog(`Přepínám firmware na profil ${chip.chip}; v panelu byl vybraný ${this._flashForm.chip}.`);
        this._flashForm.chip = chip.chip;
      }
      const profile = manifest.chips?.[chip.chip];
      if (!profile) throw new Error(`Pro ${chip.label} není v téhle instalaci firmware.`);
      if (profile.missing?.length) {
        throw new Error(`Instalaci chybí obraz ${profile.missing.join(", ")}.`);
      }

      const images = await this._downloadFirmwareImages(profile);
      if (!flasher.isNativeUsb()) await flasher.changeBaudRate(BROWSER_FLASH_BAUD);
      await flasher.prepareFlash();

      // ROM neumí erase-region, kterým hostitelská cesta čistí NVS. Zápis
      // samých 0xFF přes stejný rozsah nechá ROM oblast napřed smazat, takže
      // deska nastartuje ze stejně čistého stavu jako po esptoolu.
      const erase = profile.erase || {};
      if (erase.size) {
        await flasher.writeImage(
          erase.offset,
          new Uint8Array(erase.size).fill(0xff),
          "Čištění NVS a OTA metadat"
        );
      }
      for (const image of images) {
        await flasher.writeImage(image.offset, image.bytes, image.filename);
        await flasher.verifyImage(image.offset, image.size, image.md5);
        this._browserFlashLog(`${image.filename}: zapsáno a ověřeno.`);
      }

      this._flashResult.status = "provisioning";
      this._browserFlashLog("Firmware nahrán. Restartuji desku a posílám Wi-Fi konfiguraci.");
      if (!(await this._browserProvisionWifi(flasher))) {
        throw new Error("Firmware je nahraný, ale deska nepotvrdila uložení Wi-Fi konfigurace.");
      }
      this._browserFlashLog("Wi-Fi konfigurace uložena. Čekám, až se gateway připojí do sítě.");

      const status = await this._browserAwaitGatewayStatus(flasher);
      if (status?.ip) {
        this._browserFlashLog(`Gateway je v síti na adrese ${status.ip}.`);
        const gateway = await this._registerBrowserGateway(status);
        this._gatewayResult = gateway
          ? { ok: true, message: `Gateway ${gateway.name} byla přidána.` }
          : null;
      } else {
        this._browserFlashLog(
          "Gateway se zatím nepřipojila k Wi-Fi. Zkontrolujte SSID a heslo, nebo ji najděte v síti na kartě Najít v síti."
        );
      }

      this._flashResult.ok = true;
      this._flashResult.status = "done";
      this._flashResult.progress = 100;
    } catch (err) {
      this._flashResult = {
        ...(this._flashResult || {}),
        ok: false,
        status: "failed",
        error: this._message(err),
        log: this._flashResult?.log || [],
      };
    } finally {
      try {
        await flasher?.close();
      } catch (_err) { /* port zavřeme jak to půjde, na výsledek to nemá vliv */ }
      this._gatewayBusy = false;
      this._browserFlashRender(true);
    }
  },

  async _browserSerialDiagnostics() {
    if (!this._hass || this._gatewayBusy || !this._browserSerial?.port) return;
    this._gatewayBusy = true;
    this._flashResult = null;
    this._serialResult = { ok: null, log: ["Otevírám sériový port a ptám se desky na stav..."] };
    this._render();
    this._scrollGatewayTerminalIntoView();

    let flasher = null;
    try {
      flasher = await this._openBrowserFlasher();
      await flasher.resetIntoApp();
      const log = this._serialResult.log;
      const payload = await (async () => {
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
          await flasher.writeText(`${JSON.stringify({ cmd: "status" })}\n`);
          const found = await flasher.waitForTextLine(
            (line) => {
              const parsed = extractJsonObject(line);
              return parsed && parsed.message === "status" ? parsed : null;
            },
            2500,
            (line) => log.push(line),
          );
          if (found) return found;
        }
        return null;
      })();
      this._serialResult = payload
        ? { ok: true, payload, log }
        : { ok: false, error: "Deska se přes sériovou linku neozvala.", log };
    } catch (err) {
      this._serialResult = { ok: false, error: this._message(err), log: this._serialResult?.log || [] };
    } finally {
      try {
        await flasher?.close();
      } catch (_err) { /* dtto */ }
      this._gatewayBusy = false;
      this._render();
      this._scrollGatewayLogsToBottom();
      this._paint();
    }
  },

  async _browserSerialWifiOnly() {
    if (!this._hass || this._gatewayBusy || !this._browserSerial?.port || !this._flashForm.ssid) return;
    this._gatewayBusy = true;
    this._serialResult = null;
    this._flashResult = { ok: null, status: "provisioning", progress: 0, error: "", log: [] };
    this._render();
    this._scrollGatewayTerminalIntoView();

    let flasher = null;
    try {
      flasher = await this._openBrowserFlasher();
      this._browserFlashLog("Posílám Wi-Fi konfiguraci bez zásahu do firmwaru.");
      if (!(await this._browserProvisionWifi(flasher))) {
        throw new Error("Deska nepotvrdila uložení Wi-Fi konfigurace.");
      }
      const status = await this._browserAwaitGatewayStatus(flasher);
      if (status?.ip) {
        this._browserFlashLog(`Gateway je v síti na adrese ${status.ip}.`);
        const gateway = await this._registerBrowserGateway(status);
        this._gatewayResult = gateway
          ? { ok: true, message: `Gateway ${gateway.name} byla přidána.` }
          : null;
      }
      this._flashResult.ok = true;
      this._flashResult.status = "done";
      this._flashResult.progress = 100;
    } catch (err) {
      this._flashResult = {
        ...(this._flashResult || {}),
        ok: false,
        status: "failed",
        error: this._message(err),
        log: this._flashResult?.log || [],
      };
    } finally {
      try {
        await flasher?.close();
      } catch (_err) { /* dtto */ }
      this._gatewayBusy = false;
      this._browserFlashRender(true);
    }
  },

  _renderGatewayRoutePicker() {
    const blocked = this._browserFlashBlockReason();
    return `<div class="gateway-route-picker" role="radiogroup" aria-label="Kam je deska zapojená">${FLASH_ROUTES.map((route) => {
      const selected = this._flashRoute === route.id;
      // Výběr trasy je navigace mezi dvěma instalačními panely, ne samotné
      // otevření sériového portu. I na nezabezpečeném HTTP proto musí jít
      // prohlížečovou cestu zvolit, aby uživatel viděl přesný důvod a návod.
      // Web Serial blokujeme až u tlačítka „Vybrat desku“ níže.
      const disabled = this._gatewayBusy;
      const unavailable = route.id === "browser" && Boolean(blocked);
      return `<button type="button" class="gateway-route-card ${selected ? "is-selected" : ""}" role="radio" aria-checked="${selected ? "true" : "false"}" data-flash-route="${route.id}" ${disabled ? "disabled" : ""}>
        <span class="route-card-head"><ha-icon icon="${route.icon}"></ha-icon><strong>${this._escape(route.title)}</strong></span>
        <span class="route-card-art">${ROUTE_DIAGRAMS[route.id] || ""}</span>
        <small>${this._escape(unavailable ? `${route.hint} · vyžaduje HTTPS nebo localhost` : route.hint)}</small>
      </button>`;
    }).join("")}</div>`;
  },

  _renderBrowserFlashNotice() {
    const blocked = this._browserFlashBlockReason();
    if (!blocked) return "";
    const copy = blocked === "insecure"
      ? {
        title: "Prohlížeč tady k USB nepustí",
        body: "Nahrávání z počítače potřebuje zabezpečené připojení. Otevřete Home Assistant přes HTTPS nebo na adrese http://localhost, a nebo zvolte nahrání přes zařízení s Home Assistantem.",
      }
      : {
        title: "Tenhle prohlížeč neumí Web Serial",
        body: "Nahrávání z počítače funguje v Chrome, Edge a Opeře na počítači. V ostatních prohlížečích zvolte nahrání přes zařízení s Home Assistantem.",
      };
    return `<div class="gateway-alert-card gateway-alert-compact is-warning">
      <span class="alert-icon-wrap"><ha-icon icon="mdi:usb-off"></ha-icon></span>
      <div><strong>${this._escape(copy.title)}</strong><small>${this._escape(copy.body)}</small></div>
    </div>`;
  },

  _renderBrowserPortSection() {
    const connected = Boolean(this._browserSerial?.port);
    const blocked = Boolean(this._browserFlashBlockReason());
    const body = connected
      ? `<div class="browser-port-card is-ready">
          <span class="browser-port-icon"><ha-icon icon="mdi:usb-flash-drive"></ha-icon></span>
          <div class="browser-port-copy"><strong>Deska je vybraná</strong><small>${this._escape(this._browserSerial.label || "Sériový port")}</small></div>
          <button id="forgetBrowserPort" class="secondary" type="button" ${this._gatewayBusy ? "disabled" : ""}>Vybrat jinou</button>
        </div>`
      : `<div class="browser-port-card">
          <span class="browser-port-icon"><ha-icon icon="mdi:usb-port"></ha-icon></span>
          <div class="browser-port-copy"><strong>Zatím není vybraná žádná deska</strong><small>Prohlížeč se zeptá, který port smí použít.</small></div>
          <button id="pickBrowserPort" type="button" ${this._gatewayBusy || blocked ? "disabled" : ""}><ha-icon icon="mdi:usb"></ha-icon>Vybrat desku</button>
        </div>`;
    return `<section class="gateway-setup-section gateway-usb-section">
      <div class="gateway-step-header"><span class="step-num">1</span><div><strong>Připojení přes USB</strong><small>Deska zapojená do tohoto počítače</small></div></div>
      ${body}
    </section>`;
  },

  _renderBrowserInstallPanel(selectedBoard) {
    const portReady = Boolean(this._browserSerial?.port);
    const wifiReady = Boolean(this._flashForm.ssid);
    const ready = portReady && wifiReady;
    const check = (ok, icon, label) => `<span class="${ok ? "is-ready" : "is-missing"}"><ha-icon icon="mdi:${ok ? "check-circle" : icon}"></ha-icon>${label}</span>`;
    return `<section class="gateway-panel gateway-install-panel">
      <div class="gateway-step-header"><span class="step-num">4</span><div><strong>Instalace a diagnostika</strong><small>Nahrání proběhne z tohoto počítače</small></div></div>
      <div class="gateway-install-overview">
        <div class="gateway-install-placeholder ${this._gatewayBusy ? "is-busy" : ""}">
          <div class="placeholder-icon-wrap"><ha-icon icon="${this._gatewayBusy ? "mdi:sync" : ready ? "mdi:check-decagram-outline" : "mdi:progress-alert"}" class="${this._gatewayBusy ? "spin" : ""}"></ha-icon></div>
          <div class="placeholder-info"><small>Vybraná deska</small><strong>${this._escape(selectedBoard.name)}</strong><span class="board-target-tag"><ha-icon icon="mdi:memory"></ha-icon>${this._escape(selectedBoard.firmware)}</span></div>
        </div>
        <div class="gateway-install-checks" aria-label="Připravenost instalace">
          ${check(portReady, "usb-port", portReady ? "Deska je vybraná" : "Vyberte desku")}
          ${check(wifiReady, "wifi-alert", wifiReady ? "Wi-Fi údaje vyplněny" : "Doplňte Wi-Fi síť")}
          ${check(true, "memory", `${selectedBoard.name} vybrána`)}
        </div>
      </div>
      <div class="gateway-install-actions">
        <button id="browserFlashGateway" class="gateway-cta-primary" ${this._gatewayBusy || !ready ? "disabled" : ""}><ha-icon icon="mdi:chip"></ha-icon><span><strong>Nahrát firmware</strong><small>Nainstaluje firmware i nastavení Wi-Fi</small></span><ha-icon class="gateway-cta-arrow" icon="mdi:arrow-right"></ha-icon></button>
        <div class="gateway-install-sub-actions">
          <button id="browserSerialWifi" class="secondary" ${this._gatewayBusy || !ready ? "disabled" : ""}><ha-icon icon="mdi:wifi-cog"></ha-icon><span><strong>Jen Wi-Fi</strong><small>Bez změny firmwaru</small></span></button>
          <button id="browserSerialStatus" class="secondary" ${this._gatewayBusy || !portReady ? "disabled" : ""}><ha-icon icon="mdi:console-line"></ha-icon><span><strong>Ověřit desku</strong><small>Diagnostika připojení</small></span></button>
        </div>
      </div>
    </section>`;
  },
};
