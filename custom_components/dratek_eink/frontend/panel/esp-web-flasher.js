// Instalátor gateway firmwaru běžící přímo v prohlížeči, přes Web Serial.
//
// Hostitelská cesta pouští esptool na stroji s Home Assistantem (viz
// _flash_gateway_sync v gateway.py). Tenhle modul dělá totéž z prohlížeče:
// mluví přímo s ROM bootloaderem ESP32 po sériové lince, takže deska může
// zůstat zapojená v počítači uživatele a Home Assistant ji nikdy nevidí.
//
// Záměrně se obejde bez stub loaderu - ten by znamenal přibalit ke každému čipu
// další binárku. ROM sám umí komprimovaný zápis (FLASH_DEFL_*) i kontrolu MD5,
// což na tři obrazy stačí. Jediné, co ROM neumí, je erase-region; místo něj se
// přes NVS oblast zapíšou samé 0xFF, protože mazání si ROM stejně udělá sám při
// FLASH_DEFL_BEGIN.

const SLIP_END = 0xc0;
const SLIP_ESC = 0xdb;
const SLIP_ESC_END = 0xdc;
const SLIP_ESC_ESC = 0xdd;

const CMD = {
  SYNC: 0x08,
  READ_REG: 0x0a,
  SPI_SET_PARAMS: 0x0b,
  SPI_ATTACH: 0x0d,
  CHANGE_BAUDRATE: 0x0f,
  FLASH_DEFL_BEGIN: 0x10,
  FLASH_DEFL_DATA: 0x11,
  SPI_FLASH_MD5: 0x13,
};

// Registr, ve kterém má každý čip svoji "magii". Klíč `chip` musí sedět
// s FLASH_PROFILES v gateway.py, jinak by si prohlížeč a backend povídaly
// o jiném profilu.
const CHIP_MAGIC_ADDR = 0x40001000;
const CHIP_MAGIC = new Map([
  [0x00f01d83, { chip: "esp32", label: "ESP32", encryptedFlash: false }],
  [0x00000009, { chip: "esp32s3", label: "ESP32-S3", encryptedFlash: true }],
  [0xeb004136, { chip: "esp32s3", label: "ESP32-S3 (beta)", encryptedFlash: true }],
]);

// ROM přebírá komprimovaná data po 1 kB blocích. Stub by uměl 16 kB, ale ten
// tady schválně není.
const FLASH_WRITE_SIZE = 0x400;
// Velikost flash hlásíme konzervativně. Gateway obrazy končí hluboko pod 2 MB,
// takže 4 MB projdou i na deskách, které mají víc.
const FLASH_TOTAL_SIZE = 0x400000;
const ESPRESSIF_USB_VENDOR_ID = 0x303a;
const DEFAULT_BAUD = 115200;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function webSerialBlockedReason() {
  if (typeof navigator === "undefined") return "unsupported";
  if (typeof window !== "undefined" && window.isSecureContext === false) return "insecure";
  if (!("serial" in navigator)) return "unsupported";
  if (typeof CompressionStream !== "function") return "unsupported";
  return "";
}

export function isWebSerialSupported() {
  return webSerialBlockedReason() === "";
}

export async function requestSerialPort() {
  return navigator.serial.requestPort({});
}

export function describeSerialPort(port) {
  const info = typeof port?.getInfo === "function" ? port.getInfo() : {};
  const vendor = info.usbVendorId;
  if (vendor === undefined) return "Sériový port";
  const hex = (value) => `0x${Number(value || 0).toString(16).padStart(4, "0")}`;
  const native = vendor === ESPRESSIF_USB_VENDOR_ID ? " · nativní USB" : "";
  return `USB ${hex(vendor)}:${hex(info.usbProductId)}${native}`;
}

function packUint32(...values) {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value >>> 0, true));
  return out;
}

function concatBytes(first, second) {
  const out = new Uint8Array(first.length + second.length);
  out.set(first, 0);
  out.set(second, first.length);
  return out;
}

function espChecksum(data) {
  let checksum = 0xef;
  for (let index = 0; index < data.length; index += 1) checksum ^= data[index];
  return checksum >>> 0;
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function slipEncode(payload) {
  const out = [SLIP_END];
  for (let index = 0; index < payload.length; index += 1) {
    const byte = payload[index];
    if (byte === SLIP_END) out.push(SLIP_ESC, SLIP_ESC_END);
    else if (byte === SLIP_ESC) out.push(SLIP_ESC, SLIP_ESC_ESC);
    else out.push(byte);
  }
  out.push(SLIP_END);
  return Uint8Array.from(out);
}

function slipDecode(raw) {
  const out = [];
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === SLIP_ESC && index + 1 < raw.length) {
      index += 1;
      if (raw[index] === SLIP_ESC_END) out.push(SLIP_END);
      else if (raw[index] === SLIP_ESC_ESC) out.push(SLIP_ESC);
      else out.push(raw[index]);
      continue;
    }
    out.push(raw[index]);
  }
  return Uint8Array.from(out);
}

