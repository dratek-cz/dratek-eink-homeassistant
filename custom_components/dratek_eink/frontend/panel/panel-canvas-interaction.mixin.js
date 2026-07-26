export const canvasInteractionMixin = {


  _fitZoom() {
    const size = this._displaySize();
    this._zoom = Math.min(2.4, Math.max(0.55, Math.min(820 / size.width, 460 / size.height)));
  },

  _setOrientation(orientation) {
    if (!["landscape", "portrait"].includes(orientation) || orientation === this._orientation) return;
    this._pushHistory();
    const before = this._displaySize();
    const clockwise = this._orientation === "landscape" && orientation === "portrait";
    this._orientation = orientation;
    const after = this._displaySize();
    if (before.width !== after.width || before.height !== after.height) {
      this._rotateDesignLayout(before, clockwise);
    }
    this._selectedIds = [];
    this._fitZoom();
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _rotateDesignLayout(before, clockwise = true) {
    this._objects = this._objects.map((object) => {
      const next = { ...object };
      if (next.type === "line") {
        const rotatePoint = clockwise ? this._rotatePointClockwise.bind(this) : this._rotatePointCounterClockwise.bind(this);
        const start = rotatePoint({ x: Number(next.x || 0), y: Number(next.y || 0) }, before);
        const end = rotatePoint({ x: Number(next.x2 || 0), y: Number(next.y2 || 0) }, before);
        next.x = this._snapValue(start.x);
        next.y = this._snapValue(start.y);
        next.x2 = this._snapValue(end.x);
        next.y2 = this._snapValue(end.y);
        return next;
      }
      const x = Number(next.x || 0);
      const y = Number(next.y || 0);
      const w = Math.max(1, Number(next.w || 1));
      const h = Math.max(1, Number(next.h || 1));
      next.x = this._snapValue(clockwise ? before.height - y - h : y);
      next.y = this._snapValue(clockwise ? x : before.width - x - w);
      next.w = this._snapValue(h);
      next.h = this._snapValue(w);
      next.rotation = (Number(next.rotation || 0) + (clockwise ? 90 : 270)) % 360;
      return next;
    });
  },

  _rotatePointClockwise(point, before) {
    return { x: before.height - point.y, y: point.x };
  },

  _rotatePointCounterClockwise(point, before) {
    return { x: point.y, y: before.width - point.x };
  },

  _scaleDesign(before, after) {
    if (!before.width || !before.height) return;
    const sx = after.width / before.width;
    const sy = after.height / before.height;
    const textScale = Math.max(0.5, Math.min(2, (sx + sy) / 2));
    this._objects = this._objects.map((object) => {
      const next = { ...object };
      for (const key of ["x", "w", "x2"]) if (Number.isFinite(Number(next[key]))) next[key] = Math.max(0, Math.round(Number(next[key]) * sx));
      for (const key of ["y", "h", "y2"]) if (Number.isFinite(Number(next[key]))) next[key] = Math.max(0, Math.round(Number(next[key]) * sy));
      if (Number.isFinite(Number(next.fontSize))) next.fontSize = Math.max(6, Math.round(Number(next.fontSize) * textScale));
      if (next.type === "qr") {
        const side = Math.max(12, Math.min(next.w || 12, next.h || 12));
        next.w = side;
        next.h = side;
      }
      return next;
    });
  },

  _status() {
    if (this._error) return { cls: "bad", text: "Chyba" };
    if (!this._result) return { cls: "muted", text: "Cekam na scan" };
    if (this._result.devices.length > 0) return { cls: "good", text: `Nalezeno ${this._result.devices.length} displeju` };
    if (this._result.scanner_count === 0 && !this._gateways.some((gateway) => gateway.status?.ok)) return { cls: "bad", text: "Neni dostupna BLE cesta" };
    if (this._result.devices.length === 0) return { cls: "warn", text: "Bluetooth funguje, DRATEK eInk nenalezen" };
    return { cls: "good", text: "Bluetooth je pripraven" };
  },

  _selectedObject() {
    if (this._selectedIds.length !== 1) return null;
    return this._objects.find((object) => object.id === this._selectedIds[0]) || null;
  },

  _deleteSelected() {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    const selected = new Set(this._selectedIds);
    for (const object of this._objects.filter((object) => selected.has(object.id))) {
      if (object.variableName) delete this._variables[object.variableName];
    }
    this._objects = this._objects.filter((object) => !selected.has(object.id));
    this._selectedIds = [];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _duplicateSelected() {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    const selected = new Set(this._selectedIds);
    const copies = this._objects.filter((object) => selected.has(object.id)).map(({ _img, ...object }) => {
      const copy = {
        ...structuredClone(object),
        id: `obj-${this._nextId++}`,
        x: this._snapValue((object.x || 0) + 10),
        y: this._snapValue((object.y || 0) + 10),
        x2: object.x2 === undefined ? undefined : this._snapValue(object.x2 + 10),
        y2: object.y2 === undefined ? undefined : this._snapValue(object.y2 + 10),
      };
      if (copy.variable && copy.variableName) {
        copy.variableName = this._uniqueVariableName(copy.variableName, copy.id);
        this._variables[copy.variableName] = copy.type === "chart" ? (copy.data || "") : (copy.text || "");
      }
      return copy;
    });
    this._objects.push(...copies);
    this._selectedIds = copies.map((object) => object.id);
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _moveLayer(direction) {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    const selected = new Set(this._selectedIds);
    const moving = this._objects.filter((object) => selected.has(object.id));
    const rest = this._objects.filter((object) => !selected.has(object.id));
    this._objects = direction === "front" ? [...rest, ...moving] : [...moving, ...rest];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _rotateSelected() {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.rotation = (Number(object.rotation || 0) + 90) % 360;
    }
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _mirrorSelected() {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.flipH = !object.flipH;
    }
    this._paint();
    this._scheduleDraftSave();
  },

  _toggleInvertColors() {
    this._pushHistory();
    this._invertColors = !this._invertColors;
    this._toolsMenuOpen = false;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _setBackgroundColor(color) {
    if (!["white", "black", "red"].includes(color) || color === this._backgroundColor) return;
    this._pushHistory();
    this._backgroundColor = color;
    this._toolsMenuOpen = false;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _moveLayerStep(id, direction) {
    const index = this._objects.findIndex((object) => object.id === id);
    const target = direction === "front" ? index + 1 : index - 1;
    if (index < 0 || target < 0 || target >= this._objects.length) return;
    this._pushHistory();
    [this._objects[index], this._objects[target]] = [this._objects[target], this._objects[index]];
    this._selectedIds = [id];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _alignSelected(mode) {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    const size = this._displaySize();
    const selected = this._objects.filter((item) => this._selectedIds.includes(item.id));

    if (mode === "distributeH" || mode === "distributeV") {
      if (selected.length < 3) return;
      if (mode === "distributeH") {
        selected.sort((a, b) => a.x - b.x);
        const minX = selected[0].x;
        const maxX = selected[selected.length - 1].x;
        const totalW = selected.slice(0, -1).reduce((sum, obj) => sum + (obj.w || 10), 0);
        const gap = (maxX - minX - totalW + (selected[selected.length - 1].w || 10)) / (selected.length - 1);
        let currX = minX;
        for (let i = 0; i < selected.length; i++) {
          selected[i].x = Math.round(currX);
          currX += (selected[i].w || 10) + gap;
        }
      } else {
        selected.sort((a, b) => a.y - b.y);
        const minY = selected[0].y;
        const maxY = selected[selected.length - 1].y;
        const totalH = selected.slice(0, -1).reduce((sum, obj) => sum + (obj.h || 10), 0);
        const gap = (maxY - minY - totalH + (selected[selected.length - 1].h || 10)) / (selected.length - 1);
        let currY = minY;
        for (let i = 0; i < selected.length; i++) {
          selected[i].y = Math.round(currY);
          currY += (selected[i].h || 10) + gap;
        }
      }
    } else {
      for (const object of selected) {
        const box = this._box(object);
        const oldX = box.x;
        const oldY = box.y;
        if (mode === "left") object.x = 0;
        if (mode === "center") object.x = Math.round((size.width - box.w) / 2);
        if (mode === "right") object.x = Math.round(size.width - box.w);
        if (mode === "top") object.y = 0;
        if (mode === "middle") object.y = Math.round((size.height - box.h) / 2);
        if (mode === "bottom") object.y = Math.round(size.height - box.h);
        if (object.type === "line") {
          const dx = object.x - oldX;
          const dy = object.y - oldY;
          object.x2 += dx;
          object.y2 += dy;
        }
      }
    }
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _snapValue(value) {
    const step = Number(this._snapStep || 5);
    return this._snap ? Math.round(value / step) * step : Math.round(value);
  },

  _canvasPoint(event) {
    const canvas = this.shadowRoot.querySelector("#editor");
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
    };
  },

  _hitTest(point) {
    for (let i = this._objects.length - 1; i >= 0; i--) {
      const object = this._objects[i];
      const box = this._box(object);
      if (point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) return object;
    }
    return null;
  },

  _handleAt(point, object) {
    const box = this._box(object);
    const radius = Math.max(8, 16 / this._zoom);
    return this._handles(box).find((handle) => Math.abs(point.x - handle.x) <= radius && Math.abs(point.y - handle.y) <= radius);
  },

  _handleHitTest(point) {
    const selected = this._objects.filter((object) => this._selectedIds.includes(object.id)).reverse();
    const others = [...this._objects].reverse().filter((object) => !this._selectedIds.includes(object.id));
    for (const object of [...selected, ...others]) {
      const handle = this._handleAt(point, object);
      if (handle) return { object, handle };
    }
    return null;
  },

  _onPointerDown(event) {
    const point = this._canvasPoint(event);
    const handleHit = this._handleHitTest(point);
    const object = handleHit ? handleHit.object : this._hitTest(point);
    if (!object) {
      const baseIds = event.shiftKey ? [...this._selectedIds] : [];
      this._selectedIds = baseIds;
      this._drag = { mode: "marquee", start: point, current: point, baseIds };
      event.preventDefault();
      this._paint();
      return;
    }
    if (event.shiftKey) {
      this._selectedIds = this._selectedIds.includes(object.id)
        ? this._selectedIds.filter((id) => id !== object.id)
        : [...this._selectedIds, object.id];
    } else if (!this._selectedIds.includes(object.id)) {
      this._selectedIds = [object.id];
    }
    const handle = handleHit && handleHit.object.id === object.id ? handleHit.handle : this._handleAt(point, object);
    this._drag = {
      mode: handle ? "resize" : "move",
      handle: handle ? handle.name : "",
      start: point,
      historyPushed: false,
      snapshots: this._objects.filter((item) => this._selectedIds.includes(item.id)).map((item) => ({ ...item })),
    };
    event.preventDefault();
    this._render();
    this._paint();
  },

  _onPointerMove(event) {
    if (!this._drag) {
      this._updateCursor(event);
      return;
    }
    const point = this._canvasPoint(event);
    if (this._drag.mode === "marquee") {
      this._drag.current = point;
      const left = Math.min(this._drag.start.x, point.x);
      const top = Math.min(this._drag.start.y, point.y);
      const right = Math.max(this._drag.start.x, point.x);
      const bottom = Math.max(this._drag.start.y, point.y);
      const hits = this._objects.filter((object) => {
        const box = this._box(object);
        return box.x <= right && box.x + box.w >= left && box.y <= bottom && box.y + box.h >= top;
      }).map((object) => object.id);
      this._selectedIds = [...new Set([...this._drag.baseIds, ...hits])];
      this._paint();
      return;
    }
    const dx = point.x - this._drag.start.x;
    const dy = point.y - this._drag.start.y;
    if (!this._drag.historyPushed && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
      this._pushHistory();
      this._drag.historyPushed = true;
    }
    for (const snapshot of this._drag.snapshots) {
      const object = this._objects.find((item) => item.id === snapshot.id);
      if (!object) continue;
      if (this._drag.mode === "move") {
        object.x = this._snapValue(snapshot.x + dx);
        object.y = this._snapValue(snapshot.y + dy);
        if (object.type === "line") {
          object.x2 = this._snapValue(snapshot.x2 + dx);
          object.y2 = this._snapValue(snapshot.y2 + dy);
        }
      } else {
        this._resizeObject(object, snapshot, dx, dy, this._drag.handle);
      }
    }
    this._paint();
    this._syncProperties();
  },

  _onPointerUp() {
    const marquee = this._drag?.mode === "marquee";
    if (this._drag && !marquee) this._scheduleDraftSave();
    this._drag = null;
    if (marquee) {
      this._render();
      this._paint();
    }
  },

  _updateCursor(event) {
    const canvas = this.shadowRoot.querySelector("#editor");
    if (!canvas) return;
    const hit = this._handleHitTest(this._canvasPoint(event));
    if (!hit) {
      canvas.style.cursor = this._hitTest(this._canvasPoint(event)) ? "move" : "default";
      return;
    }
    canvas.style.cursor = hit.handle.name === "top-left" || hit.handle.name === "bottom-right" ? "nwse-resize" : "nesw-resize";
  },

  _resizeObject(object, snapshot, dx, dy, handle) {
    if (object.locked) return;
    if (handle === "rotate") {
      const cx = snapshot.x + snapshot.w / 2;
      const cy = snapshot.y + snapshot.h / 2;
      const startAngle = Math.atan2(this._drag.start.y - cy, this._drag.start.x - cx);
      const currentPoint = { x: this._drag.start.x + dx, y: this._drag.start.y + dy };
      const currentAngle = Math.atan2(currentPoint.y - cy, currentPoint.x - cx);
      let deg = Math.round(((currentAngle - startAngle) * 180 / Math.PI) / 15) * 15;
      object.rotation = (((snapshot.rotation || 0) + deg) % 360 + 360) % 360;
      return;
    }
    if (object.type === "line") {
      if (handle.includes("left")) {
        object.x = this._snapValue(snapshot.x + dx);
        object.y = this._snapValue(snapshot.y + dy);
      } else {
        object.x2 = this._snapValue(snapshot.x2 + dx);
        object.y2 = this._snapValue(snapshot.y2 + dy);
      }
      return;
    }
    let x = snapshot.x;
    let y = snapshot.y;
    let w = snapshot.w;
    let h = snapshot.h;
    if (handle.includes("right")) w = Math.max(8, snapshot.w + dx);
    if (handle.includes("bottom")) h = Math.max(8, snapshot.h + dy);
    if (handle.includes("left")) {
      x = snapshot.x + dx;
      w = Math.max(8, snapshot.w - dx);
    }
    if (handle.includes("top")) {
      y = snapshot.y + dy;
      h = Math.max(8, snapshot.h - dy);
    }
    if (object.keepRatio || object.type === "image" || object.type === "qr") {
      const ratio = snapshot.w / Math.max(1, snapshot.h);
      const anchorX = handle.includes("left") ? snapshot.x + snapshot.w : snapshot.x;
      const anchorY = handle.includes("top") ? snapshot.y + snapshot.h : snapshot.y;
      const rawMovingX = handle.includes("left") ? snapshot.x + dx : snapshot.x + snapshot.w + dx;
      const rawMovingY = handle.includes("top") ? snapshot.y + dy : snapshot.y + snapshot.h + dy;
      w = Math.max(8, Math.abs(rawMovingX - anchorX));
      h = Math.max(8, Math.abs(rawMovingY - anchorY));
      if (Math.abs(dx / Math.max(1, snapshot.w)) > Math.abs(dy / Math.max(1, snapshot.h))) h = w / ratio;
      else w = h * ratio;
      x = handle.includes("left") ? anchorX - w : anchorX;
      y = handle.includes("top") ? anchorY - h : anchorY;
    }
    object.x = this._snapValue(x);
    object.y = this._snapValue(y);
    object.w = this._snapValue(w);
    object.h = this._snapValue(h);
  },

  _drawSelection(ctx) {
    ctx.save();
    ctx.strokeStyle = "#009999";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.5;
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id) && !item.hidden)) {
      const box = this._box(object);
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.setLineDash([]);
      const handles = this._handles(box);
      const rotHandle = handles.find((h) => h.name === "rotate");
      if (rotHandle && !object.locked) {
        ctx.beginPath();
        ctx.moveTo(box.x + box.w / 2, box.y);
        ctx.lineTo(rotHandle.x, rotHandle.y);
        ctx.strokeStyle = "rgba(0, 153, 153, 0.6)";
        ctx.stroke();
      }
      for (const handle of handles) {
        if (object.locked && handle.name === "rotate") continue;
        const isRotate = handle.name === "rotate";
        const size = isRotate ? Math.max(10, 14 / this._zoom) : Math.max(7, 10 / this._zoom);
        const half = size / 2;
        ctx.beginPath();
        if (isRotate) {
          ctx.arc(handle.x, handle.y, half, 0, Math.PI * 2);
          ctx.fillStyle = "#ff6600";
          ctx.strokeStyle = "#fff";
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = object.locked ? "#f59e0b" : "#fff";
          ctx.strokeStyle = "#009999";
          ctx.fillRect(handle.x - half, handle.y - half, size, size);
          ctx.strokeRect(handle.x - half, handle.y - half, size, size);
        }
      }
    }
    if (this._drag?.mode === "marquee") {
      const x = Math.min(this._drag.start.x, this._drag.current.x);
      const y = Math.min(this._drag.start.y, this._drag.current.y);
      const w = Math.abs(this._drag.current.x - this._drag.start.x);
      const h = Math.abs(this._drag.current.y - this._drag.start.y);
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = "#009999";
      ctx.fillStyle = "rgba(0, 153, 153, 0.12)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
    ctx.restore();
  },

  _box(object) {
    if (object.type === "line") return { x: Math.min(object.x, object.x2), y: Math.min(object.y, object.y2), w: Math.abs(object.x2 - object.x), h: Math.abs(object.y2 - object.y) };
    return { x: Number(object.x || 0), y: Number(object.y || 0), w: Math.max(1, Number(object.w || 1)), h: Math.max(1, Number(object.h || 1)) };
  },

  _handles(box) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    return [
      { name: "top-left", x: box.x, y: box.y, cursor: "nwse-resize" },
      { name: "top-middle", x: cx, y: box.y, cursor: "ns-resize" },
      { name: "top-right", x: box.x + box.w, y: box.y, cursor: "nesw-resize" },
      { name: "middle-right", x: box.x + box.w, y: cy, cursor: "ew-resize" },
      { name: "bottom-right", x: box.x + box.w, y: box.y + box.h, cursor: "nwse-resize" },
      { name: "bottom-middle", x: cx, y: box.y + box.h, cursor: "ns-resize" },
      { name: "bottom-left", x: box.x, y: box.y + box.h, cursor: "nesw-resize" },
      { name: "middle-left", x: box.x, y: cy, cursor: "ew-resize" },
      { name: "rotate", x: cx, y: box.y - 18, cursor: "grab" },
    ];
  },
};
