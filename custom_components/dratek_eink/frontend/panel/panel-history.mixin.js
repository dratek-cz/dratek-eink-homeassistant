export const historyMixin = {


  _nextObjectId() {
    const ids = this._objects
      .map((object) => String(object.id || "").match(/^obj-(\d+)$/))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    return ids.length ? Math.max(...ids) + 1 : this._objects.length + 1;
  },

  _historySnapshot() {
    return {
      objects: this._objects.map(({ _img, ...object }) => structuredClone(object)),
      selectedIds: [...this._selectedIds],
      variables: structuredClone(this._variables),
      orientation: this._orientation,
      displayTransform: this._displayTransform,
      invertColors: this._invertColors,
      backgroundColor: this._backgroundColor,
      projectName: this._projectName,
      selectedProjectId: this._selectedProjectId,
      nextId: this._nextId,
    };
  },

  _pushHistory() {
    const snapshot = this._historySnapshot();
    const last = this._undoStack[this._undoStack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;
    this._undoStack.push(snapshot);
    if (this._undoStack.length > this._historyLimit) this._undoStack.shift();
    this._redoStack = [];
  },

  _restoreHistory(snapshot) {
    this._objects = structuredClone(snapshot.objects || []);
    this._selectedIds = [...(snapshot.selectedIds || [])];
    this._variables = structuredClone(snapshot.variables || {});
    this._orientation = snapshot.orientation || "landscape";
    this._displayTransform = snapshot.displayTransform || "rotate_cw";
    this._invertColors = false;
    this._backgroundColor = ["white", "black", "red"].includes(snapshot.backgroundColor) ? snapshot.backgroundColor : "white";
    this._projectName = snapshot.projectName || "Novy navrh";
    this._selectedProjectId = snapshot.selectedProjectId || "";
    this._nextId = snapshot.nextId || this._nextObjectId();
    this._fitZoom();
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _undo() {
    if (!this._undoStack.length) return;
    this._redoStack.push(this._historySnapshot());
    this._restoreHistory(this._undoStack.pop());
  },

  _redo() {
    if (!this._redoStack.length) return;
    this._undoStack.push(this._historySnapshot());
    this._restoreHistory(this._redoStack.pop());
  },

  _isTypingEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return path.some((node) => {
      const tag = String(node.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable;
    });
  },

  _onKeyDown(event) {
    if (this._isTypingEvent(event)) return;
    if (
      this._activeTab === "custom"
      && this._customWorkspaceView === "editor"
      && this._customLayerStep === "design"
      && (event.key === "Delete" || event.key === "Backspace")
      && this._customSelectedObjectId
    ) {
      event.preventDefault();
      this._deleteCustomLayerObject();
      return;
    }
    if (this._activeTab !== "designer" || !this._device()) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && this._selectedIds.length) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      this._moveSelectedByKeyboard(dx, dy);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && this._selectedIds.length) {
      event.preventDefault();
      this._deleteSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      this._undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
      event.preventDefault();
      this._redo();
    }
  },

  _moveSelectedByKeyboard(dx, dy) {
    if (!this._selectedIds.length || (!dx && !dy)) return;
    this._pushHistory();
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.x = Math.round(Number(object.x || 0) + dx);
      object.y = Math.round(Number(object.y || 0) + dy);
      if (object.type === "line") {
        object.x2 = Math.round(Number(object.x2 || 0) + dx);
        object.y2 = Math.round(Number(object.y2 || 0) + dy);
      }
    }
    this._paint();
    this._syncProperties();
    this._scheduleDraftSave();
  },
};