function buildPacket(op, data, checksum) {
  const packet = new Uint8Array(8 + data.length);
  const view = new DataView(packet.buffer);
  view.setUint8(0, 0x00);
  view.setUint8(1, op);
  view.setUint16(2, data.length, true);
  view.setUint32(4, checksum >>> 0, true);
  packet.set(data, 8);
  return packet;
}

async function deflateBytes(bytes) {
  // CompressionStream("deflate") je zlib (RFC 1950) - přesně to, co posílá
  // zlib.compress() v esptoolu a co ROM na druhé straně umí rozbalit.
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class EspSerialFlasher {
  constructor(port, { log = () => {}, progress = () => {} } = {}) {
    this.port = port;
    this.chip = null;
    this.baudRate = DEFAULT_BAUD;
    this._log = log;
    this._progress = progress;
    this._rx = new Uint8Array(0);
    this._reader = null;
    this._writer = null;
    this._pump = null;
    this._closing = false;
    this._wake = null;
  }

  isNativeUsb() {
    const info = typeof this.port?.getInfo === "function" ? this.port.getInfo() : {};
    return info.usbVendorId === ESPRESSIF_USB_VENDOR_ID;
  }

  async open(baudRate = DEFAULT_BAUD) {
    this._closing = false;
    await this.port.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      bufferSize: 16 * 1024,
      flowControl: "none",
    });
    this.baudRate = baudRate;
    this._rx = new Uint8Array(0);
    this._writer = this.port.writable.getWriter();
    this._pump = this._readPump();
  }

  async close() {
    this._closing = true;
    try {
      await this._reader?.cancel();
    } catch (_err) { /* port mohl zmizet i pod námi */ }
    try {
      this._writer?.releaseLock();
    } catch (_err) { /* dtto */ }
    this._writer = null;
    try {
      await this._pump;
    } catch (_err) { /* pumpa končí spolu s readerem */ }
    this._pump = null;
    try {
      await this.port.close();
    } catch (_err) { /* zavřený port zavřít podruhé nejde a nevadí to */ }
  }

  async reopen(baudRate) {
    await this.close();
    await sleep(120);
    await this.open(baudRate);
  }

  async _readPump() {
    while (this.port.readable && !this._closing) {
      const reader = this.port.readable.getReader();
      this._reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.length) {
            this._rx = concatBytes(this._rx, value);
            const wake = this._wake;
            this._wake = null;
            if (wake) wake();
          }
        }
      } catch (_err) {
        // Odpojený kabel nebo zavřený port. Čtení skončí, chybu ohlásí až
        // příkaz, kterému vyprší čas - ten ví, co se zrovna dělo.
        break;
      } finally {
        try {
          reader.releaseLock();
        } catch (_err) { /* reader už mohl být uvolněný */ }
        this._reader = null;
      }
    }
  }

  _sleepUntilData(maxMs) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        if (this._wake === wake) this._wake = null;
        resolve();
      }, maxMs);
      const wake = () => {
        window.clearTimeout(timer);
        resolve();
      };
      this._wake = wake;
    });
  }

  async _write(bytes) {
    if (!this._writer) throw new Error("Sériový port není otevřený.");
    await this._writer.write(bytes);
  }

  _takeSlipFrame() {
    for (;;) {
      const buffer = this._rx;
      const start = buffer.indexOf(SLIP_END);
      if (start < 0) {
        // Mimo rámce chodí jen bootovací log. Zahodíme ho, ať buffer neroste.
        if (buffer.length) this._rx = new Uint8Array(0);
        return null;
      }
      let end = -1;
      for (let index = start + 1; index < buffer.length; index += 1) {
        if (buffer[index] === SLIP_END) {
          end = index;
          break;
        }
      }
      if (end < 0) {
        if (start > 0) this._rx = buffer.slice(start);
        return null;
      }
      const raw = buffer.slice(start + 1, end);
      this._rx = buffer.slice(end + 1);
      if (raw.length) return slipDecode(raw);
    }
  }

  async _readPacket(deadline) {
    for (;;) {
      const frame = this._takeSlipFrame();
      if (frame) return frame;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      await this._sleepUntilData(Math.min(50, Math.max(1, remaining)));
    }
  }

  async _command(op, data = new Uint8Array(0), checksum = 0, timeoutMs = 3000) {
    await this._write(slipEncode(buildPacket(op, data, checksum)));
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const packet = await this._readPacket(deadline);
      if (!packet) throw new Error(`ESP32 neodpověděl na příkaz 0x${op.toString(16)}.`);
      if (packet.length < 8) continue;
      const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
      // Odpovědi na dřívější SYNC můžou ještě doznívat, tak bereme jen tu,
      // která patří k odeslanému příkazu.
      if (view.getUint8(0) !== 0x01 || view.getUint8(1) !== op) continue;
      return { value: view.getUint32(4, true) >>> 0, payload: packet.slice(8) };
    }
  }

  async _checkCommand(op, data = new Uint8Array(0), checksum = 0, timeoutMs = 3000) {
    const { value, payload } = await this._command(op, data, checksum, timeoutMs);
    // ROM zakončuje odpověď dvěma nebo čtyřmi stavovými bajty podle čipu. Když
    // je odpověď jen stav, je příznak selhání vždycky její první bajt - a delší
    // odpověď posílá pouze MD5, kterou si volající krájí od začátku sám.
    if (payload.length <= 4) {
      if (payload.length && payload[0] !== 0) {
        throw new Error(
          `Příkaz 0x${op.toString(16)} skončil chybou (stav ${payload[0]}, kód ${payload[1] ?? 0}).`
        );
      }
      return { value, payload: new Uint8Array(0) };
    }
    return { value, payload };
  }

  async sync() {
    const payload = new Uint8Array(36);
    payload.set([0x07, 0x07, 0x12, 0x20], 0);
    payload.fill(0x55, 4);
    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        await this._command(CMD.SYNC, payload, 0, 320);
        // Na jeden SYNC odpoví ROM několikrát. Zbytek spolkneme tady, jinak by
        // se první z nich vydával za odpověď na následující příkaz.
        const drainUntil = Date.now() + 250;
        while (await this._readPacket(drainUntil)) { /* zahodit */ }
        return true;
      } catch (_err) {
        await sleep(60);
      }
    }
    return false;
  }

  async _classicReset() {
    // Stejná sekvence, jakou dělá esptool přes DTR/RTS: EN dolů, IO0 dolů,
    // pustit EN, pustit IO0.
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
    await sleep(100);
    await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
    await sleep(50);
    await this.port.setSignals({ dataTerminalReady: false });
    await sleep(200);
  }

  async _usbJtagReset() {
    // Desky s nativním USB (ESP32-S3) mají EN/IO0 vyvedené jinak a klasická
    // sekvence je do bootloaderu nedostane.
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await sleep(100);
    await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
    await sleep(100);
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
    await sleep(100);
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await sleep(200);
  }

  async enterBootloader() {
    const resets = this.isNativeUsb()
      ? [["nativní USB", () => this._usbJtagReset()], ["klasickou", () => this._classicReset()]]
      : [["klasickou", () => this._classicReset()], ["nativní USB", () => this._usbJtagReset()]];
    for (const [name, reset] of resets) {
      this._log(`Restartuji desku do bootloaderu (${name} sekvencí).`);
      try {
        await reset();
      } catch (err) {
        this._log(`Sekvence selhala: ${err.message || err}`);
        continue;
      }
      this._rx = new Uint8Array(0);
      if (await this.sync()) {
        this._log("Bootloader odpovídá.");
        return true;
      }
    }
    return false;
  }

  async detectChip() {
    const { value } = await this._checkCommand(CMD.READ_REG, packUint32(CHIP_MAGIC_ADDR));
    const known = CHIP_MAGIC.get(value);
    if (!known) {
      throw new Error(
        `Připojená deska hlásí neznámý čip (0x${value.toString(16)}). Gateway firmware je jen pro ESP32 a ESP32-S3.`
      );
    }
    this.chip = known;
    return known;
  }

  async changeBaudRate(target) {
    if (!target || target === this.baudRate) return this.baudRate;
    this._log(`Zrychluji linku na ${target} Bd.`);
    try {
      await this._command(CMD.CHANGE_BAUDRATE, packUint32(target, 0), 0, 1500);
    } catch (_err) {
      // Potvrzení chodí ještě starou rychlostí a občas se ztratí. Jestli příkaz
      // prošel, ukáže až sync po přepnutí portu.
    }
    await this.reopen(target);
    if (await this.sync()) return target;
    this._log("Vyšší rychlost se neujala, vracím se na 115200 Bd.");
    await this.reopen(DEFAULT_BAUD);
    if (await this.sync()) return DEFAULT_BAUD;
    if (await this.enterBootloader()) return DEFAULT_BAUD;
    throw new Error("Deska se po změně rychlosti linky přestala hlásit.");
  }

  async prepareFlash() {
    await this._checkCommand(CMD.SPI_ATTACH, packUint32(0, 0));
    await this._checkCommand(
      CMD.SPI_SET_PARAMS,
      packUint32(0, FLASH_TOTAL_SIZE, 64 * 1024, 4 * 1024, 256, 0xffff)
    );
  }

  async writeImage(offset, data, label) {
    const compressed = await deflateBytes(data);
    const blocks = Math.ceil(compressed.length / FLASH_WRITE_SIZE);
    const eraseBlocks = Math.ceil(data.length / FLASH_WRITE_SIZE);
    let params = packUint32(eraseBlocks * FLASH_WRITE_SIZE, blocks, FLASH_WRITE_SIZE, offset);
    if (this.chip?.encryptedFlash) params = concatBytes(params, packUint32(0));

    this._log(
      `${label}: ${data.length} B na 0x${offset.toString(16)} (komprimováno na ${compressed.length} B).`
    );
    // Mazání běží ještě uvnitř FLASH_DEFL_BEGIN, takže první odpověď může trvat
    // podle velikosti obrazu. esptool počítá 30 s na megabajt, my dáme 40.
    const eraseTimeout = Math.max(12000, Math.ceil((data.length / (1024 * 1024)) * 40000));
    await this._checkCommand(CMD.FLASH_DEFL_BEGIN, params, 0, eraseTimeout);

    for (let sequence = 0; sequence < blocks; sequence += 1) {
      const chunk = compressed.slice(sequence * FLASH_WRITE_SIZE, (sequence + 1) * FLASH_WRITE_SIZE);
      const body = concatBytes(packUint32(chunk.length, sequence, 0, 0), chunk);
      await this._checkCommand(CMD.FLASH_DEFL_DATA, body, espChecksum(chunk), 15000);
      this._progress({ label, ratio: (sequence + 1) / blocks });
    }
  }

  async verifyImage(offset, size, expectedMd5) {
    const timeout = Math.max(8000, Math.ceil((size / (1024 * 1024)) * 12000));
    const { payload } = await this._checkCommand(
      CMD.SPI_FLASH_MD5,
      packUint32(offset, size, 0, 0),
      0,
      timeout
    );
    // ROM vrací 16 binárních bajtů, stub 32 znaků hexu. Stub tu není, ale obojí
    // přečteme a nestojí to nic.
    const actual = payload.length >= 32
      ? new TextDecoder().decode(payload.slice(0, 32))
      : toHex(payload.slice(0, 16));
    if (expectedMd5 && actual.toLowerCase() !== String(expectedMd5).toLowerCase()) {
      throw new Error(`Kontrola zapsaných dat na 0x${offset.toString(16)} nesedí.`);
    }
    return actual;
  }

  async resetIntoApp() {
    // Bez stubu se z bootloaderu ven dostaneme jen resetem: EN dolů a nahoru,
    // IO0 celou dobu nahoře. Totéž dělá _pulse_esp_reset_into_app v gateway.py.
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
    await sleep(120);
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await sleep(400);
    this._rx = new Uint8Array(0);
  }

  async writeText(text) {
    await this._write(new TextEncoder().encode(text));
  }

  readTextLines() {
    // Bootovací log i JSON odpovědi firmwaru čteme ze stejného bufferu jako
    // SLIP rámce, jen jiným pohledem na tytéž bajty.
    const buffer = this._rx;
    const newline = buffer.lastIndexOf(0x0a);
    if (newline < 0) return [];
    this._rx = buffer.slice(newline + 1);
    return new TextDecoder()
      .decode(buffer.slice(0, newline))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async waitForTextLine(matcher, timeoutMs, onLine = () => {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (const line of this.readTextLines()) {
        onLine(line);
        const hit = matcher(line);
        if (hit) return hit;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      await this._sleepUntilData(Math.min(200, Math.max(1, remaining)));
    }
  }
}

export function extractJsonObject(text) {
  // Firmware míchá JSON odpovědi s obyčejným logem na jedné lince, takže se
  // objekt hledá stejně tolerantně jako v _extract_json_object v gateway.py.
  let start = text.indexOf("{");
  while (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, index + 1));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
          } catch (_err) { /* zkusíme další kandidáty */ }
          break;
        }
      }
    }
    start = text.indexOf("{", start + 1);
  }
  return null;
}
