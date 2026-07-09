class DratekEinkPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._loading = false;
    this._sendingAddress = "";
    this._result = null;
    this._error = "";
    this._sendResult = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._render();
      this._scan();
    }
  }

  async _scan() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = "";
    this._render();
    try {
      this._result = await this._hass.callWS({ type: "dratek_eink/scan" });
    } catch (err) {
      this._error = err && err.message ? err.message : String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _sendTestText(device) {
    if (!this._hass || this._sendingAddress) return;
    this._sendingAddress = device.address;
    this._sendResult = null;
    this._render();
    try {
      this._sendResult = await this._hass.callWS({
        type: "dratek_eink/send_text",
        address: device.address,
        sdk_type: Number(device.sdk_type),
        text: "dratek.cz",
      });
    } catch (err) {
      this._sendResult = {
        ok: false,
        address: device.address,
        text: "dratek.cz",
        error: err && err.message ? err.message : String(err),
        log: [],
      };
    } finally {
      this._sendingAddress = "";
      this._render();
    }
  }

  _status() {
    if (this._error) return { cls: "bad", text: "Chyba při skenu" };
    if (!this._result) return { cls: "muted", text: "Čekám na první sken" };
    if (this._result.scanner_count === 0) return { cls: "bad", text: "Bluetooth není dostupné" };
    if (this._result.devices.length === 0) return { cls: "warn", text: "Bluetooth funguje, DRATEK eInk nenalezen" };
    return { cls: "good", text: `Nalezeno ${this._result.devices.length} DRATEK eInk displejů` };
  }

  _render() {
    const result = this._result || { scanner_count: 0, ble_count: 0, devices: [], ble_devices: [], debug: [] };
    const status = this._status();
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          min-height: 100%;
          color: var(--primary-text-color);
          background: var(--primary-background-color);
          font-family: var(--paper-font-body1_-_font-family, Roboto, Arial, sans-serif);
        }
        .page {
          max-width: 1180px;
          margin: 0 auto;
          padding: 24px;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .title {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .icon {
          width: 42px;
          height: 42px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          font-size: 24px;
        }
        h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .subtitle {
          margin-top: 4px;
          color: var(--secondary-text-color);
          font-size: 14px;
        }
        button {
          border: none;
          border-radius: 6px;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.55;
          cursor: progress;
        }
        .secondary {
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          border: 1px solid var(--divider-color);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        .card {
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          padding: 16px;
          box-sizing: border-box;
        }
        .metric {
          color: var(--secondary-text-color);
          font-size: 13px;
          margin-bottom: 8px;
        }
        .value {
          font-size: 26px;
          font-weight: 650;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          border-radius: 999px;
          padding: 0 11px;
          font-size: 13px;
          font-weight: 650;
        }
        .good { background: #d7f5df; color: #0b6b2a; }
        .warn { background: #fff2c7; color: #775500; }
        .bad { background: #ffd9d4; color: #9d1c0f; }
        .muted { background: var(--secondary-background-color); color: var(--secondary-text-color); }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        th, td {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid var(--divider-color);
          vertical-align: top;
        }
        th {
          color: var(--secondary-text-color);
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .empty {
          color: var(--secondary-text-color);
          padding: 18px 0 2px;
        }
        details {
          margin-top: 16px;
        }
        summary {
          cursor: pointer;
          color: var(--primary-color);
          font-weight: 650;
        }
        pre {
          overflow: auto;
          background: var(--secondary-background-color);
          border-radius: 8px;
          padding: 12px;
          font-size: 12px;
          line-height: 1.45;
        }
        @media (max-width: 800px) {
          .page { padding: 16px; }
          .topbar { align-items: flex-start; flex-direction: column; }
          .grid { grid-template-columns: 1fr; }
          table { display: block; overflow-x: auto; }
        }
      </style>
      <div class="page">
        <div class="topbar">
          <div class="title">
            <div class="icon">▦</div>
            <div>
              <h1>DRATEK eInk</h1>
              <div class="subtitle">Vyhledávání a diagnostika Bluetooth LE cenovek</div>
            </div>
          </div>
          <button id="scan" ${this._loading ? "disabled" : ""}>${this._loading ? "Vyhledávám..." : "Vyhledat zařízení"}</button>
        </div>

        <div class="grid">
          <div class="card">
            <div class="metric">Stav</div>
            <span class="pill ${status.cls}">${this._escape(status.text)}</span>
          </div>
          <div class="card">
            <div class="metric">Bluetooth adaptéry / proxy</div>
            <div class="value">${result.scanner_count}</div>
          </div>
          <div class="card">
            <div class="metric">BLE zařízení v dosahu</div>
            <div class="value">${result.ble_count}</div>
          </div>
        </div>

        <div class="card">
          <h2 style="margin:0 0 12px;font-size:18px;">Nalezené DRATEK eInk displeje</h2>
          ${this._renderDevices(result.devices)}
          ${this._renderSendResult()}
        </div>

        <div class="card" style="margin-top:16px;">
          <h2 style="margin:0 0 12px;font-size:18px;">Debug</h2>
          ${this._error ? `<div class="pill bad">${this._escape(this._error)}</div>` : ""}
          <pre>${this._escape((result.debug || []).join("\\n"))}</pre>
          <details>
            <summary>Všechna BLE zařízení zachycená Home Assistantem (${result.ble_devices.length})</summary>
            ${this._renderBleDevices(result.ble_devices)}
          </details>
        </div>
      </div>
    `;
    this.shadowRoot.querySelector("#scan").addEventListener("click", () => this._scan());
    this.shadowRoot.querySelectorAll("[data-send-address]").forEach((button) => {
      button.addEventListener("click", () => {
        const address = button.getAttribute("data-send-address");
        const device = result.devices.find((item) => item.address === address);
        if (device) this._sendTestText(device);
      });
    });
  }

  _renderDevices(devices) {
    if (!devices.length) {
      return `<div class="empty">Zatím nebyl nalezen žádný DRATEK eInk displej.</div>`;
    }
    return `
      <table>
        <thead>
          <tr>
            <th>Fyzický kód</th>
            <th>Název</th>
            <th>BLE adresa</th>
            <th>Model</th>
            <th>RSSI</th>
            <th>SDK</th>
            <th>Baterie</th>
            <th>SW/HW</th>
            <th>Akce</th>
          </tr>
        </thead>
        <tbody>
          ${devices.map((device) => `
            <tr>
              <td><strong>${this._escape(device.physical_code)}</strong></td>
              <td>${this._escape(device.name)}</td>
              <td>${this._escape(device.address)}</td>
              <td>${this._escape(device.model)}</td>
              <td>${this._escape(device.rssi ?? "")}</td>
              <td>${this._escape(device.sdk_type)} <span style="color:var(--secondary-text-color)">raw ${this._escape(device.raw_type)}</span></td>
              <td>${this._escape(device.battery)}</td>
              <td>${this._escape(device.sw)} / ${this._escape(device.hw)}</td>
              <td>
                <button class="secondary" data-send-address="${this._escape(device.address)}" ${this._sendingAddress ? "disabled" : ""}>
                  ${this._sendingAddress === device.address ? "Odesílám..." : "Odeslat dratek.cz"}
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  _renderSendResult() {
    if (!this._sendResult) return "";
    const result = this._sendResult;
    const cls = result.ok ? "good" : "bad";
    const title = result.ok
      ? `Text '${result.text}' byl odeslán na ${result.address}.`
      : `Odeslání na ${result.address} selhalo: ${result.error || "neznámá chyba"}`;
    return `
      <div style="margin-top:16px;">
        <span class="pill ${cls}">${this._escape(title)}</span>
        ${(result.log || []).length ? `<pre>${this._escape(result.log.join("\\n"))}</pre>` : ""}
      </div>
    `;
  }

  _renderBleDevices(devices) {
    if (!devices.length) {
      return `<div class="empty">Home Assistant zatím nevrátil žádné BLE zařízení.</div>`;
    }
    return `
      <table>
        <thead>
          <tr>
            <th>Název</th>
            <th>Adresa</th>
            <th>RSSI</th>
            <th>Manufacturer IDs</th>
            <th>Services</th>
          </tr>
        </thead>
        <tbody>
          ${devices.map((device) => `
            <tr>
              <td>${this._escape(device.name || "-")}</td>
              <td>${this._escape(device.address)}</td>
              <td>${this._escape(device.rssi ?? "")}</td>
              <td>${this._escape((device.manufacturer_ids || []).join(", "))}</td>
              <td>${this._escape((device.service_uuids || []).join(", "))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  _escape(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

customElements.define("dratek-eink-panel", DratekEinkPanel);
