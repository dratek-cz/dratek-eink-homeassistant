export const customLayersMixin = {


  _renderLayeredHaDesigner() {
    this._ensureLayeredCustomForm();
    const form = this._customElementForm;
    const result = this._customElementResult
      ? `<div class="custom-result ${this._customElementResult.ok ? "good" : "bad"}"><ha-icon icon="${this._customElementResult.ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${this._escape(this._customElementResult.message || this._customElementResult.error || "")}</div>`
      : "";
    const css = `<style>
      .ha-library-view,.ha-layer-editor{display:grid;gap:14px}.ha-library-head{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:26px;border-radius:14px;background:linear-gradient(115deg,rgba(0,162,165,.12),rgba(255,122,0,.08));border:1px solid rgba(0,162,165,.32)}.ha-library-head h2{font-size:26px;text-transform:none;color:var(--primary-text-color);margin:5px 0}.ha-library-head p{margin:0;color:var(--secondary-text-color)}.ha-library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}.ha-library-card{display:grid;gap:12px;padding:14px;border:1px solid var(--divider-color);border-radius:12px;background:var(--card-background-color)}.ha-library-card canvas{width:100%;aspect-ratio:296/128;background:#fff;border:1px solid var(--divider-color);border-radius:8px}.ha-library-card strong,.ha-library-card small{display:block}.ha-library-card small{margin-top:3px;color:var(--secondary-text-color)}.ha-card-actions{display:flex;gap:7px}.ha-empty-library{min-height:390px;display:grid;place-items:center;align-content:center;text-align:center;gap:10px;border:1px dashed rgba(0,162,165,.45);border-radius:14px;background:var(--card-background-color)}.ha-empty-library>ha-icon{--mdc-icon-size:54px;color:var(--dratek-teal)}.ha-empty-library h3,.ha-empty-library p{margin:0}
      .ha-editor-top{display:grid;grid-template-columns:auto minmax(220px,1fr) auto auto;align-items:end;gap:12px;padding:12px;border:1px solid var(--divider-color);border-radius:12px;background:var(--card-background-color)}.ha-editor-top nav{display:flex;gap:7px}.ha-editor-top nav button b{display:grid;place-items:center;width:21px;height:21px;border-radius:50%;background:rgba(255,255,255,.2)}.name-field{margin:0}.ha-layer-layout{display:grid;grid-template-columns:230px minmax(420px,1fr) 260px;min-height:590px;border:1px solid var(--divider-color);border-radius:12px;overflow:hidden;background:var(--card-background-color)}.layer-list,.layer-properties{padding:13px;background:var(--secondary-background-color);overflow:auto}.panel-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}.panel-heading strong,.panel-heading small{display:block}.panel-heading small{color:var(--secondary-text-color);font-size:10px}.layer-list-item{display:grid;grid-template-columns:72px 1fr;gap:8px;margin-bottom:9px;padding:8px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);cursor:pointer}.layer-list-item.active{border-color:var(--dratek-teal);box-shadow:inset 3px 0 0 var(--dratek-teal)}.layer-list-item canvas{width:72px;height:42px;background:#fff;border-radius:5px}.layer-list-item input{min-width:0;border:0;background:transparent;font-weight:800}.layer-list-item>div{grid-column:2;display:flex;gap:5px}.layer-stage{display:flex;flex-direction:column;align-items:stretch;padding:14px;min-width:0}.layer-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.layer-toolbar>span{margin-left:auto;color:var(--secondary-text-color);font-size:11px;font-weight:800}.layer-canvas-shell{flex:1;display:grid;place-items:center;margin-top:14px;padding:22px;background:radial-gradient(circle at 1px 1px,rgba(100,116,139,.24) 1px,transparent 0);background-size:18px 18px;border:1px solid var(--divider-color);border-radius:10px;overflow:auto}.layer-canvas-shell canvas{display:block;width:min(100%,820px);height:auto;max-height:490px;background:#fff;box-shadow:0 12px 36px rgba(0,0,0,.18);touch-action:none}.canvas-help{text-align:center;color:var(--secondary-text-color);font-size:11px}.layer-inspector{display:grid;gap:11px}.layer-inspector h3,.rules-card h3,.rules-source h3,.rule-preview h3{margin:0}.mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.layer-inspector-empty{display:grid;place-items:center;text-align:center;min-height:240px;color:var(--secondary-text-color)}.layer-inspector-empty ha-icon{--mdc-icon-size:42px}
      .ha-rules-layout{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(460px,1.5fr) minmax(260px,.7fr);gap:14px}.rules-source{display:flex;gap:12px;align-items:flex-start}.step-number{display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;border-radius:10px;background:var(--dratek-teal);color:#fff;font-weight:900}.rules-source p,.rules-title p{color:var(--secondary-text-color);font-size:11px}.rules-title,.rules-title>div{display:flex;align-items:center;justify-content:space-between;gap:10px}.layer-rules{display:grid;gap:8px;margin:14px 0}.layer-rule{display:grid;grid-template-columns:26px minmax(125px,1fr) minmax(85px,.75fr) auto minmax(115px,1fr) auto;align-items:center;gap:7px;padding:8px;border:1px solid var(--divider-color);border-radius:9px}.layer-rule>b{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--secondary-background-color)}.layer-rule-actions{display:flex;flex-wrap:wrap;gap:7px}.time-range-inputs{display:grid;grid-template-columns:1fr 1fr;gap:5px}.time-range-inputs label{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:4px;margin:0;color:var(--secondary-text-color);font-size:8px;font-weight:800}.time-range-inputs input{min-width:0;padding:7px 5px}.default-layer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;padding:13px;border-radius:10px;background:rgba(0,162,165,.08);border:1px solid rgba(0,162,165,.28)}.default-layer strong,.default-layer small{display:block}.default-layer small{color:var(--secondary-text-color)}.rule-preview{align-self:start;text-align:center}.rule-preview canvas{width:100%;height:auto;background:#fff;border:1px solid var(--divider-color);border-radius:8px;margin:12px 0}.rule-preview strong,.rule-preview small{display:block}.rule-preview small{color:var(--secondary-text-color);margin-top:4px}
      .ha-layer-editor{display:grid;gap:14px;min-width:0}.ha-editor-top{grid-template-columns:auto minmax(180px,1fr) minmax(390px,auto) auto;align-items:center;box-shadow:0 8px 26px rgba(15,23,42,.06)}.ha-editor-top>*{min-width:0}.ha-editor-top nav{min-width:0;flex-wrap:wrap}.ha-editor-top nav button{white-space:nowrap}.ha-layer-layout{grid-template-columns:minmax(190px,230px) minmax(0,1fr) minmax(240px,280px);grid-template-areas:"layers stage properties";min-width:0;min-height:clamp(520px,64vh,720px)}.ha-layer-layout>*{min-width:0}.ha-layer-layout>.layer-list{grid-area:layers;border-right:1px solid var(--divider-color)}.ha-layer-layout>.layer-stage{grid-area:stage}.ha-layer-layout>.layer-properties{grid-area:properties;border-left:1px solid var(--divider-color)}.layer-stage{overflow:hidden}.layer-canvas-shell{min-height:300px;max-width:100%;padding:clamp(12px,2vw,28px)}.layer-canvas-shell canvas{max-width:100%;max-height:min(52vh,520px);object-fit:contain}.layer-properties{overflow-wrap:anywhere}.layer-inspector-heading{display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--divider-color)}.layer-inspector-heading>span{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;color:var(--dratek-teal);background:rgba(0,162,165,.1)}.layer-inspector-heading h3,.layer-inspector-heading small{display:block;margin:0}.layer-inspector-heading small,.inspector-note{color:var(--secondary-text-color);font-size:11px}.check-row{display:flex;align-items:center;gap:7px}.inspector-note{margin:0;padding:9px;border-radius:8px;background:var(--secondary-background-color)}.inspector-divider{display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.inspector-divider:after{content:"";height:1px;flex:1;background:var(--divider-color)}.ha-rules-layout{grid-template-columns:minmax(220px,.7fr) minmax(0,1.45fr) minmax(220px,.65fr);align-items:start}.ha-rules-layout>*{min-width:0}.rules-source>div{min-width:0;flex:1}.layer-rule>*{min-width:0}.ha-library-card{min-width:0}.ha-library-card canvas{max-width:100%}
      @media(max-width:1320px){.ha-editor-top{grid-template-columns:auto minmax(180px,1fr) auto}.ha-editor-top nav{grid-column:1/-1;grid-row:2}.ha-layer-layout{grid-template-columns:210px minmax(0,1fr);grid-template-areas:"layers stage" "properties properties"}.ha-layer-layout>.layer-properties{border-left:0;border-top:1px solid var(--divider-color);max-height:none}.layer-inspector{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.layer-inspector>.layer-inspector-heading,.layer-inspector>.inspector-divider,.layer-inspector>.inspector-note,.layer-inspector>#deleteLayerObject{grid-column:1/-1}.ha-rules-layout{grid-template-columns:minmax(220px,.7fr) minmax(0,1.3fr);}.rule-preview{grid-column:1/-1;display:grid;grid-template-columns:minmax(180px,320px) 1fr;align-items:center;text-align:left;gap:12px}.rule-preview h3{grid-column:1/-1}.rule-preview canvas{grid-row:2/4;margin:0}.rule-preview strong,.rule-preview small{grid-column:2}}@media(max-width:900px){.ha-editor-top{grid-template-columns:1fr auto}.ha-editor-top .name-field{grid-column:1/-1;grid-row:2}.ha-editor-top nav{grid-column:1/-1;grid-row:3}.ha-rules-layout{grid-template-columns:1fr}.rule-preview{grid-column:auto}.layer-rule{grid-template-columns:26px minmax(0,1fr) minmax(0,1fr);}.layer-rule>span{display:none}.layer-rule select:last-of-type{grid-column:2/4}.layer-rule button{grid-column:3;grid-row:1}}@media(max-width:680px){.ha-library-head{display:grid}.ha-layer-layout{grid-template-columns:minmax(0,1fr);grid-template-areas:"layers" "stage" "properties"}.layer-list{max-height:280px;border-right:0!important;border-bottom:1px solid var(--divider-color)}.ha-editor-top{display:flex;align-items:stretch;flex-direction:column}.ha-editor-top nav{display:grid;grid-template-columns:1fr 1fr}.ha-editor-top nav button{white-space:normal}.layer-toolbar button{font-size:0}.layer-toolbar button ha-icon{margin:0}.layer-inspector{grid-template-columns:1fr}.layer-inspector>*{grid-column:1!important}.layer-rule{grid-template-columns:26px 1fr}.layer-rule>*{grid-column:2}.layer-rule>b{grid-column:1}.layer-rule button{grid-column:2;grid-row:auto}.rule-preview{display:block;text-align:center}.rule-preview canvas{margin:12px 0}.ha-card-actions{flex-wrap:wrap}}
    </style>`;
    if (this._customWorkspaceView === "library") {
      const cards = this._customElements.map((element) => {
        const layer = this._customLayerForValue(element, this._customElementCurrentValue(element));
        return `<article class="ha-library-card"><canvas width="296" height="128" data-custom-element-id="${this._escape(element.id)}" data-custom-layer-preview="${this._escape(layer?.id || "")}"></canvas><div><strong>${this._escape(element.name)}</strong><small>${this._escape(element.entity_id || "Bez entity")} · ${(element.layers || []).length || 1} vrstev</small></div><div class="ha-card-actions"><button data-custom-edit="${element.id}"><ha-icon icon="mdi:pencil-outline"></ha-icon>Upravit</button><button class="secondary" data-custom-insert="${element.id}"><ha-icon icon="mdi:vector-square-plus"></ha-icon>Do displeje</button><button class="secondary icon-btn" data-custom-delete="${element.id}" title="Smazat"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div></article>`;
      }).join("");
      return `${css}<div class="ha-library-view"><section class="ha-library-head"><div><span class="eyebrow">Knihovna vlastních rozhraní</span><h2>Designer HA prvků</h2><p>Každý prvek může mít několik grafických vrstev. Home Assistant podle pravidel vždy vybere tu správnou.</p></div><button id="customElementNew"><ha-icon icon="mdi:plus"></ha-icon>Vytvořit nový prvek</button></section>${result}${cards ? `<div class="ha-library-grid">${cards}</div>` : `<div class="ha-empty-library"><ha-icon icon="mdi:layers-plus"></ha-icon><h3>Zatím nemáte žádný vlastní prvek</h3><p>Začněte například rozhraním zásuvky se dvěma vrstvami Zapnuto a Vypnuto.</p><button id="customElementEmptyNew"><ha-icon icon="mdi:plus"></ha-icon>Vytvořit první prvek</button></div>`}</div>`;
    }
    const layers = form.layers || [];
    const activeLayer = this._customActiveLayer();
    const selected = this._customSelectedLayerObject();
    const top = `<header class="ha-editor-top"><button id="customBackToLibrary" class="secondary"><ha-icon icon="mdi:arrow-left"></ha-icon>Knihovna</button><div class="field name-field"><label>Název prvku</label><input data-custom-element-field="name" value="${this._escape(form.name)}" placeholder="Například Zásuvka v kuchyni"></div><nav><button class="${this._customLayerStep === "design" ? "" : "secondary"}" data-custom-step="design"><b>1</b> Grafika vrstev</button><button class="${this._customLayerStep === "rules" ? "" : "secondary"}" data-custom-step="rules"><b>2</b> Pravidla zobrazení</button></nav><button id="customElementSave" ${this._customElementBusy || !this._customElementFormValid() ? "disabled" : ""}><ha-icon icon="mdi:content-save-outline"></ha-icon>${this._customElementBusy ? "Ukládám…" : "Uložit prvek"}</button></header>`;
    return `${css}<div class="ha-layer-editor">${top}${result}${this._customLayerStep === "design" ? this._renderCustomLayerDesign(layers, activeLayer, selected) : this._renderCustomLayerRules(layers)}</div>`;
  },

  _renderLayerColorPalette(property, current, label, values) {
    const labels = { original: "Původní", none: "Bez barvy", black: "Černá", red: "Červená", white: "Bílá" };
    const selected = values.includes(current) ? current : values[0];
    return `<fieldset class="layer-color-field"><legend>${this._escape(label)}</legend><div class="layer-color-options">${values.map((value) => `<label class="${selected === value ? "selected" : ""}" title="${labels[value]}"><input type="radio" name="layer-${property}-${this._escape(this._customSelectedObjectId)}" data-layer-object="${property}" value="${value}" ${selected === value ? "checked" : ""}><span class="layer-color-swatch ${value}">${value === "original" ? `<ha-icon icon="mdi:palette-outline"></ha-icon>` : value === "none" ? `<ha-icon icon="mdi:cancel"></ha-icon>` : ""}</span><small>${labels[value]}</small></label>`).join("")}</div></fieldset>`;
  },

  _defaultLayerIcons() {
    return [
      ["light", "Světlo", "mdi:lightbulb-outline"],
      ["socket", "Zásuvka", "mdi:power-socket-eu"],
      ["temperature", "Teploměr", "mdi:thermometer"],
      ["water", "Voda", "mdi:water-outline"],
      ["home", "Dům", "mdi:home-outline"],
      ["power", "Napájení", "mdi:power"],
      ["battery", "Baterie", "mdi:battery-medium"],
      ["wifi", "Signál", "mdi:wifi"],
    ];
  },

  _renderDefaultLayerIcons() {
    return this._defaultLayerIcons().map(([key, label, icon]) => `<button class="default-layer-icon secondary" data-default-layer-icon="${key}" title="Vložit ikonu ${this._escape(label)}"><ha-icon icon="${icon}"></ha-icon><span>${this._escape(label)}</span></button>`).join("");
  },

  _addDefaultLayerIcon(key) {
    const layer = this._customActiveLayer();
    if (!layer || !this._defaultLayerIcons().some(([item]) => item === key)) return;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const line = (...points) => {
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
      ctx.stroke();
    };
    if (key === "light") {
      ctx.beginPath(); ctx.arc(64, 51, 28, Math.PI * .82, Math.PI * 2.18); ctx.stroke();
      line(43, 72, 49, 83, 79, 83, 85, 72); line(49, 95, 79, 95); line(54, 107, 74, 107);
      [[64, 8, 64, 18], [24, 25, 33, 34], [104, 25, 95, 34], [18, 61, 30, 61], [110, 61, 98, 61]].forEach((item) => line(...item));
    } else if (key === "socket") {
      ctx.strokeRect(29, 18, 70, 92); line(50, 41, 50, 57); line(78, 41, 78, 57);
      ctx.beginPath(); ctx.arc(64, 77, 15, 0, Math.PI); ctx.stroke(); line(64, 92, 64, 110);
    } else if (key === "temperature") {
      ctx.beginPath(); ctx.arc(64, 94, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 94, 10, 0, Math.PI * 2); ctx.fill();
      line(64, 84, 64, 30); ctx.beginPath(); ctx.arc(64, 29, 13, Math.PI, 0); ctx.stroke(); line(51, 29, 51, 79); line(77, 29, 77, 79);
    } else if (key === "water") {
      ctx.beginPath(); ctx.moveTo(64, 12); ctx.bezierCurveTo(52, 34, 29, 61, 29, 82); ctx.bezierCurveTo(29, 105, 45, 118, 64, 118); ctx.bezierCurveTo(83, 118, 99, 105, 99, 82); ctx.bezierCurveTo(99, 61, 76, 34, 64, 12); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(54, 89, 15, .3, 1.65); ctx.stroke();
    } else if (key === "home") {
      line(17, 61, 64, 20, 111, 61); line(31, 54, 31, 108, 97, 108, 97, 54); ctx.strokeRect(54, 75, 21, 33);
    } else if (key === "power") {
      ctx.beginPath(); ctx.arc(64, 68, 43, -.72, Math.PI * 1.72); ctx.stroke(); line(64, 12, 64, 65);
    } else if (key === "battery") {
      ctx.strokeRect(16, 37, 91, 55); ctx.fillRect(108, 51, 10, 27); ctx.fillRect(28, 49, 50, 31); line(68, 43, 50, 65, 64, 65, 51, 87);
    } else {
      ctx.beginPath(); ctx.arc(64, 101, 8, 0, Math.PI * 2); ctx.fill();
      [[20, 59], [34, 74], [48, 88]].forEach(([radius, y]) => { ctx.beginPath(); ctx.arc(64, 108, radius, Math.PI * 1.19, Math.PI * 1.81); ctx.stroke(); });
    }
    const side = Math.max(44, Math.round(Math.min(this._customElementForm.canvas_width, this._customElementForm.canvas_height) * .55));
    const object = {
      id: `item-${Date.now()}`,
      type: "image",
      x: Math.round((this._customElementForm.canvas_width - side) / 2),
      y: Math.round((this._customElementForm.canvas_height - side) / 2),
      w: side,
      h: side,
      image: canvas.toDataURL("image/png"),
      tint: "black",
    };
    layer.objects.push(object);
    this._customSelectedObjectId = object.id;
    this._stableCustomRender();
  },

  _renderCustomLayerDesign(layers, activeLayer, selected) {
    const form = this._customElementForm;
    const inspector = selected ? `<div class="layer-inspector">
      <div class="layer-inspector-heading">
        <span><ha-icon icon="${selected.type === "text" ? "mdi:format-text" :
        selected.type === "rect" ? "mdi:rectangle-outline" :
          selected.type === "bar_gauge" ? "mdi:chart-bar" :
            selected.type === "pie" ? "mdi:chart-pie" :
              selected.type === "slider" ? "mdi:tune-horizontal" :
                selected.type === "potentiometer" || selected.type === "gauge" ? "mdi:gauge" :
                  "mdi:image-outline"
      }"></ha-icon></span>
        <div>
          <h3>Vybraný objekt</h3>
          <small>${selected.type === "text" ? "Text" :
        selected.type === "rect" ? "Tvar / Obdélník" :
          selected.type === "bar_gauge" ? "Sloupcový ukazatel" :
            selected.type === "pie" ? "Koláčový / Donut graf" :
              selected.type === "slider" ? "Posuvník / Slider" :
                selected.type === "potentiometer" || selected.type === "gauge" ? "Potenciometr / Budík" :
                  "Obrázek"
      }</small>
        </div>
      </div>

      ${selected.type === "text" ? `
        <div class="field"><label>Text</label><textarea data-layer-object="text">${this._escape(selected.text || "")}</textarea></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity"></div>
        <div class="field"><label>Velikost písma</label><input data-layer-object="font_size" type="number" min="8" max="120" value="${Number(selected.font_size || 24)}"></div>
        <label class="check-row"><input data-layer-object="bold" type="checkbox" ${selected.bold ? "checked" : ""}> Tučné písmo</label>
        <div class="field"><label>Zarovnání</label><select data-layer-object="align"><option value="left" ${selected.align === "left" ? "selected" : ""}>Vlevo</option><option value="center" ${selected.align === "center" ? "selected" : ""}>Na střed</option><option value="right" ${selected.align === "right" ? "selected" : ""}>Vpravo</option></select></div>
        ${this._renderLayerColorPalette("color", selected.color || "black", "Barva textu", ["black", "red"])}
      ` : selected.type === "rect" ? `
        ${this._renderLayerColorPalette("fill", selected.fill || "none", "Výplň", ["none", "black", "red", "white"])}
        ${this._renderLayerColorPalette("stroke", selected.stroke || "black", "Obrys", ["none", "black", "red", "white"])}
        <div class="field"><label>Tloušťka obrysu (px)</label><input data-layer-object="stroke_width" type="number" min="1" max="20" value="${Number(selected.stroke_width || 2)}"></div>
      ` : selected.type === "bar_gauge" ? `
        <div class="field"><label>Popisek / Název</label><input data-layer-object="label" value="${this._escape(selected.label || "")}" placeholder="Ukazatel"></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity. Zadejte např. temperature, battery..."></div>
        <div class="mini-grid">
          <div class="field"><label>Min hodnota</label><input data-layer-object="min_value" type="number" value="${Number(selected.min_value ?? 0)}"></div>
          <div class="field"><label>Max hodnota</label><input data-layer-object="max_value" type="number" value="${Number(selected.max_value ?? 100)}"></div>
        </div>
        <div class="field"><label>Vlastní jednotka</label><input data-layer-object="unit" value="${this._escape(selected.unit || "%")}" placeholder="%, °C, kW, bar, lx..."></div>
        <div class="field"><label>Testovací / Náhledová hodnota</label><input data-layer-object="sample_value" type="number" value="${selected.sample_value !== undefined ? selected.sample_value : ""}" placeholder="Např. 75 pro otestování polohy"></div>
        <div class="field"><label>Orientace</label><select data-layer-object="orientation"><option value="horizontal" ${selected.orientation !== "vertical" ? "selected" : ""}>Horizontální</option><option value="vertical" ${selected.orientation === "vertical" ? "selected" : ""}>Vertikální</option></select></div>
        ${this._renderLayerColorPalette("fill", selected.fill || "black", "Barva výplně", ["black", "red", "white", "none"])}
        ${this._renderLayerColorPalette("stroke", selected.stroke || "black", "Obrys", ["black", "red", "none"])}
        <label class="check-row"><input data-layer-object="show_value" type="checkbox" ${selected.show_value !== false ? "checked" : ""}> Zobrazit hodnota + jednotka</label>
      ` : selected.type === "pie" ? `
        <div class="field"><label>Popisek / Název</label><input data-layer-object="label" value="${this._escape(selected.label || "")}" placeholder="Koláčový graf"></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity. Zadejte např. humidity, percentage..."></div>
        <div class="mini-grid">
          <div class="field"><label>Min hodnota</label><input data-layer-object="min_value" type="number" value="${Number(selected.min_value ?? 0)}"></div>
          <div class="field"><label>Max hodnota</label><input data-layer-object="max_value" type="number" value="${Number(selected.max_value ?? 100)}"></div>
        </div>
        <div class="field"><label>Vlastní jednotka</label><input data-layer-object="unit" value="${this._escape(selected.unit || "%")}" placeholder="%, °C, kW, Pa..."></div>
        <div class="field"><label>Testovací / Náhledová hodnota</label><input data-layer-object="sample_value" type="number" value="${selected.sample_value !== undefined ? selected.sample_value : ""}" placeholder="Např. 65 pro vyzkoušení výseče"></div>
        <div class="field"><label>Vnitřní výřez Donut (%)</label><input data-layer-object="hole_percent" type="range" min="0" max="80" value="${Number(selected.hole_percent ?? 45)}"></div>
        ${this._renderLayerColorPalette("color", selected.color || "black", "Barva výseče", ["black", "red"])}
        <label class="check-row"><input data-layer-object="show_value" type="checkbox" ${selected.show_value !== false ? "checked" : ""}> Zobrazit hodnota v centru</label>
      ` : selected.type === "slider" ? `
        <div class="field"><label>Popisek / Název</label><input data-layer-object="label" value="${this._escape(selected.label || "")}" placeholder="Posuvník"></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity. Zadejte např. temperature, power..."></div>
        <div class="mini-grid">
          <div class="field"><label>Min hodnota</label><input data-layer-object="min_value" type="number" value="${Number(selected.min_value ?? 0)}"></div>
          <div class="field"><label>Max hodnota</label><input data-layer-object="max_value" type="number" value="${Number(selected.max_value ?? 100)}"></div>
        </div>
        <div class="field"><label>Vlastní jednotka</label><input data-layer-object="unit" value="${this._escape(selected.unit || "°C")}" placeholder="°C, %, kW, bar, lx..."></div>
        <div class="field"><label>Testovací / Náhledová hodnota</label><input data-layer-object="sample_value" type="number" value="${selected.sample_value !== undefined ? selected.sample_value : ""}" placeholder="Např. 45"></div>
        ${this._renderLayerColorPalette("color", selected.color || "black", "Barva indikátoru", ["black", "red"])}
        <label class="check-row"><input data-layer-object="show_value" type="checkbox" ${selected.show_value !== false ? "checked" : ""}> Zobrazit text s hodnotou</label>
      ` : selected.type === "potentiometer" || selected.type === "gauge" ? `
        <div class="field"><label>Popisek / Název</label><input data-layer-object="label" value="${this._escape(selected.label || "")}" placeholder="Potenciometr"></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity. Zadejte např. current, voltage..."></div>
        <div class="mini-grid">
          <div class="field"><label>Min hodnota</label><input data-layer-object="min_value" type="number" value="${Number(selected.min_value ?? 0)}"></div>
          <div class="field"><label>Max hodnota</label><input data-layer-object="max_value" type="number" value="${Number(selected.max_value ?? 100)}"></div>
        </div>
        <div class="field"><label>Vlastní jednotka</label><input data-layer-object="unit" value="${this._escape(selected.unit || "°C")}" placeholder="°C, %, kW, bar, lx, Pa, V, A..."></div>
        <div class="field"><label>Testovací / Náhledová hodnota</label><input data-layer-object="sample_value" type="number" value="${selected.sample_value !== undefined ? selected.sample_value : ""}" placeholder="Např. 80 pro vyzkoušení ručičky"></div>
        <div class="field"><label>Typ rozsahu stupnice</label><select data-layer-object="arc_mode"><option value="240" ${selected.arc_mode !== "180" && selected.arc_mode !== "360" ? "selected" : ""}>240° Budík (standard)</option><option value="180" ${selected.arc_mode === "180" ? "selected" : ""}>180° Půlkruh</option><option value="360" ${selected.arc_mode === "360" ? "selected" : ""}>360° Plný kruh</option></select></div>
        <div class="field"><label>Tloušťka rotační čáry (px)</label><input data-layer-object="stroke_width" type="number" min="2" max="20" value="${Number(selected.stroke_width || 6)}"></div>
        ${this._renderLayerColorPalette("color", selected.color || "black", "Barva budíku", ["black", "red"])}
        <label class="check-row"><input data-layer-object="show_arc" type="checkbox" ${selected.show_arc !== false ? "checked" : ""}> Plnit rotační čáru podle hodnoty</label>
        <label class="check-row"><input data-layer-object="show_needle" type="checkbox" ${selected.show_needle !== false ? "checked" : ""}> Zobrazit rotující ručičku</label>
        <label class="check-row"><input data-layer-object="show_value" type="checkbox" ${selected.show_value !== false ? "checked" : ""}> Zobrazit text s hodnotou v centru</label>
      ` : `
        ${this._renderLayerColorPalette("tint", selected.tint || "original", "Barva obrázku", ["original", "black", "red", "white"])}
        <p class="inspector-note">Původní zachová barvy nahraného obrázku. Černá, červená nebo bílá vytvoří barevnou siluetu a zachová průhlednost.</p>
      `}

      <div class="inspector-divider"><span>Poloha a velikost</span></div>
      <div class="mini-grid">${["x", "y", "w", "h"].map((key) => `<div class="field"><label>${key.toUpperCase()}</label><input data-layer-object="${key}" type="number" value="${Math.round(Number(selected[key] || 0))}"></div>`).join("")}</div>
      <button id="deleteLayerObject" class="danger"><ha-icon icon="mdi:trash-can-outline"></ha-icon>Odstranit objekt</button>
    </div>` : `<div class="layer-inspector-empty"><div><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><p>Klikněte na objekt v náhledu a upravte jej zde.</p></div></div>`;

    const layerList = layers.map((layer) => `<article class="layer-list-item ${layer.id === activeLayer?.id ? "active" : ""}" data-custom-layer="${this._escape(layer.id)}"><div class="layer-card-title"><input data-custom-layer-name="${this._escape(layer.id)}" value="${this._escape(layer.name)}" aria-label="Název vrstvy">${layer.id === activeLayer?.id ? `<span>Aktivní</span>` : ""}</div><div class="layer-card-preview"><canvas width="296" height="128" data-custom-layer-preview="${this._escape(layer.id)}"></canvas></div><div class="layer-card-actions"><button data-custom-layer-copy="${this._escape(layer.id)}" class="secondary" title="Duplikovat vrstvu"><ha-icon icon="mdi:content-copy"></ha-icon><span>Kopírovat</span></button><button data-custom-layer-delete="${this._escape(layer.id)}" class="secondary" title="Smazat vrstvu" ${layers.length <= 1 ? "disabled" : ""}><ha-icon icon="mdi:trash-can-outline"></ha-icon><span>Odstranit</span></button></div></article>`).join("");
    const designCss = `<style>
      .layer-list-item{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:10px;cursor:pointer}.layer-list-item>*{grid-column:1!important}.layer-card-title{display:flex;align-items:center;gap:6px}.layer-card-title input{width:100%;min-width:0;padding:5px 2px;font-size:12px}.layer-card-title span{padding:3px 6px;border-radius:999px;background:rgba(0,162,165,.11);color:var(--dratek-teal);font-size:8px;font-weight:900}.layer-card-preview{padding:6px;border:5px solid #eee8e8;border-radius:999px;border-radius:9px;background:#fff;box-shadow:0 4px 12px rgba(15,23,42,.1)}.layer-card-preview canvas{display:block;width:100%;height:auto;background:#fff;border:1px solid rgba(0,0,0,.14);border-radius:2px}.layer-card-actions{display:grid!important;grid-template-columns:1fr 1fr;gap:6px}.layer-card-actions button{min-width:0;min-height:31px;padding:5px;font-size:8px}.layer-card-actions button span{display:inline}.layer-card-actions ha-icon{--mdc-icon-size:15px}
      .default-icon-library{margin-top:10px;border:1px solid var(--divider-color);border-radius:10px;background:var(--secondary-background-color)}.default-icon-library summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;cursor:pointer;list-style:none}.default-icon-library summary::-webkit-details-marker{display:none}.default-icon-library summary span{display:flex;align-items:center;gap:7px}.default-icon-library summary ha-icon{color:var(--dratek-teal)}.default-icon-library summary small{color:var(--secondary-text-color);font-size:9px}.default-icon-grid{display:grid;grid-template-columns:repeat(8,minmax(52px,1fr));gap:5px;padding:0 9px 9px}.default-layer-icon{display:grid;place-items:center;gap:3px;min-width:0;min-height:54px;padding:5px;background:var(--card-background-color);color:var(--primary-text-color)}.default-layer-icon ha-icon{--mdc-icon-size:23px;color:var(--dratek-teal)}.default-layer-icon span{font-size:8px}
      .layer-toolbar button{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;font-size:11px;white-space:nowrap}
      .layer-canvas-shell{padding:clamp(18px,3vw,38px)}.layer-device-frame{display:grid;place-items:center;width:min(100%,850px);padding:clamp(14px,2.3vw,30px);border:clamp(7px,1vw,12px) solid #eee8e8;border-radius:clamp(12px,1.8vw,22px);background:#fff;box-shadow:0 14px 38px rgba(15,23,42,.17),inset 0 0 0 1px rgba(0,0,0,.04)}.layer-device-frame canvas{width:100%;max-height:min(48vh,500px);border:1px solid rgba(0,0,0,.17);box-shadow:inset 0 0 5px rgba(0,0,0,.1)}
      .layer-color-field{margin:0;padding:0;border:0}.layer-color-field legend{margin-bottom:7px;color:var(--secondary-text-color);font-size:10px;font-weight:800}.layer-color-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.layer-color-options label{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:7px;padding:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);cursor:pointer}.layer-color-options label.selected{border-color:var(--dratek-teal);box-shadow:inset 0 0 0 1px var(--dratek-teal)}.layer-color-options input{position:absolute;opacity:0;pointer-events:none}.layer-color-options small{overflow:hidden;color:var(--primary-text-color);font-size:9px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.layer-color-swatch{display:grid;place-items:center;width:28px;height:28px;border:1px solid rgba(0,0,0,.2);border-radius:7px}.layer-color-swatch.black{background:#050505}.layer-color-swatch.red{background:#dc140c}.layer-color-swatch.white{background:#fff}.layer-color-swatch.original{background:conic-gradient(#00a2a5,#ff6800,#dc140c,#111,#00a2a5);color:#fff}.layer-color-swatch.none{background:repeating-linear-gradient(135deg,#fff 0 5px,#e5e7eb 5px 10px);color:#c62828}.layer-color-swatch ha-icon{--mdc-icon-size:17px}
      @media(max-width:1050px){.default-icon-grid{grid-template-columns:repeat(4,minmax(52px,1fr))}}@media(max-width:680px){.default-icon-library summary{align-items:flex-start;flex-direction:column}.default-icon-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.layer-card-actions button span{display:none}}
    </style>`;
    return `${designCss}<div class="ha-layer-layout">
      <aside class="layer-list">
        <div class="panel-heading"><div><strong>Vrstvy</strong><small>Každá představuje jeden stav</small></div><button id="addCustomLayer" class="secondary icon-btn" title="Přidat vrstvu"><ha-icon icon="mdi:plus"></ha-icon></button></div>
        ${layerList}
      </aside>
      <main class="layer-stage">
        <div class="layer-toolbar">
          <button data-add-layer-object="text"><ha-icon icon="mdi:format-text"></ha-icon>Text</button>
          <button data-add-layer-object="rect" class="secondary"><ha-icon icon="mdi:rectangle-outline"></ha-icon>Tvar</button>
          <button data-add-layer-object="bar_gauge" class="secondary"><ha-icon icon="mdi:chart-bar"></ha-icon>Sloupec</button>
          <button data-add-layer-object="pie" class="secondary"><ha-icon icon="mdi:chart-pie"></ha-icon>Koláč</button>
          <button data-add-layer-object="slider" class="secondary"><ha-icon icon="mdi:tune-horizontal"></ha-icon>Slider</button>
          <button data-add-layer-object="potentiometer" class="secondary"><ha-icon icon="mdi:gauge"></ha-icon>Potenciometr</button>
          <button id="addLayerImage" class="secondary"><ha-icon icon="mdi:image-plus-outline"></ha-icon>Obrázek</button>
          <input id="layerImageFile" type="file" accept="image/*" hidden>
          <span>${form.canvas_width} × ${form.canvas_height} px</span>
        </div>
        <details class="default-icon-library" open>
          <summary><span><ha-icon icon="mdi:shape-plus-outline"></ha-icon><strong>Knihovna ikon</strong></span><small>Kliknutím vložíte ikonu do vrstvy</small></summary>
          <div class="default-icon-grid">${this._renderDefaultLayerIcons()}</div>
        </details>
        <div class="layer-canvas-shell">
          <div class="layer-device-frame">
            <canvas id="customLayerCanvas" width="${form.canvas_width}" height="${form.canvas_height}"></canvas>
          </div>
        </div>
        <p class="canvas-help">Objekty přetahujte myší. Přesnou polohu, velikost, barvy a rozsahy hodnot upravíte v pravém panelu.</p>
      </main>
      <aside class="layer-properties">${inspector}</aside>
    </div>`;
  },

  _renderCustomLayerRules(layers) {
    const form = this._customElementForm;
    const currentValue = this._customElementCurrentValue(form);
    const currentLayer = this._customLayerForValue(form, currentValue);
    const operators = [["is_on", "je zapnuto"], ["is_off", "je vypnuto"], ["equals", "rovná se"], ["not_equals", "nerovná se"], ["greater", "je větší než"], ["greater_equal", "je větší nebo rovno"], ["less", "je menší než"], ["less_equal", "je menší nebo rovno"], ["contains", "obsahuje"], ["time_between", "čas je v intervalu"]];
    const rules = form.condition_rules.map((rule, index) => {
      const needsValue = !["is_on", "is_off"].includes(rule.operator);
      const [timeStart = "08:00", timeEnd = "16:00"] = String(rule.value || "").split("|");
      const valueEditor = rule.operator === "time_between"
        ? `<div class="time-range-inputs"><label><span>Od</span><input type="time" data-layer-rule-time-start="${index}" value="${this._escape(timeStart || "08:00")}"></label><label><span>Do</span><input type="time" data-layer-rule-time-end="${index}" value="${this._escape(timeEnd || "16:00")}"></label></div>`
        : `<input data-layer-rule-value="${index}" value="${this._escape(rule.value || "")}" placeholder="Hodnota" ${needsValue ? "" : "disabled"}>`;
      return `<div class="layer-rule ${rule.operator === "time_between" ? "is-time-rule" : ""}"><b>${index + 1}</b><select data-layer-rule-operator="${index}">${operators.map(([value, label]) => `<option value="${value}" ${rule.operator === value ? "selected" : ""}>${label}</option>`).join("")}</select>${valueEditor}<span>zobrazí</span><select data-layer-rule-target="${index}">${layers.map((layer) => `<option value="${this._escape(layer.id)}" ${rule.layer_id === layer.id ? "selected" : ""}>${this._escape(layer.name)}</option>`).join("")}</select><button class="secondary icon-btn" data-layer-rule-delete="${index}"><ha-icon icon="mdi:close"></ha-icon></button></div>`;
    }).join("");
    return `<div class="ha-rules-layout"><section class="card rules-source"><span class="step-number">1</span><div><h3>Vyberte proměnnou nebo entitu</h3><p>Pro časový plán vyberte například <strong>sensor.time</strong> nebo pomocníka <strong>input_datetime</strong>.</p><div class="field"><label>Proměnná / entita pro porovnání</label><ha-entity-picker id="customElementEntity"></ha-entity-picker></div><div class="field"><label>Atribut entity (volitelný)</label><input data-custom-element-field="entity_attribute" value="${this._escape(form.entity_attribute || "")}" placeholder="Například temperature"></div></div></section><section class="card rules-card"><div class="rules-title"><div><span class="step-number">2</span><div><h3>Nastavte, kdy se vrstva zobrazí</h3><p>Pravidla se vyhodnocují shora dolů. Časové intervaly mohou pokračovat přes půlnoc.</p></div></div><span class="pill muted">Aktuálně: ${this._escape(currentValue || "bez hodnoty")}</span></div><div class="layer-rules">${rules}</div><div class="layer-rule-actions"><button id="addLayerRule" class="secondary" ${form.condition_rules.length >= 12 ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon>Přidat pravidlo</button><button id="addLayerTimeRule" class="secondary" ${form.condition_rules.length >= 12 ? "disabled" : ""}><ha-icon icon="mdi:clock-outline"></ha-icon>Přidat časový interval</button></div><div class="default-layer"><div><strong>Výchozí vrstva</strong><small>Když žádné pravidlo neplatí.</small></div><select data-custom-element-field="default_layer_id">${layers.map((layer) => `<option value="${this._escape(layer.id)}" ${form.default_layer_id === layer.id ? "selected" : ""}>${this._escape(layer.name)}</option>`).join("")}</select></div></section><aside class="card rule-preview"><h3>Aktuální výsledek</h3><canvas width="${form.canvas_width}" height="${form.canvas_height}" data-custom-layer-preview="${this._escape(currentLayer?.id || "")}"></canvas><strong>${this._escape(currentLayer?.name || "Bez vrstvy")}</strong><small>Hodnota entity: ${this._escape(currentValue || "—")}</small></aside></div>`;
  },

  _migrateCustomElementToLayers(element) {
    if (element?.element_type === "layered") {
      const migrated = { ...this._emptyCustomElementForm(), ...structuredClone(element) };
      migrated.layers = this._storedRecordList(migrated.layers).map((layer, index) => ({
        ...layer,
        id: String(layer.id || `layer-${Date.now()}-${index}`),
        name: String(layer.name || `Vrstva ${index + 1}`),
        objects: this._storedRecordList(layer.objects),
      }));
      migrated.condition_rules = this._storedRecordList(migrated.condition_rules);
      if (!migrated.layers.length) {
        const fallback = { id: `layer-${Date.now()}`, name: "Výchozí", objects: [] };
        migrated.layers = [fallback];
        migrated.default_layer_id = fallback.id;
      }
      if (!migrated.layers.some((layer) => layer.id === migrated.default_layer_id)) {
        migrated.default_layer_id = migrated.layers[0].id;
      }
      return migrated;
    }
    const migrated = this._emptyCustomElementForm();
    migrated.id = element?.id || "";
    migrated.name = element?.name || "";
    migrated.entity_id = element?.entity_id || "";
    migrated.entity_attribute = element?.entity_attribute || "";
    const makeLayer = (name, text, image = "") => ({
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      objects: image
        ? [{ id: `item-${Date.now()}-image`, type: "image", x: 88, y: 4, w: 120, h: 120, image }]
        : [{ id: `item-${Date.now()}-text`, type: "text", x: 28, y: 28, w: 240, h: 72, text, color: element?.color || "black", font_size: 36, bold: true, align: "center" }],
    });
    if (element?.element_type === "status") {
      const on = makeLayer("Zapnuto", `${element.on_symbol || "●"}\n${element.label || "ZAPNUTO"}`);
      const off = makeLayer("Vypnuto", `${element.off_symbol || "○"}\n${element.label || "VYPNUTO"}`);
      migrated.layers = [on, off];
      migrated.condition_rules = [{ operator: "is_on", value: "", layer_id: on.id }, { operator: "is_off", value: "", layer_id: off.id }];
      migrated.default_layer_id = off.id;
    } else {
      const layer = makeLayer(
        element?.name || "Výchozí",
        element?.sample_data || element?.label || element?.name || "Hodnota",
        element?.element_type === "icon" ? element.icon_image || "" : "",
      );
      migrated.layers = [layer];
      migrated.condition_rules = [];
      migrated.default_layer_id = layer.id;
    }
    return migrated;
  },

  _ensureLayeredCustomForm() {
    const form = this._customElementForm;
    if (form.element_type !== "layered") return;
    form.canvas_width = Math.max(128, Math.min(800, Number(form.canvas_width) || 296));
    form.canvas_height = Math.max(64, Math.min(480, Number(form.canvas_height) || 128));
    if (!Array.isArray(form.layers) || !form.layers.length) {
      const layer = { id: `layer-${Date.now()}`, name: "Výchozí", objects: [] };
      form.layers = [layer];
      form.default_layer_id = layer.id;
    }
    form.layers.forEach((layer, index) => {
      layer.id ||= `layer-${Date.now()}-${index}`;
      layer.name ||= `Vrstva ${index + 1}`;
      if (!Array.isArray(layer.objects)) layer.objects = [];
    });
    if (!form.layers.some((layer) => layer.id === form.default_layer_id)) form.default_layer_id = form.layers[0].id;
    if (!this._customActiveLayerId || !form.layers.some((layer) => layer.id === this._customActiveLayerId)) this._customActiveLayerId = form.layers[0].id;
    if (!Array.isArray(form.condition_rules)) form.condition_rules = [];
  },

  _customActiveLayer() {
    this._ensureLayeredCustomForm();
    return (this._customElementForm.layers || []).find((layer) => layer.id === this._customActiveLayerId)
      || this._customElementForm.layers?.[0] || null;
  },

  _customSelectedLayerObject() {
    return this._customActiveLayer()?.objects?.find((object) => object.id === this._customSelectedObjectId) || null;
  },

  _customLayerForValue(element, value) {
    const layers = this._storedRecordList(element.layers);
    const rule = this._storedRecordList(element.condition_rules).find((item) => this._customConditionMatches(value, item.operator || "equals", item.value || ""));
    const id = rule?.layer_id || element.default_layer_id || layers[0]?.id;
    return layers.find((layer) => layer.id === id) || layers[0] || null;
  },

  _drawCustomLayerSelection(ctx, object, scaleX = 1, scaleY = 1) {
    if (!object) return;
    const x = Number(object.x || 0), y = Number(object.y || 0);
    const w = Math.max(1, Number(object.w || 1)), h = Math.max(1, Number(object.h || 1));
    const rot = Number(object.rotation || 0);
    const box = { x, y, w, h };
    const handles = this._handles(box);

    ctx.save();
    if (rot) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.strokeStyle = "#00a2a5";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.5;

    ctx.setLineDash([4, 2]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);

    const rotHandle = handles.find((h) => h.name === "rotate");
    if (rotHandle) {
      ctx.beginPath();
      ctx.moveTo(box.x + box.w / 2, box.y);
      ctx.lineTo(rotHandle.x, rotHandle.y);
      ctx.strokeStyle = "rgba(0, 162, 165, 0.6)";
      ctx.stroke();
    }

    for (const handle of handles) {
      const isRotate = handle.name === "rotate";
      const size = isRotate ? 12 : 8;
      const half = size / 2;
      ctx.beginPath();
      if (isRotate) {
        ctx.arc(handle.x, handle.y, half, 0, Math.PI * 2);
        ctx.fillStyle = "#ff6800";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#00a2a5";
        ctx.fillRect(handle.x - half, handle.y - half, size, size);
        ctx.strokeRect(handle.x - half, handle.y - half, size, size);
      }
    }
    ctx.restore();
  },

  _drawCustomLayer(ctx, layer, width, height, sourceWidth, sourceHeight, selectedId = "", applyPreview = true) {
    const scaleX = width / Math.max(1, sourceWidth);
    const scaleY = height / Math.max(1, sourceHeight);
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.scale(scaleX, scaleY);
    for (const object of layer?.objects || []) {
      const x = Number(object.x || 0), y = Number(object.y || 0);
      const w = Math.max(1, Number(object.w || 1)), h = Math.max(1, Number(object.h || 1));
      ctx.save();
      if (object.rotation) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.translate(cx, cy);
        ctx.rotate((Number(object.rotation) * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      if (object.type === "rect") {
        if (object.fill && object.fill !== "none") {
          ctx.fillStyle = this._color(object.fill);
          ctx.fillRect(x, y, w, h);
        }
        if (object.stroke && object.stroke !== "none") {
          ctx.strokeStyle = this._color(object.stroke);
          ctx.lineWidth = Math.max(1, Number(object.stroke_width || 2));
          ctx.strokeRect(x, y, w, h);
        }
      } else if (object.type === "bar_gauge") {
        this._drawBarGauge(ctx, object, x, y, w, h);
      } else if (object.type === "pie") {
        this._drawPieChart(ctx, object, x, y, w, h);
      } else if (object.type === "slider") {
        this._drawSliderWidget(ctx, object, x, y, w, h);
      } else if (object.type === "potentiometer" || object.type === "gauge") {
        this._drawPotentiometerWidget(ctx, object, x, y, w, h);
      } else if (object.type === "image" && object.image) {
        let image = this._customImageCache.get(object.image);
        if (!image) {
          image = new Image();
          image.onload = () => this._paintCustomLayerCanvases();
          image.src = object.image;
          this._customImageCache.set(object.image, image);
        }
        if (image.complete && image.naturalWidth) this._drawTintedCanvasImage(ctx, image, x, y, w, h, object.tint || "original");
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillStyle = this._color(object.color || "black");
        ctx.font = `${object.bold ? "700" : "600"} ${Math.max(8, Number(object.font_size || 24))}px "DRATEK eInk Sans",Arial,sans-serif`;
        ctx.textAlign = object.align || "left";
        ctx.textBaseline = "alphabetic";
        const textX = object.align === "center" ? x + w / 2 : object.align === "right" ? x + w : x;
        const lines = String(object.text || "Text").split("\n");
        const lineHeight = Math.max(10, Number(object.font_size || 24) * 1.08);
        const startY = y + Math.max(0, (h - lineHeight * lines.length) / 2);
        lines.forEach((line, index) => {
          const metrics = ctx.measureText(line || " ");
          const baseline = startY + index * lineHeight + (Number(metrics.actualBoundingBoxAscent) || lineHeight * 0.8);
          ctx.fillText(line, textX, baseline, w);
        });
        ctx.restore();
      }
      ctx.restore();
    }

    if (selectedId) {
      const selectedObj = (layer?.objects || []).find((o) => o.id === selectedId);
      if (selectedObj) {
        this._drawCustomLayerSelection(ctx, selectedObj, scaleX, scaleY);
      }
    }

    ctx.restore();
    if (applyPreview) this._applyEinkPreview(ctx, width, height);
  },

  _paintCustomLayerCanvases() {
    const form = this._customElementForm;
    this.shadowRoot.querySelectorAll("canvas[data-custom-layer-preview]").forEach((canvas) => {
      const owner = canvas.dataset.customElementId
        ? this._customElements.find((element) => element.id === canvas.dataset.customElementId)
        : form;
      const layer = (owner?.layers || []).find((item) => item.id === canvas.dataset.customLayerPreview);
      this._drawCustomLayer(canvas.getContext("2d", { willReadFrequently: true }), layer, canvas.width, canvas.height, owner?.canvas_width || 296, owner?.canvas_height || 128);
    });
    const canvas = this.shadowRoot.querySelector("#customLayerCanvas");
    if (canvas) this._drawCustomLayer(canvas.getContext("2d", { willReadFrequently: true }), this._customActiveLayer(), canvas.width, canvas.height, form.canvas_width, form.canvas_height, this._customSelectedObjectId);
  },

  _addCustomLayer() {
    this._ensureLayeredCustomForm();
    const layer = { id: `layer-${Date.now()}`, name: `Vrstva ${this._customElementForm.layers.length + 1}`, objects: [] };
    this._customElementForm.layers.push(layer);
    this._customActiveLayerId = layer.id;
    this._customSelectedObjectId = "";
    this._stableCustomRender();
  },

  _duplicateCustomLayer(layerId) {
    const source = this._customElementForm.layers.find((layer) => layer.id === layerId);
    if (!source) return;
    const copy = structuredClone(source);
    copy.id = `layer-${Date.now()}`;
    copy.name = `${source.name} – kopie`;
    copy.objects = copy.objects.map((object, index) => ({ ...object, id: `item-${Date.now()}-${index}` }));
    this._customElementForm.layers.push(copy);
    this._customActiveLayerId = copy.id;
    this._stableCustomRender();
  },

  _deleteCustomLayer(layerId) {
    if (this._customElementForm.layers.length <= 1) return;
    this._customElementForm.layers = this._customElementForm.layers.filter((layer) => layer.id !== layerId);
    this._customElementForm.condition_rules = this._customElementForm.condition_rules.filter((rule) => rule.layer_id !== layerId);
    if (this._customElementForm.default_layer_id === layerId) this._customElementForm.default_layer_id = this._customElementForm.layers[0].id;
    this._customActiveLayerId = this._customElementForm.layers[0].id;
    this._customSelectedObjectId = "";
    this._stableCustomRender();
  },

  _deleteCustomLayerObject() {
    const layer = this._customActiveLayer();
    if (!layer || !this._customSelectedObjectId) return;
    const previousLength = layer.objects.length;
    layer.objects = layer.objects.filter((object) => object.id !== this._customSelectedObjectId);
    if (layer.objects.length === previousLength) return;
    this._customSelectedObjectId = "";
    this._customLayerDrag = null;
    this._stableCustomRender();
  },

  _addCustomLayerObject(type) {
    const layer = this._customActiveLayer();
    if (!layer) return;
    let object;
    if (type === "rect") {
      object = { id: `item-${Date.now()}`, type: "rect", x: 48, y: 28, w: 120, h: 64, fill: "none", stroke: "black", stroke_width: 2 };
    } else if (type === "bar_gauge") {
      object = { id: `item-${Date.now()}`, type: "bar_gauge", x: 38, y: 28, w: 220, h: 48, label: "Ukazatel", min_value: 0, max_value: 100, unit: "%", orientation: "horizontal", fill: "black", stroke: "black", show_value: true };
    } else if (type === "pie") {
      object = { id: `item-${Date.now()}`, type: "pie", x: 98, y: 14, w: 100, h: 100, label: "Koláčový graf", min_value: 0, max_value: 100, unit: "%", hole_percent: 45, color: "black", show_value: true };
    } else if (type === "slider") {
      object = { id: `item-${Date.now()}`, type: "slider", x: 28, y: 38, w: 240, h: 52, label: "Posuvník", min_value: 0, max_value: 100, unit: "°C", color: "black", show_value: true };
    } else if (type === "potentiometer" || type === "gauge") {
      object = { id: `item-${Date.now()}`, type: "potentiometer", x: 78, y: 14, w: 140, h: 100, label: "Potenciometr", min_value: 0, max_value: 100, unit: "°C", color: "black", stroke_width: 6, arc_mode: "240", show_arc: true, show_needle: true, show_value: true };
    } else {
      object = { id: `item-${Date.now()}`, type: "text", x: 38, y: 38, w: 220, h: 52, text: "Nový text", color: "black", font_size: 28, bold: true, align: "center" };
    }
    layer.objects.push(object);
    this._customSelectedObjectId = object.id;
    this._stableCustomRender();
  },

  _setCustomLayerImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      this._customElementResult = { ok: false, error: "Obrázek může mít maximálně 10 MB." };
      this._stableCustomRender();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const layer = this._customActiveLayer();
      if (!layer) return;
      const side = Math.round(Math.min(this._customElementForm.canvas_width, this._customElementForm.canvas_height) * 0.55);
      const object = { id: `item-${Date.now()}`, type: "image", x: 18, y: 18, w: side, h: side, image: reader.result, tint: "original" };
      layer.objects.push(object);
      this._customSelectedObjectId = object.id;
      this._stableCustomRender();
    };
    reader.readAsDataURL(file);
  },

  _customLayerCanvasPoint(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this._customElementForm.canvas_width / rect.width,
      y: (event.clientY - rect.top) * this._customElementForm.canvas_height / rect.height,
    };
  },

  _onCustomLayerPointerDown(event) {
    const point = this._customLayerCanvasPoint(event);
    const layer = this._customActiveLayer();
    if (!layer) return;

    const selectedObj = this._customSelectedLayerObject();
    if (selectedObj) {
      const box = { x: Number(selectedObj.x || 0), y: Number(selectedObj.y || 0), w: Math.max(1, Number(selectedObj.w || 1)), h: Math.max(1, Number(selectedObj.h || 1)) };
      const handles = this._handles(box);
      const hitHandle = handles.find((h) => Math.hypot(point.x - h.x, point.y - h.y) <= 12);
      if (hitHandle) {
        this._customLayerDrag = {
          mode: hitHandle.name === "rotate" ? "rotate" : "resize",
          handle: hitHandle.name,
          startX: point.x,
          startY: point.y,
          initialBox: { ...box },
          initialRotation: Number(selectedObj.rotation || 0),
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        return;
      }
    }

    const clickedObj = [...(layer.objects || [])].reverse().find((item) =>
      point.x >= Number(item.x || 0) && point.x <= Number(item.x || 0) + Number(item.w || 0)
      && point.y >= Number(item.y || 0) && point.y <= Number(item.y || 0) + Number(item.h || 0)
    );

    this._customSelectedObjectId = clickedObj?.id || "";
    if (clickedObj) {
      this._customLayerDrag = {
        mode: "move",
        startX: point.x,
        startY: point.y,
        initialX: Number(clickedObj.x || 0),
        initialY: Number(clickedObj.y || 0),
      };
    } else {
      this._customLayerDrag = null;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    this._stableCustomRender();
  },

  _onCustomLayerPointerMove(event) {
    if (!this._customLayerDrag) return;
    const point = this._customLayerCanvasPoint(event);
    const object = this._customSelectedLayerObject();
    if (!object) return;

    const drag = this._customLayerDrag;
    if (drag.mode === "move") {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      object.x = Math.max(0, Math.min(this._customElementForm.canvas_width - object.w, Math.round(drag.initialX + dx)));
      object.y = Math.max(0, Math.min(this._customElementForm.canvas_height - object.h, Math.round(drag.initialY + dy)));
    } else if (drag.mode === "resize") {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      let { x, y, w, h } = drag.initialBox;
      if (drag.handle.includes("right")) w = Math.max(8, w + dx);
      if (drag.handle.includes("bottom")) h = Math.max(8, h + dy);
      if (drag.handle.includes("left")) {
        const nw = Math.max(8, w - dx);
        x = x + (w - nw);
        w = nw;
      }
      if (drag.handle.includes("top")) {
        const nh = Math.max(8, h - dy);
        y = y + (h - nh);
        h = nh;
      }
      object.x = Math.round(x);
      object.y = Math.round(y);
      object.w = Math.round(w);
      object.h = Math.round(h);
    } else if (drag.mode === "rotate") {
      const cx = drag.initialBox.x + drag.initialBox.w / 2;
      const cy = drag.initialBox.y + drag.initialBox.h / 2;
      const rad = Math.atan2(point.y - cy, point.x - cx);
      let deg = Math.round((rad * 180 / Math.PI) + 90);
      if (event.shiftKey) deg = Math.round(deg / 15) * 15;
      object.rotation = ((deg % 360) + 360) % 360;
    }
    this._paintCustomLayerCanvases();
  },

  _renderHaElementDesigner() {
    const form = this._customElementForm;
    const meta = this._customElementMeta(form.element_type);
    const isIcon = form.element_type === "icon";
    const sourceReady = isIcon ? Boolean(form.icon_image) : Boolean(form.entity_id);
    const currentValue = this._customElementCurrentValue(form);
    const result = this._customElementResult
      ? `<div class="custom-result ${this._customElementResult.ok ? "good" : "bad"}"><ha-icon icon="${this._customElementResult.ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${this._escape(this._customElementResult.message || this._customElementResult.error || "")}</div>`
      : "";
    const operators = [
      ["is_on", "Je zapnuto"],
      ["is_off", "Je vypnuto"],
      ["equals", "Rovná se"],
      ["not_equals", "Nerovná se"],
      ["greater", "Je větší než"],
      ["greater_equal", "Je větší nebo rovno"],
      ["less", "Je menší než"],
      ["less_equal", "Je menší nebo rovno"],
      ["contains", "Obsahuje text"],
      ["time_between", "Čas je v intervalu"],
    ];
    const symbols = [
      ["●", "Plný kruh"], ["○", "Prázdný kruh"], ["✓", "Zaškrtnuto"], ["✕", "Křížek"],
      ["⚡", "Energie"], ["▲", "Šipka nahoru"], ["▼", "Šipka dolů"], ["!", "Varování"],
      ["■", "Plný čtverec"], ["□", "Prázdný čtverec"],
    ];
    const symbolOptions = (selected) => symbols.map(([symbol, name]) => `<option value="${this._escape(symbol)}" ${symbol === selected ? "selected" : ""}>${this._escape(symbol)} · ${name}</option>`).join("");
    const rules = Array.isArray(form.condition_rules) ? form.condition_rules : [];
    const ruleEditor = `<div class="condition-designer">
      <div class="condition-head"><div><strong>Pravidla signalizace</strong><small>Vyhodnocují se shora dolů. Použije se první splněné pravidlo.</small></div><span class="pill muted">Aktuální hodnota: ${this._escape(currentValue || "—")}</span></div>
      <div class="condition-templates"><button class="secondary" data-condition-template="socket"><ha-icon icon="mdi:power-socket-eu"></ha-icon>Zásuvka ON/OFF</button><button class="secondary" data-condition-template="temperature"><ha-icon icon="mdi:thermometer-alert"></ha-icon>Teplotní limity</button><button class="secondary" data-condition-template="limit"><ha-icon icon="mdi:gauge"></ha-icon>Číselný limit</button><button class="secondary" data-condition-template="time"><ha-icon icon="mdi:clock-outline"></ha-icon>Denní čas</button></div>
      <details class="custom-advanced condition-details">
      <summary>Upravit jednotlivá pravidla (${rules.length})</summary>
      <div class="condition-rules">${rules.map((rule, index) => {
      const needsValue = !["is_on", "is_off"].includes(rule.operator);
      const [timeStart = "08:00", timeEnd = "16:00"] = String(rule.value || "").split("|");
      const valueEditor = rule.operator === "time_between"
        ? `<div class="field"><label>Časový interval</label><div class="time-range-inputs"><label><span>Od</span><input type="time" data-condition-time-start="${index}" value="${this._escape(timeStart)}"></label><label><span>Do</span><input type="time" data-condition-time-end="${index}" value="${this._escape(timeEnd)}"></label></div></div>`
        : `<div class="field ${needsValue ? "" : "condition-unused"}"><label>Porovnat s</label><input data-condition-value="${index}" value="${this._escape(rule.value || "")}" ${needsValue ? "" : "disabled"} placeholder="Například 25"></div>`;
      const matches = this._customConditionMatches(currentValue, rule.operator || "equals", rule.value || "");
      return `<article class="condition-rule ${matches ? "matches" : ""}">
          <span class="condition-order">${index + 1}</span>
          <div class="field"><label>Podmínka</label><select data-condition-operator="${index}">${operators.map(([value, label]) => `<option value="${value}" ${value === rule.operator ? "selected" : ""}>${label}</option>`).join("")}</select></div>
          ${valueEditor}
          <div class="field"><label>Zobrazit ikonu</label><select data-condition-symbol="${index}">${symbolOptions(rule.symbol || "●")}</select></div>
          <button class="secondary icon-btn condition-remove" data-condition-remove="${index}" title="Odstranit pravidlo"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
          ${matches ? `<span class="condition-match"><ha-icon icon="mdi:check-circle"></ha-icon>Právě platí</span>` : ""}
        </article>`;
    }).join("")}</div>
      <div class="condition-footer"><button id="addConditionRule" class="secondary"><ha-icon icon="mdi:plus"></ha-icon>Přidat pravidlo</button><div class="field"><label>Ikona, když neplatí žádné pravidlo</label><select data-custom-element-field="default_symbol">${symbolOptions(form.default_symbol || "?")}<option value="?" ${form.default_symbol === "?" ? "selected" : ""}>? · Neznámý stav</option></select></div></div>
      </details>
    </div>`;
    const graphEditor = `<div class="ha-module-card">
      <div class="ha-module-title"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon><div><strong>Nastavení grafu</strong><small>Graf se automaticky překreslí při změně vybrané entity.</small></div></div>
      <div class="row"><div class="field"><label>Zdroj bodů grafu</label><select data-custom-element-field="history_mode"><option value="rolling" ${form.history_mode !== "attribute" ? "selected" : ""}>Postupně ukládat změny senzoru</option><option value="attribute" ${form.history_mode === "attribute" ? "selected" : ""}>Použít číselný seznam z atributu</option></select></div><div class="field"><label>Počet bodů</label><input data-custom-element-field="history_points" type="number" min="2" max="96" value="${Number(form.history_points || 24)}"></div></div>
      <div class="row"><div class="field"><label>Typ grafu</label><select data-custom-element-field="chart_type"><option value="line" ${form.chart_type === "line" ? "selected" : ""}>Spojnicový</option><option value="bar" ${form.chart_type === "bar" ? "selected" : ""}>Sloupcový</option><option value="area" ${form.chart_type === "area" ? "selected" : ""}>Plošný</option></select></div><div class="field"><label>Aktuální hodnota entity</label><input value="${this._escape(currentValue || "—")}" disabled></div></div>
      ${form.history_mode === "attribute" ? `<div class="ha-hint"><ha-icon icon="mdi:information-outline"></ha-icon>Vyberte atribut, který obsahuje pole čísel, například <code>[1.2, 1.8, 1.4]</code>.</div>` : `<div class="ha-hint"><ha-icon icon="mdi:history"></ha-icon>Integrace si bude pamatovat posledních ${Number(form.history_points || 24)} rozdílných hodnot po dobu běhu Home Assistantu.</div>`}
    </div>`;
    return `<div class="custom-elements-page ha-elements-page">
      <section class="card custom-elements-hero"><div><span class="eyebrow">Designer rozhraní Home Assistantu</span><h2>Vlastní dynamické prvky displeje</h2><p>Vyberte entitu a vytvořte graf, hodnotu nebo stavovou signalizaci. Bez externího API a bez psaní šablon.</p></div><span class="custom-hero-icon"><ha-icon icon="mdi:home-assistant"></ha-icon></span></section>
      ${result}
      <div class="custom-elements-layout">
        <section class="card custom-builder">
          <div class="section-title"><div><h2>${form.id ? "Upravit prvek" : "Nový prvek"}</h2><div class="subtitle">${this._escape(meta.description)}</div></div><button id="customElementNew" class="secondary"><ha-icon icon="mdi:plus"></ha-icon>Nový</button></div>
          <div class="ha-wizard-progress"><span class="done"><b>1</b>Typ</span><span class="${sourceReady ? "done" : "active"}"><b>2</b>${isIcon ? "Obrázek" : "Entita"}</span><span class="${sourceReady ? "active" : ""}"><b>3</b>Chování</span><span><b>4</b>Vzhled</span></div>
          <div class="ux-step"><div class="ux-step-title"><b>1</b><div><strong>Co chcete vytvořit?</strong><small>Vyberte pouze jeden typ prvku.</small></div></div><div class="custom-type-grid">${["status", "value", "chart", "icon"].map((type) => { const item = this._customElementMeta(type); return `<button class="custom-type ${form.element_type === type ? "selected" : ""}" data-custom-type="${type}"><ha-icon icon="${item.icon}"></ha-icon><span>${item.label}</span></button>`; }).join("")}</div>
          <div class="${isIcon ? "" : "row"}"><div class="field"><label>Název prvku</label><input data-custom-element-field="name" value="${this._escape(form.name)}" placeholder="${isIcon ? "Například Ikona zásuvky" : "Například Stav zásuvky"}"></div>${isIcon ? "" : `<div class="field"><label>Barva prvku</label><select data-custom-element-field="color"><option value="black" ${form.color === "black" ? "selected" : ""}>Černá</option><option value="red" ${form.color === "red" ? "selected" : ""}>Červená</option></select></div>`}</div>
          </div>
          ${isIcon ? `<div class="ha-entity-module icon-upload-module"><div class="ux-step-title"><b>2</b><div><strong>Nahrajte vlastní ikonu</strong><small>PNG, JPG, WebP nebo GIF. Obrázek se bezpečně zmenší a uloží jako PNG.</small></div></div><button type="button" id="customIconDrop" class="custom-icon-drop ${form.icon_image ? "has-image" : ""}">${form.icon_image ? `<img src="${this._escape(form.icon_image)}" alt="Nahraná ikona"><span><ha-icon icon="mdi:swap-horizontal"></ha-icon>Změnit obrázek</span>` : `<ha-icon icon="mdi:tray-arrow-down"></ha-icon><strong>Přetáhněte obrázek sem</strong><small>nebo klikněte a vyberte soubor</small>`}</button><input id="customIconFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></div>` : `<div class="ha-entity-module"><div class="ux-step-title"><b>2</b><div><strong>Vyberte zdroj z Home Assistantu</strong><small>Zásuvka, senzor, pomocník nebo jiná entita.</small></div></div><div class="field"><label>Entita</label><ha-entity-picker id="customElementEntity"></ha-entity-picker></div><details class="custom-advanced"><summary>Pokročilé: použít atribut entity</summary><div class="field"><label>Atribut entity</label><input data-custom-element-field="entity_attribute" value="${this._escape(form.entity_attribute)}" placeholder="Například temperature nebo prices"></div></details></div>`}
          <div class="ux-step-title behavior-title"><b>3</b><div><strong>Nastavte chování</strong><small>${this._escape(meta.description)}</small></div></div>
          ${isIcon ? `<div class="ha-hint value-ready"><ha-icon icon="mdi:cursor-move"></ha-icon>Po vložení vznikne čtvercový obrázkový blok. V hlavním designeru jej můžete přetahovat, otáčet a měnit tažením za rohy.</div>` : form.element_type === "status" ? ruleEditor : form.element_type === "chart" ? graphEditor : `<div class="ha-hint value-ready"><ha-icon icon="mdi:check-circle-outline"></ha-icon>Hodnota entity se zobrazí přímo a při každé změně se automaticky odešle na displej.</div>`}
          <details class="custom-advanced appearance-settings"><summary><span class="summary-step">4</span>Vzhled a velikost</summary>${isIcon ? `<div class="field"><label>Velikost čtverce <strong>${form.width_percent} %</strong></label><input data-custom-element-field="width_percent" type="range" min="10" max="100" value="${form.width_percent}"></div>` : `<div class="row"><div class="field"><label>Popisek</label><input data-custom-element-field="label" value="${this._escape(form.label)}" placeholder="Například Teplota"></div>${form.element_type === "status" ? "" : `<div class="field"><label>Jednotka</label><input data-custom-element-field="unit" value="${this._escape(form.unit)}" placeholder="°C, kWh, %"></div>`}</div>${form.element_type !== "status" ? `<div class="field"><label>Ukázková hodnota${form.element_type === "chart" ? " / počáteční data" : ""}</label><textarea data-custom-element-field="sample_data" rows="2">${this._escape(form.sample_data)}</textarea></div>` : ""}<div class="row"><div class="field"><label>Šířka <strong>${form.width_percent} %</strong></label><input data-custom-element-field="width_percent" type="range" min="10" max="100" value="${form.width_percent}"></div><div class="field"><label>Výška <strong>${form.height_percent} %</strong></label><input data-custom-element-field="height_percent" type="range" min="10" max="100" value="${form.height_percent}"></div></div>`}</details>
          <div class="custom-builder-actions sticky-save"><span>${form.id ? `Upravujete: ${this._escape(form.name)}` : "Nový prvek"}</span><button id="customElementSave" ${this._customElementBusy || !this._customElementFormValid() ? "disabled" : ""}><ha-icon icon="mdi:content-save-outline"></ha-icon>${this._customElementBusy ? "Ukládám..." : form.id ? "Uložit změny" : "Přidat do knihovny"}</button></div>
        </section>
        <aside class="custom-side">
          <section class="card custom-live-preview"><div class="section-title"><h2>Živý náhled</h2><span class="pill ${sourceReady ? "good" : "warn"}">${isIcon ? sourceReady ? "Ikona připravena" : "Bez obrázku" : sourceReady ? "Napojeno" : "Bez entity"}</span></div>${this._renderCustomElementVisual(form)}</section>
          <section class="card custom-library"><div class="section-title"><div><h2>Moje HA prvky</h2><div class="subtitle">Dostupné ve všech návrzích</div></div><span class="pill muted">${this._customElements.length}</span></div>
            ${this._customElements.length ? `<div class="custom-library-list">${this._customElements.map((element) => { const item = this._customElementMeta(element.element_type); return `<article class="custom-library-item"><div class="custom-library-head"><span><ha-icon icon="${item.icon}"></ha-icon></span><div><strong>${this._escape(element.name)}</strong><small>${item.label} · ${element.element_type === "icon" ? "obrázkový blok" : this._escape(element.entity_id || "nutno vybrat entitu")}</small></div></div>${this._renderCustomElementVisual(element)}<div class="custom-library-actions"><button data-custom-insert="${element.id}"><ha-icon icon="mdi:vector-square-plus"></ha-icon>Do designeru</button><button class="secondary" data-custom-all="${element.id}"><ha-icon icon="mdi:monitor-multiple"></ha-icon>Do všech</button><button class="secondary icon-btn" data-custom-edit="${element.id}" title="Upravit"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button class="secondary icon-btn" data-custom-delete="${element.id}" title="Smazat"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div></article>`; }).join("")}</div>` : `<div class="inspector-empty"><ha-icon icon="mdi:home-edit-outline"></ha-icon><p>Zatím nemáte žádný vlastní HA prvek.</p></div>`}
          </section>
        </aside>
      </div>
    </div>`;
  },
};
