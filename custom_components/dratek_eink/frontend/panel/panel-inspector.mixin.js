export const inspectorMixin = {


  _bind() {
    this.shadowRoot.querySelector("#scan")?.addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#resetDevicesView")?.addEventListener("click", () => {
      this._deviceSearchQuery = "";
      this._scan();
    });
    this.shadowRoot.querySelector("#deviceSearch")?.addEventListener("input", (event) => {
      this._deviceSearchQuery = event.target.value;
      this._renderKeepingSearchFocus();
    });
    this.shadowRoot.querySelector("#refreshQueue")?.addEventListener("click", () => this._loadQueue(true));
    this.shadowRoot.querySelector("#queueSearch")?.addEventListener("input", (event) => {
      this._queueSearch = event.target.value;
      this._renderQueueKeepingFocus();
    });
    // Dlaždice stavu je zároveň filtr; opakovaný klik na aktivní stav ho zruší.
    this.shadowRoot.querySelectorAll("[data-queue-status]").forEach((button) => button.addEventListener("click", () => {
      const value = button.dataset.queueStatus;
      this._queueStatusFilter = this._queueStatusFilter === value ? "all" : value;
      this._render();
    }));
    this.shadowRoot.querySelectorAll("[data-queue-menu]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      this._toggleQueueMenu(button.dataset.queueMenu);
    }));
    this.shadowRoot.querySelectorAll("[data-queue-filter]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      this._setQueueFilter(button.dataset.queueFilter, button.dataset.queueValue);
    }));
    // Klik mimo rozbalený filtr ho zavře. Posluchač se váže jednou za život
    // komponenty, ne při každém _bind(), aby se nehromadil.
    if (!this._queueMenuDismissBound) {
      this._queueMenuDismissBound = true;
      this.shadowRoot.addEventListener("click", () => {
        if (!this._queueOpenMenu) return;
        this._queueOpenMenu = "";
        this._render();
        this._paint();
      });
      this.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !this._queueOpenMenu) return;
        this._queueOpenMenu = "";
        this._render();
        this._paint();
      });
    }
    const resetQueueFilters = () => {
      this._queueSearch = "";
      this._queueStatusFilter = "all";
      this._queueDeviceFilter = "all";
      this._queueTransportFilter = "all";
      this._queueOperationFilter = "all";
      this._queueOpenMenu = "";
    };
    this.shadowRoot.querySelector("#clearQueueFilters")?.addEventListener("click", () => {
      resetQueueFilters();
      this._render();
    });
    this.shadowRoot.querySelector("#resetQueueView")?.addEventListener("click", async () => {
      resetQueueFilters();
      await this._loadQueue(true);
    });
    this.shadowRoot.querySelector("#clearQueueHistory")?.addEventListener("click", async () => {
      await this._hass.callWS({ type: "dratek_eink/queue/clear" });
      await this._loadQueue(true);
    });
    this.shadowRoot.querySelector("#discoverGateways")?.addEventListener("click", () => this._discoverGateways());
    this.shadowRoot.querySelector("#refreshGateways")?.addEventListener("click", () => this._loadGateways(true));
    this.shadowRoot.querySelectorAll("[data-gateway-tab]").forEach((button) => button.addEventListener("click", () => {
      this._gatewaySubtab = button.dataset.gatewayTab;
      this._gatewayResult = null;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-add-discovered-gateway]").forEach((button) => button.addEventListener("click", () => this._addDiscoveredGateway(button.dataset.addDiscoveredGateway)));
    const syncFlashButton = () => {
      const flashButton = this.shadowRoot.querySelector("#flashGateway");
      const statusButton = this.shadowRoot.querySelector("#serialStatus");
      const wifiButton = this.shadowRoot.querySelector("#serialWifi");
      if (flashButton) flashButton.disabled = this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid;
      if (statusButton) statusButton.disabled = this._gatewayBusy || !this._flashForm.port;
      if (wifiButton) wifiButton.disabled = this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid;
    };
    this.shadowRoot.querySelector("#refreshSerialPorts")?.addEventListener("click", async () => { await this._loadSerialPorts(); this._render(); this._paint(); });
    this.shadowRoot.querySelector("#flashPort")?.addEventListener("change", (event) => {
      this._flashForm.port = event.target.value;
      syncFlashButton();
      // Nápověda pod výběrem popisuje zvolený port, takže ji musíme přepsat
      // ručně - plný _render() by tady sebral fokus z rozbaleného seznamu.
      const hint = this.shadowRoot.querySelector(".port-picker-hint");
      const port = (this._serialPorts || []).find((item) => item.device === this._flashForm.port);
      if (hint) hint.lastChild.textContent = port ? (port.description || port.name || port.device) : "Vyberte port, do kterého je deska zapojená";
    });
    this.shadowRoot.querySelectorAll("[data-flash-chip]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      this._flashForm.chip = button.dataset.flashChip;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelector("#flashSsid")?.addEventListener("input", (event) => { this._flashForm.ssid = event.target.value; syncFlashButton(); });
    this.shadowRoot.querySelector("#flashPassword")?.addEventListener("input", (event) => { this._flashForm.password = event.target.value; });
    this.shadowRoot.querySelector("#flashHostname")?.addEventListener("input", (event) => { this._flashForm.hostname = event.target.value; });
    this.shadowRoot.querySelector("#flashGateway")?.addEventListener("click", () => this._flashGateway());
    this.shadowRoot.querySelector("#serialStatus")?.addEventListener("click", () => this._serialGatewayStatus());
    this.shadowRoot.querySelector("#serialWifi")?.addEventListener("click", () => this._serialGatewayWifi());
    const openGatewayWeb = (card) => {
      const url = card.dataset.gatewayOpen;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };
    this.shadowRoot.querySelectorAll("[data-gateway-open]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (card.matches("button")) {
          event.preventDefault();
          openGatewayWeb(card);
          return;
        }
        if (event.target.closest("button,input,select,textarea,a,details,summary")) return;
        openGatewayWeb(card);
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openGatewayWeb(card);
      });
    });
    this.shadowRoot.querySelectorAll("[data-gateway-scan]").forEach((button) => button.addEventListener("click", () => this._scanGateway(button.dataset.gatewayScan)));
    this.shadowRoot.querySelectorAll("[data-gateway-ota]").forEach((button) => button.addEventListener("click", () => this._startGatewayOta(button.dataset.gatewayOta)));
    this.shadowRoot.querySelectorAll("[data-gateway-refresh]").forEach((button) => button.addEventListener("click", async () => {
      this._gatewayBusy = true;
      this._render();
      try {
        const result = await this._hass.callWS({ type: "dratek_eink/gateways/refresh", gateway_id: button.dataset.gatewayRefresh });
        const updated = result.gateways && result.gateways[0];
        if (updated) this._gateways = this._gateways.map((gateway) => gateway.id === updated.id ? updated : gateway);
      } catch (err) {
        this._gatewayResult = { ok: false, error: this._message(err) };
      } finally {
        this._gatewayBusy = false;
        this._render();
        this._paint();
      }
    }));
    this.shadowRoot.querySelectorAll("[data-gateway-delete]").forEach((button) => button.addEventListener("click", () => this._deleteGateway(button.dataset.gatewayDelete)));
    this.shadowRoot.querySelectorAll("[data-gateway-rename]").forEach((button) => button.addEventListener("click", () => {
      const gateway = this._gateways.find((item) => item.id === button.dataset.gatewayRename);
      if (!gateway) return;
      this._editingGatewayId = gateway.id;
      this._gatewayNameDraft = gateway.name || "";
      this._render();
      window.requestAnimationFrame(() => this.shadowRoot.querySelector(`[data-gateway-name-input="${gateway.id}"]`)?.focus());
    }));
    this.shadowRoot.querySelectorAll("[data-gateway-name-input]").forEach((input) => input.addEventListener("input", (event) => { this._gatewayNameDraft = event.target.value; }));
    this.shadowRoot.querySelectorAll("[data-gateway-name-save]").forEach((button) => button.addEventListener("click", () => this._renameGateway(button.dataset.gatewayNameSave)));
    this.shadowRoot.querySelectorAll("[data-gateway-name-cancel]").forEach((button) => button.addEventListener("click", () => { this._editingGatewayId = ""; this._render(); this._paint(); }));
    this.shadowRoot.querySelectorAll("[data-language]").forEach((button) => button.addEventListener("click", () => this._setUiLanguage(button.dataset.language)));
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", async () => {
      this._activeTab = button.dataset.tab;
      window.clearTimeout(this._queuePollTimer);
      this._render();
      this._paint();
      // Nová záložka se otevře od začátku. Bez toho zůstane odrolovaná pozice
      // z předchozí stránky a lišta záložek působí, jako by uskočila.
      this.shadowRoot.querySelector(".page")?.scrollIntoView({ block: "start" });
      if (this._activeTab === "devices") {
        this._scheduleAutomaticScan(60);
        await this._loadQueue(true);
      }
      if (this._activeTab === "queue") {
        await this._loadQueue(true);
      }
      if (this._activeTab === "topology") {
        await Promise.all([
          this._loadGateways(false),
          this._loadQueue(true),
        ]);
      }
      if (this._activeTab === "gateways") {
        await this._loadGateways(true);
      }
    }));
    const openDeviceInDesigner = async (address) => {
      if (!address) return;
      await this._selectDevice(address, { render: false });
      this._activeTab = "designer";
      this._render();
      this._paint();
    };
    this.shadowRoot.querySelectorAll("[data-select-device]").forEach((button) => button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openDeviceInDesigner(button.dataset.selectDevice);
    }));
    this.shadowRoot.querySelectorAll("[data-device-card-open]").forEach((card) => {
      card.addEventListener("click", async (event) => {
        if (event.target.closest("button,input,select,textarea,a,details,summary")) return;
        await openDeviceInDesigner(card.dataset.deviceCardOpen);
      });
      card.addEventListener("keydown", async (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        await openDeviceInDesigner(card.dataset.deviceCardOpen);
      });
    });
    this.shadowRoot.querySelector("#closeDisplayCatalog")?.addEventListener("click", () => {
      this._displayCatalogOpen = false;
      this._render();
      this._paint();
      window.requestAnimationFrame(() => this.shadowRoot.querySelector("#openDisplayCatalog")?.focus());
    });
    this.shadowRoot.querySelector("#displayCatalogBackdrop")?.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      this._displayCatalogOpen = false;
      this._render();
      this._paint();
    });
    this.shadowRoot.querySelectorAll("[data-device-rename]").forEach((button) => button.addEventListener("click", () => {
      const device = (this._result?.devices || []).find((item) => item.address === button.dataset.deviceRename);
      if (!device) return;
      this._editingDeviceAddress = device.address;
      this._deviceNameDraft = device.display_name || "";
      this._render();
      window.requestAnimationFrame(() => {
        const input = this.shadowRoot.querySelector(`[data-device-name-input="${device.address}"]`);
        input?.focus();
        input?.select();
      });
    }));
    this.shadowRoot.querySelectorAll("[data-device-name-input]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("input", (event) => { this._deviceNameDraft = event.target.value; });
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          this._saveDeviceName(input.dataset.deviceNameInput, input.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          this._editingDeviceAddress = "";
          this._deviceNameDraft = "";
          this._render();
          this._paint();
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-device-name-save]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const address = button.dataset.deviceNameSave;
      const input = this.shadowRoot.querySelector(`[data-device-name-input="${address}"]`);
      this._saveDeviceName(address, input?.value ?? this._deviceNameDraft);
    }));
    this.shadowRoot.querySelectorAll("[data-topology-device]").forEach((card) => {
      card.addEventListener("dragstart", (event) => {
        const address = card.dataset.topologyDevice;
        this._topologyDraggingAddress = address;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", address);
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => {
        this._topologyDraggingAddress = "";
        card.classList.remove("is-dragging");
        this.shadowRoot.querySelectorAll(".connection-group.is-drag-over").forEach((group) => group.classList.remove("is-drag-over"));
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openDeviceInDesigner(card.dataset.topologyDevice);
      });
    });
    this.shadowRoot.querySelectorAll("[data-topology-gateway]").forEach((group) => {
      group.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        group.classList.add("is-drag-over");
      });
      group.addEventListener("dragleave", (event) => {
        if (!group.contains(event.relatedTarget)) group.classList.remove("is-drag-over");
      });
      group.addEventListener("drop", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const address = this._topologyDraggingAddress || event.dataTransfer.getData("text/plain");
        this._topologyDraggingAddress = "";
        group.classList.remove("is-drag-over");
        if (address) await this._saveDeviceGateway(address, group.dataset.topologyGateway);
      });
    });
    this.shadowRoot.querySelectorAll("[data-topology-lock]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        const locked = button.dataset.topologyLocked === "1";
        const gatewayId = button.dataset.topologyLockGateway || "";
        if (!locked && !gatewayId) return;
        await this._saveDeviceGateway(button.dataset.topologyLock, locked ? "" : gatewayId);
      });
    });
    this.shadowRoot.querySelector("#sendDesign")?.addEventListener("click", () => this._sendDesign());
    this.shadowRoot.querySelector("#sendPartialDesign")?.addEventListener("click", () => this._sendPartialDesign());
    this.shadowRoot.querySelector("#sendGatewayDesign")?.addEventListener("click", () => this._sendDesignViaGateway());
    this.shadowRoot.querySelector("#refreshInterval")?.addEventListener("change", (event) => {
      this._refreshIntervalSeconds = Math.max(30, Math.min(86400, Number(event.target.value) || 60));
      this._scheduleDraftSave();
    });
    this.shadowRoot.querySelectorAll("#applyRgbLed").forEach((button) => button.addEventListener("click", () => this._applyRgbLed()));
    this.shadowRoot.querySelectorAll("[data-led-mode]").forEach((button) => button.addEventListener("click", () => {
      this._rgbLed.mode = button.dataset.ledMode;
      this._ledResult = null;
      this._scheduleDraftSave();
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-led-color]").forEach((button) => button.addEventListener("click", () => {
      this._rgbLed.color = button.dataset.ledColor;
      this._ledResult = null;
      this._scheduleDraftSave();
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("#rgbLedColor").forEach((input) => input.addEventListener("input", (event) => {
      this._rgbLed.color = event.target.value;
      this._ledResult = null;
      this._scheduleDraftSave();
      const icon = event.target.closest(".rgb-led-card, .rgb-led-compact")?.querySelector(".rgb-led-icon");
      if (icon) icon.style.setProperty("--led-color", this._rgbLed.color);
    }));
    this.shadowRoot.querySelectorAll("#rgbLedFlashTime").forEach((input) => input.addEventListener("input", (event) => {
      this._rgbLed.flashTime = Math.max(1, Math.min(255, Number(event.target.value) || 10));
      this._ledResult = null;
      this._scheduleDraftSave();
      const value = event.target.closest(".field")?.querySelector("label strong");
      if (value) value.textContent = String(this._rgbLed.flashTime);
    }));
    this.shadowRoot.querySelector("#fileMenuToggle")?.addEventListener("click", () => { this._fileMenuOpen = !this._fileMenuOpen; this._viewMenuOpen = false; this._toolsMenuOpen = false; this._layoutMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#fileMenuClose")?.addEventListener("click", () => { this._fileMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#viewMenuToggle")?.addEventListener("click", () => { this._viewMenuOpen = !this._viewMenuOpen; this._fileMenuOpen = false; this._toolsMenuOpen = false; this._layoutMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#toolsMenuToggle")?.addEventListener("click", () => { this._toolsMenuOpen = !this._toolsMenuOpen; this._fileMenuOpen = false; this._viewMenuOpen = false; this._layoutMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#layoutMenuToggle")?.addEventListener("click", () => { this._layoutMenuOpen = !this._layoutMenuOpen; this._fileMenuOpen = false; this._viewMenuOpen = false; this._toolsMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#variablesDialogOpen")?.addEventListener("click", () => { this._variablesDialogOpen = true; this._fileMenuOpen = false; this._viewMenuOpen = false; this._toolsMenuOpen = false; this._layoutMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#variablesDialogClose")?.addEventListener("click", () => { this._variablesDialogOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#openTemplateFromFile")?.addEventListener("click", () => { this._fileMenuOpen = false; this._templateDialogOpen = true; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#exportProjectFile")?.addEventListener("click", () => this._downloadProjectFile());
    this.shadowRoot.querySelector("#importProjectFile")?.addEventListener("click", () => this.shadowRoot.querySelector("#projectFileInput")?.click());
    this.shadowRoot.querySelector("#projectFileInput")?.addEventListener("change", (event) => this._importProjectFile(event.target.files?.[0]));
    this.shadowRoot.querySelector("#templateDialogClose")?.addEventListener("click", () => { this._templateDialogOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#newProject")?.addEventListener("click", () => this._newProject());
    this.shadowRoot.querySelector("#newProjectDialogClose")?.addEventListener("click", () => { this._newProjectDialogOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#createBlankProject")?.addEventListener("click", () => this._createBlankProject());
    this.shadowRoot.querySelector("#newProjectFromTemplate")?.addEventListener("click", () => { this._newProjectDialogOpen = false; this._templateDialogOpen = true; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#saveProject")?.addEventListener("click", () => { this._fileMenuOpen = false; this._saveProject(); });
    this.shadowRoot.querySelector("#loadProject")?.addEventListener("click", () => { this._fileMenuOpen = false; this._loadSelectedProject(); });
    this.shadowRoot.querySelector("#deleteProject")?.addEventListener("click", () => { this._fileMenuOpen = false; this._deleteProject(); });
    this.shadowRoot.querySelector("#projectName")?.addEventListener("input", (event) => { this._projectName = event.target.value; this._scheduleDraftSave(); });
    this.shadowRoot.querySelector("#projectSelect")?.addEventListener("change", (event) => { this._selectedProjectId = event.target.value; const project = this._projects.find((item) => item.id === this._selectedProjectId); if (project) this._projectName = project.name; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#openSymbols")?.addEventListener("click", () => { this._symbolPickerOpen = true; this._symbolSearch = ""; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#openCustomLayerSymbols")?.addEventListener("click", () => { this._symbolPickerOpen = true; this._symbolSearch = ""; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#closeSymbols")?.addEventListener("click", () => { this._symbolPickerOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#symbolSearch")?.addEventListener("input", (event) => { this._symbolSearch = event.target.value; this._renderKeepingSearchFocus(); });
    this.shadowRoot.querySelectorAll("[data-symbol-category]").forEach((button) => button.addEventListener("click", () => { this._symbolCategory = button.dataset.symbolCategory; this._render(); this._paint(); }));
    this.shadowRoot.querySelectorAll("[data-symbol]").forEach((button) => button.addEventListener("click", () => this._addSymbol(button.dataset.symbol)));
    this.shadowRoot.querySelectorAll("[data-designer-side]").forEach((button) => button.addEventListener("click", () => {
      this._designerSideView = button.dataset.designerSide;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-tool-category]").forEach((button) => button.addEventListener("click", () => {
      this._toolCategory = button.dataset.toolCategory;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelector("#addImage")?.addEventListener("click", () => this.shadowRoot.querySelector("#imageFile")?.click());
    this.shadowRoot.querySelector("#openCustomElements")?.addEventListener("click", () => { this._activeTab = "custom"; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#imageFile")?.addEventListener("change", (event) => this._addImage(event.target.files[0]));
    this.shadowRoot.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => this._addObject(button.dataset.add)));
    this.shadowRoot.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => this._applyTemplate(button.dataset.template)));
    this.shadowRoot.querySelector("#undoAction").addEventListener("click", () => this._undo());
    this.shadowRoot.querySelector("#redoAction").addEventListener("click", () => this._redo());
    this.shadowRoot.querySelector("#duplicateSelected").addEventListener("click", () => this._duplicateSelected());
    this.shadowRoot.querySelector("#deleteSelected").addEventListener("click", () => this._deleteSelected());
    this.shadowRoot.querySelector("#clearDesign").addEventListener("click", () => this._clearDesign());
    this.shadowRoot.querySelector("#rotateSelected").addEventListener("click", () => this._rotateSelected());
    this.shadowRoot.querySelector("#mirrorSelected").addEventListener("click", () => this._mirrorSelected());
    this.shadowRoot.querySelector("#alignLeft")?.addEventListener("click", () => this._alignSelected("left"));
    this.shadowRoot.querySelector("#alignCenter")?.addEventListener("click", () => this._alignSelected("center"));
    this.shadowRoot.querySelector("#alignRight")?.addEventListener("click", () => this._alignSelected("right"));
    this.shadowRoot.querySelector("#alignTop")?.addEventListener("click", () => this._alignSelected("top"));
    this.shadowRoot.querySelector("#alignMiddle")?.addEventListener("click", () => this._alignSelected("middle"));
    this.shadowRoot.querySelector("#alignBottom")?.addEventListener("click", () => this._alignSelected("bottom"));
    this.shadowRoot.querySelector("#distributeH")?.addEventListener("click", () => this._alignSelected("distributeH"));
    this.shadowRoot.querySelector("#distributeV")?.addEventListener("click", () => this._alignSelected("distributeV"));
    this.shadowRoot.querySelector("#layerFront")?.addEventListener("click", () => this._moveLayer("front"));
    this.shadowRoot.querySelector("#layerBack")?.addEventListener("click", () => this._moveLayer("back"));
    this.shadowRoot.querySelectorAll("[data-zoom-step]").forEach((button) => button.addEventListener("click", () => this._setZoom(button.dataset.zoomStep)));
    this.shadowRoot.querySelector("#btnZoomFit")?.addEventListener("click", () => { this._fitZoom(); this._render(); this._paint(); });
    this.shadowRoot.querySelector("#snap")?.addEventListener("change", (event) => { this._snap = event.target.checked; });
    this.shadowRoot.querySelector("#snapStep")?.addEventListener("change", (event) => { this._snapStep = Number(event.target.value); });
    this.shadowRoot.querySelectorAll("[data-background]").forEach((button) => button.addEventListener("click", () => this._setBackgroundColor(button.dataset.background)));
    this.shadowRoot.querySelectorAll("[data-view-scope]").forEach((button) => button.addEventListener("click", () => {
      const scope = button.dataset.viewScope;
      const mode = button.dataset.viewMode;
      if (scope === "devices") this._deviceViewMode = mode;
      else this._topologyViewMode = mode;
      this._saveUiPreference(`${scope === "devices" ? "device" : "topology"}-view-mode`, mode);
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-select]").forEach((button) => button.addEventListener("click", (event) => {
      const id = button.dataset.layerSelect;
      if (event.shiftKey) {
        this._selectedIds = this._selectedIds.includes(id) ? this._selectedIds.filter((item) => item !== id) : [...this._selectedIds, id];
      } else {
        this._selectedIds = [id];
      }
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-front]").forEach((button) => button.addEventListener("click", () => this._moveLayerStep(button.dataset.layerFront, "front")));
    this.shadowRoot.querySelectorAll("[data-layer-back]").forEach((button) => button.addEventListener("click", () => this._moveLayerStep(button.dataset.layerBack, "back")));
    this.shadowRoot.querySelectorAll("[data-layer-toggle-hide]").forEach((button) => button.addEventListener("click", () => {
      const object = this._objects.find((item) => item.id === button.dataset.layerToggleHide);
      if (object) {
        object.hidden = !object.hidden;
        this._render();
        this._paint();
        this._scheduleDraftSave();
      }
    }));
    this.shadowRoot.querySelectorAll("[data-layer-toggle-lock]").forEach((button) => button.addEventListener("click", () => {
      const object = this._objects.find((item) => item.id === button.dataset.layerToggleLock);
      if (object) {
        object.locked = !object.locked;
        this._render();
        this._paint();
        this._scheduleDraftSave();
      }
    }));
    this.shadowRoot.querySelector("#deviceSelect")?.addEventListener("change", (event) => this._selectDevice(event.target.value));
    this.shadowRoot.querySelector("#gatewaySendSelect")?.addEventListener("change", (event) => { this._selectedGatewayId = event.target.value; this._render(); this._paint(); });
    this.shadowRoot.querySelectorAll("[data-orientation]").forEach((button) => button.addEventListener("click", () => this._setOrientation(button.dataset.orientation)));
    this.shadowRoot.querySelector("#displayTransform")?.addEventListener("change", (event) => this._setDisplayTransform(event.target.value));
    this.shadowRoot.querySelectorAll("[data-variable]").forEach((input) => input.addEventListener("input", () => {
      this._variables[input.dataset.variable] = input.value;
      this._paint();
      this._scheduleDraftSave();
    }));
    const setEntityBinding = (object, rawValue) => {
      const entityId = String(rawValue || "").trim();
      if (entityId === (object.entityId || "")) return;
      this._pushHistory();
      object.entityId = entityId;
      if (!entityId) object.entityAttribute = "";
      if (entityId && ["text", "chart", "bar_gauge", "pie", "slider", "gauge", "potentiometer"].includes(object.type) && object.autoUpdate === undefined) object.autoUpdate = true;
      this._render();
      this._paint();
      this._scheduleDraftSave();
    };
    const configureEntitySelector = (selector, value) => {
      selector.hass = this._hass;
      selector.selector = { entity: {} };
      selector.value = value || "";
      selector.required = false;
    };
    this.shadowRoot.querySelectorAll("[data-variable-entity-picker]").forEach((picker) => {
      const object = this._objects.find((item) => item.id === picker.dataset.variableEntityPicker);
      if (!object) return;
      configureEntitySelector(picker, object.entityId);
      picker.addEventListener("value-changed", (event) => setEntityBinding(object, event.detail?.value));
    });
    this.shadowRoot.querySelectorAll("[data-variable-entity-attribute]").forEach((input) => {
      const object = this._objects.find((item) => item.id === input.dataset.variableEntityAttribute);
      if (!object) return;
      input.addEventListener("change", () => {
        object.entityAttribute = String(input.value || "").trim();
        this._render();
        this._paint();
        this._scheduleDraftSave();
      });
    });
    this.shadowRoot.querySelectorAll("[data-entity-picker]").forEach((picker) => {
      const object = this._objects.find((item) => item.id === picker.dataset.entityPicker);
      if (!object) return;
      configureEntitySelector(picker, object.entityId);
      picker.addEventListener("value-changed", (event) => setEntityBinding(object, event.detail?.value));
    });
    this.shadowRoot.querySelectorAll("[data-entity-input]").forEach((input) => {
      const object = this._objects.find((item) => item.id === input.dataset.entityInput);
      if (!object) return;
      input.addEventListener("change", () => setEntityBinding(object, input.value));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          setEntityBinding(object, input.value);
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-custom-type]").forEach((button) => button.addEventListener("click", () => {
      this._customElementForm.element_type = button.dataset.customType;
      this._customElementResult = null;
      if ((this._customElementInspection.collections || []).length) this._adoptCustomInspection(this._customElementInspection.collections);
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-template]").forEach((button) => button.addEventListener("click", () => {
      const templates = {
        socket: [
          { operator: "is_on", value: "", symbol: "⚡" },
          { operator: "is_off", value: "", symbol: "○" },
        ],
        temperature: [
          { operator: "greater_equal", value: "30", symbol: "▲" },
          { operator: "less_equal", value: "10", symbol: "▼" },
          { operator: "greater", value: "10", symbol: "✓" },
        ],
        limit: [
          { operator: "greater", value: "100", symbol: "!" },
          { operator: "less_equal", value: "100", symbol: "✓" },
        ],
        time: [
          { operator: "time_between", value: "06:00|12:00", symbol: "●" },
          { operator: "time_between", value: "12:00|18:00", symbol: "▲" },
          { operator: "time_between", value: "18:00|06:00", symbol: "○" },
        ],
      };
      this._customElementForm.condition_rules = structuredClone(templates[button.dataset.conditionTemplate] || []);
      this._customElementForm.default_symbol = "?";
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelector("#addConditionRule")?.addEventListener("click", () => {
      const rules = Array.isArray(this._customElementForm.condition_rules) ? this._customElementForm.condition_rules : [];
      if (rules.length < 8) rules.push({ operator: "equals", value: "", symbol: "●" });
      this._customElementForm.condition_rules = rules;
      this._stableCustomRender();
    });
    this.shadowRoot.querySelectorAll("[data-condition-remove]").forEach((button) => button.addEventListener("click", () => {
      this._customElementForm.condition_rules.splice(Number(button.dataset.conditionRemove), 1);
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-operator]").forEach((input) => input.addEventListener("change", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.conditionOperator)];
      if (rule) {
        rule.operator = input.value;
        if (input.value === "time_between" && !String(rule.value || "").includes("|")) rule.value = "08:00|16:00";
      }
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-value]").forEach((input) => input.addEventListener("input", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.conditionValue)];
      if (rule) rule.value = input.value;
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-value]").forEach((input) => input.addEventListener("change", () => {
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-time-start],[data-condition-time-end]").forEach((input) => input.addEventListener("change", () => {
      const index = Number(input.dataset.conditionTimeStart ?? input.dataset.conditionTimeEnd);
      const rule = this._customElementForm.condition_rules[index];
      if (!rule) return;
      const [start = "08:00", end = "16:00"] = String(rule.value || "").split("|");
      rule.value = input.dataset.conditionTimeStart !== undefined ? `${input.value || start}|${end}` : `${start}|${input.value || end}`;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-symbol]").forEach((input) => input.addEventListener("change", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.conditionSymbol)];
      if (rule) rule.symbol = input.value;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-custom-element-field]").forEach((input) => {
      const update = () => {
        const key = input.dataset.customElementField;
        const previous = this._customElementForm[key];
        this._customElementForm[key] = input.type === "range" ? Number(input.value) : input.value;
        if (key === "url" && previous !== input.value) {
          this._customElementFields = [];
          this._customElementInspection = { collections: [] };
        }
        const save = this.shadowRoot.querySelector("#customElementSave");
        if (save) save.disabled = this._customElementBusy || !this._customElementFormValid();
        const fetchButton = this.shadowRoot.querySelector("#customElementFetch");
        if (fetchButton) fetchButton.disabled = this._customElementBusy || !this._customElementForm.url.trim();
      };
      input.addEventListener("input", update);
      input.addEventListener("change", () => { update(); this._stableCustomRender(); });
    });
    this.shadowRoot.querySelector("#customCollectionPath")?.addEventListener("change", (event) => {
      const collection = (this._customElementInspection.collections || []).find((item) => item.path === event.target.value);
      this._customElementForm.collection_path = event.target.value;
      const fields = collection?.fields || [];
      this._customElementForm.value_field = (this._customElementForm.element_type === "chart" ? fields.find((field) => field.kind === "number") : fields[0])?.key || "";
      this._customElementForm.label_field = this._customElementForm.element_type === "chart" ? fields.find((field) => field.kind === "text")?.key || "" : "";
      this._applyCustomMappingPaths();
      this._fetchCustomElementUrl(false);
    });
    this.shadowRoot.querySelector("#customValueField")?.addEventListener("change", (event) => {
      this._customElementForm.value_field = event.target.value;
      this._applyCustomMappingPaths();
      this._fetchCustomElementUrl(false);
    });
    this.shadowRoot.querySelector("#customLabelField")?.addEventListener("change", (event) => {
      this._customElementForm.label_field = event.target.value;
      this._applyCustomMappingPaths();
      this._fetchCustomElementUrl(false);
    });
    this.shadowRoot.querySelectorAll("[data-custom-entity-picker]").forEach((customEntity) => {
      configureEntitySelector(customEntity, this._customElementForm.entity_id);
      customEntity.addEventListener("value-changed", (event) => {
        const entityId = event.detail?.value || "";
        if (entityId === this._customElementForm.entity_id) return;
        this._customElementForm.entity_id = entityId;
        this._stableCustomRender();
      });
    });
    this.shadowRoot.querySelectorAll("[data-layer-object-entity]").forEach((picker) => {
      const object = this._customSelectedLayerObject();
      if (!object || object.id !== picker.dataset.layerObjectEntity) return;
      configureEntitySelector(picker, object.entity_id || object.entityId);
      picker.addEventListener("value-changed", (event) => {
        const entityId = event.detail?.value || "";
        if (entityId === (object.entity_id || object.entityId || "")) return;
        object.entity_id = entityId;
        object.entityId = entityId;
        this._paintCustomLayerCanvases();
        this._stableCustomRender();
      });
    });
    const customIconFile = this.shadowRoot.querySelector("#customIconFile");
    const customIconDrop = this.shadowRoot.querySelector("#customIconDrop");
    customIconDrop?.addEventListener("click", () => customIconFile?.click());
    customIconFile?.addEventListener("change", (event) => this._setCustomIconFile(event.target.files?.[0]));
    customIconDrop?.addEventListener("dragover", (event) => {
      event.preventDefault();
      customIconDrop.classList.add("dragging");
    });
    customIconDrop?.addEventListener("dragleave", () => customIconDrop.classList.remove("dragging"));
    customIconDrop?.addEventListener("drop", (event) => {
      event.preventDefault();
      customIconDrop.classList.remove("dragging");
      this._setCustomIconFile(event.dataTransfer?.files?.[0]);
    });
    const createLayeredElement = () => {
      this._customElementForm = this._emptyCustomElementForm();
      this._customWorkspaceView = "editor";
      this._customLayerStep = "design";
      this._customActiveLayerId = this._customElementForm.layers[0].id;
      this._customSelectedObjectId = "";
      this._customLayerHistory = [];
      this._customLayerFuture = [];
      this._customLayerZoom = "fit";
      this._customElementResult = null;
      this._stableCustomRender();
    };
    this.shadowRoot.querySelector("#customElementNew")?.addEventListener("click", createLayeredElement);
    this.shadowRoot.querySelector("#customElementEmptyNew")?.addEventListener("click", createLayeredElement);
    this.shadowRoot.querySelector("#customBackToLibrary")?.addEventListener("click", () => {
      this._customWorkspaceView = "library";
      this._customElementResult = null;
      this._stableCustomRender();
    });
    this.shadowRoot.querySelectorAll("[data-custom-step]").forEach((button) => button.addEventListener("click", () => {
      this._customLayerStep = button.dataset.customStep;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelector("#addCustomLayer")?.addEventListener("click", () => this._addCustomLayer());
    this.shadowRoot.querySelectorAll("[data-custom-layer]").forEach((card) => card.addEventListener("click", (event) => {
      if (event.target.closest("button,input")) return;
      this._customActiveLayerId = card.dataset.customLayer;
      this._customSelectedObjectId = "";
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-custom-layer-name]").forEach((input) => input.addEventListener("input", () => {
      const layer = this._customElementForm.layers.find((item) => item.id === input.dataset.customLayerName);
      if (layer) layer.name = input.value;
    }));
    this.shadowRoot.querySelectorAll("[data-custom-layer-name]").forEach((input) => input.addEventListener("change", () => this._stableCustomRender()));
    this.shadowRoot.querySelectorAll("[data-custom-layer-copy]").forEach((button) => button.addEventListener("click", () => this._duplicateCustomLayer(button.dataset.customLayerCopy)));
    this.shadowRoot.querySelectorAll("[data-custom-layer-delete]").forEach((button) => button.addEventListener("click", () => this._deleteCustomLayer(button.dataset.customLayerDelete)));
    this.shadowRoot.querySelectorAll("[data-add-layer-object]").forEach((button) => button.addEventListener("click", () => this._addCustomLayerObject(button.dataset.addLayerObject)));
    this.shadowRoot.querySelectorAll("[data-custom-layer-action]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.customLayerAction;
      if (action === "undo") this._undoCustomLayerChange();
      else if (action === "redo") this._redoCustomLayerChange();
      else if (action === "duplicate") this._duplicateCustomLayerObject();
      else if (action === "front" || action === "back") this._arrangeCustomLayerObject(action);
      else if (["left", "center", "right", "top", "middle", "bottom"].includes(action)) this._alignCustomLayerObject(action);
      else if (action === "rotate-left" || action === "rotate-right") this._rotateCustomLayerObject(action === "rotate-left" ? -90 : 90);
      else if (action === "delete") this._deleteCustomLayerObject();
      else if (action === "clear") this._clearCustomLayer();
    }));
    this.shadowRoot.querySelectorAll("[data-custom-layer-zoom]").forEach((button) => button.addEventListener("click", () => {
      const value = button.dataset.customLayerZoom;
      this._customLayerZoom = value === "fit" ? "fit" : Number(value);
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-default-layer-icon]").forEach((button) => button.addEventListener("click", () => this._addDefaultLayerIcon(button.dataset.defaultLayerIcon)));
    this.shadowRoot.querySelector("#addLayerImage")?.addEventListener("click", () => this.shadowRoot.querySelector("#layerImageFile")?.click());
    this.shadowRoot.querySelector("#layerImageFile")?.addEventListener("change", (event) => this._setCustomLayerImage(event.target.files?.[0]));
    this.shadowRoot.querySelectorAll("[data-layer-object]").forEach((input) => {
      const update = () => {
        const object = this._customSelectedLayerObject();
        if (!object || (input.type === "radio" && !input.checked)) return;
        if (input.dataset.customHistoryCaptured !== "true") {
          this._rememberCustomLayerState();
          input.dataset.customHistoryCaptured = "true";
        }
        const key = input.dataset.layerObject;
        object[key] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
        if (input.type === "radio") {
          this._stableCustomRender();
          return;
        }
        this._paintCustomLayerCanvases();
      };
      if (input.type === "radio") input.addEventListener("change", update);
      else {
        input.addEventListener("input", update);
        input.addEventListener("change", update);
      }
    });
    this.shadowRoot.querySelector("#deleteLayerObject")?.addEventListener("click", () => this._deleteCustomLayerObject());
    const layerCanvas = this.shadowRoot.querySelector("#customLayerCanvas");
    layerCanvas?.addEventListener("pointerdown", (event) => this._onCustomLayerPointerDown(event));
    layerCanvas?.addEventListener("pointermove", (event) => this._onCustomLayerPointerMove(event));
    layerCanvas?.addEventListener("pointerup", () => { this._customLayerDrag = null; this._stableCustomRender(); });
    layerCanvas?.addEventListener("pointercancel", () => { this._customLayerDrag = null; this._stableCustomRender(); });
    this.shadowRoot.querySelector("#addLayerRule")?.addEventListener("click", () => {
      if (this._customElementForm.condition_rules.length >= 12) return;
      this._customElementForm.condition_rules.push({ operator: "equals", value: "", layer_id: this._customElementForm.layers[0]?.id || "" });
      this._stableCustomRender();
    });
    this.shadowRoot.querySelector("#addLayerTimeRule")?.addEventListener("click", () => {
      if (this._customElementForm.condition_rules.length >= 12) return;
      this._customElementForm.condition_rules.push({ operator: "time_between", value: "08:00|16:00", layer_id: this._customElementForm.layers[0]?.id || "" });
      this._stableCustomRender();
    });
    this.shadowRoot.querySelectorAll("[data-layer-rule-operator]").forEach((input) => input.addEventListener("change", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.layerRuleOperator)];
      if (rule) {
        rule.operator = input.value;
        if (input.value === "time_between" && !String(rule.value || "").includes("|")) rule.value = "08:00|16:00";
      }
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-rule-value]").forEach((input) => input.addEventListener("input", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.layerRuleValue)];
      if (rule) rule.value = input.value;
    }));
    this.shadowRoot.querySelectorAll("[data-layer-rule-value]").forEach((input) => input.addEventListener("change", () => this._stableCustomRender()));
    this.shadowRoot.querySelectorAll("[data-layer-rule-time-start],[data-layer-rule-time-end]").forEach((input) => input.addEventListener("change", () => {
      const index = Number(input.dataset.layerRuleTimeStart ?? input.dataset.layerRuleTimeEnd);
      const rule = this._customElementForm.condition_rules[index];
      if (!rule) return;
      const [start = "08:00", end = "16:00"] = String(rule.value || "").split("|");
      rule.value = input.dataset.layerRuleTimeStart !== undefined ? `${input.value || start}|${end}` : `${start}|${input.value || end}`;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-rule-target]").forEach((input) => input.addEventListener("change", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.layerRuleTarget)];
      if (rule) rule.layer_id = input.value;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-rule-delete]").forEach((button) => button.addEventListener("click", () => {
      this._customElementForm.condition_rules.splice(Number(button.dataset.layerRuleDelete), 1);
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelector("#customElementSave")?.addEventListener("click", () => this._saveCustomElement());
    this.shadowRoot.querySelector("#customElementFetch")?.addEventListener("click", () => this._fetchCustomElementUrl());
    this.shadowRoot.querySelectorAll("[data-custom-edit]").forEach((button) => button.addEventListener("click", () => {
      const element = this._customElements.find((item) => item.id === button.dataset.customEdit);
      if (!element) return;
      try {
        this._customElementForm = this._migrateCustomElementToLayers(element);
      } catch (err) {
        this._customElementResult = { ok: false, error: `Nepodařilo se načíst uložený prvek: ${this._message(err)}` };
        this._stableCustomRender();
        return;
      }
      this._customWorkspaceView = "editor";
      this._customLayerStep = "design";
      this._customActiveLayerId = this._customElementForm.layers?.[0]?.id || "";
      this._customSelectedObjectId = "";
      this._customLayerHistory = [];
      this._customLayerFuture = [];
      this._customLayerZoom = "fit";
      this._customElementFields = [];
      this._customElementInspection = { collections: [] };
      this._customElementResult = null;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-custom-delete]").forEach((button) => button.addEventListener("click", () => this._deleteCustomElement(button.dataset.customDelete)));
    this.shadowRoot.querySelectorAll("[data-custom-insert]").forEach((button) => button.addEventListener("click", () => {
      const element = this._customElements.find((item) => item.id === button.dataset.customInsert);
      if (element) this._insertCustomElement(element, true);
    }));
    this.shadowRoot.querySelectorAll("[data-custom-all]").forEach((button) => button.addEventListener("click", () => {
      const element = this._customElements.find((item) => item.id === button.dataset.customAll);
      if (element) this._applyCustomElementToAll(element);
    }));
    const canvas = this.shadowRoot.querySelector("#editor");
    canvas.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    canvas.addEventListener("pointermove", (event) => this._onPointerMove(event));
    canvas.addEventListener("pointerup", () => this._onPointerUp());
    canvas.addEventListener("pointerleave", () => this._onPointerUp());
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => input.addEventListener("input", (event) => this._readProperties(event)));
    this.shadowRoot.querySelectorAll("[data-inspector-prop]").forEach((button) => button.addEventListener("click", () => {
      this._setInspectorProperty(button.dataset.inspectorProp, button.dataset.inspectorValue);
    }));
  },

  _inspectorSection(icon, title, body, open = false) {
    return `<details class="inspector-section" ${open ? "open" : ""}><summary class="inspector-section-title"><ha-icon icon="${icon}"></ha-icon><span>${title}</span><ha-icon class="inspector-chevron" icon="mdi:chevron-down"></ha-icon></summary><div class="inspector-section-body">${body}</div></details>`;
  },

  _inspectorColor(prop, value, label, colors = ["black", "red", "white"]) {
    const names = { none: "Žádná", original: "Původní", black: "Černá", red: "Červená", white: "Bílá" };
    const selected = value || (colors.includes("none") ? "none" : "black");
    return `<div class="field"><label><ha-icon icon="mdi:palette"></ha-icon>${label}</label><div class="color-options">${colors.map((color) => `<button type="button" class="color-option ${selected === color ? "selected" : ""}" data-inspector-prop="${prop}" data-inspector-value="${color}" title="${names[color]}"><span class="color-dot ${color}"></span><span>${names[color]}</span></button>`).join("")}</div></div>`;
  },

  _inspectorSegments(prop, value, options, label) {
    return `<div class="field"><label>${label}</label><div class="segment-control">${options.map((option) => `<button type="button" class="segment-button ${String(value) === String(option.value) ? "selected" : ""}" data-inspector-prop="${prop}" data-inspector-value="${option.value}" title="${option.label}"><ha-icon icon="${option.icon}"></ha-icon></button>`).join("")}</div></div>`;
  },

  _inspectorToggle(prop, checked, icon, label) {
    return `<label class="toggle-card"><ha-icon icon="${icon}"></ha-icon><span>${label}</span><input data-prop="${prop}" type="checkbox" ${checked ? "checked" : ""}></label>`;
  },

  _setInspectorProperty(prop, value) {
    const object = this._selectedObject();
    if (!object) return;
    const nextValue = prop === "rotation" ? Number(value) : value;
    if (object[prop] === nextValue) return;
    this._pushHistory();
    object[prop] = nextValue;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _renderInspectorGeometry(object) {
    return this._inspectorSection("mdi:move-resize", "Pozice a rozměry", `
      <div class="row"><div class="field"><label><ha-icon icon="mdi:axis-x-arrow"></ha-icon>X</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label><ha-icon icon="mdi:axis-y-arrow"></ha-icon>Y</label><input data-prop="y" type="number" value="${object.y}"></div></div>
      <div class="row"><div class="field"><label><ha-icon icon="mdi:arrow-left-right"></ha-icon>Šířka</label><input data-prop="w" type="number" min="1" value="${object.w || 1}"></div><div class="field"><label><ha-icon icon="mdi:arrow-up-down"></ha-icon>Výška</label><input data-prop="h" type="number" min="1" value="${object.h || 1}"></div></div>
      ${this._inspectorSegments("rotation", Number(object.rotation || 0), [
      { value: 0, label: "Bez otočení", icon: "mdi:format-rotate-90" },
      { value: 90, label: "Otočit 90°", icon: "mdi:rotate-right" },
      { value: 180, label: "Otočit 180°", icon: "mdi:rotate-3d-variant" },
      { value: 270, label: "Otočit 270°", icon: "mdi:rotate-left" },
    ], "Rotace")}`);
  },

  _renderProperties(object) {
    if (!object) return `<div class="inspector-empty"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><p>${this._selectedIds.length > 1 ? `Vybráno ${this._selectedIds.length} objektů.` : "Vyberte objekt v návrhu."}</p></div>`;
    const geometry = this._renderInspectorGeometry(object);

    if (object.type === "text") {
      const content = this._inspectorSection("mdi:format-text", object.statusIcons ? "Signalizace" : "Text", `
        <div class="field"><label><ha-icon icon="mdi:text-box-edit-outline"></ha-icon>Obsah</label><input data-prop="text" value="${this._escape(object.text)}"></div>
        <div class="row text-font-row"><div class="field"><label><ha-icon icon="mdi:format-size"></ha-icon>Velikost</label><input data-prop="fontSize" type="number" min="${this._textMinFontSize(object)}" value="${object.autoFit !== false && Number.isFinite(Number(object._renderedFontSize)) ? object._renderedFontSize : object.fontSize}"></div><div class="field"><label><ha-icon icon="mdi:format-font"></ha-icon>Font displeje</label><input value="DRATEK eInk Sans" disabled title="Stejný vestavěný font používá náhled i backend při automatické aktualizaci."></div></div>
        ${this._inspectorSegments("textAlign", object.textAlign || "center", [{ value: "left", label: "Vlevo", icon: "mdi:format-align-left" }, { value: "center", label: "Na střed", icon: "mdi:format-align-center" }, { value: "right", label: "Vpravo", icon: "mdi:format-align-right" }], "Vodorovné zarovnání")}
        ${this._inspectorSegments("verticalAlign", object.verticalAlign || "middle", [{ value: "top", label: "Nahoru", icon: "mdi:format-vertical-align-top" }, { value: "middle", label: "Na střed", icon: "mdi:format-vertical-align-center" }, { value: "bottom", label: "Dolů", icon: "mdi:format-vertical-align-bottom" }], "Svislé zarovnání")}
        ${object.statusIcons ? `<div class="row"><div class="field"><label>Symbol zapnuto</label><input data-prop="statusOnSymbol" value="${this._escape(object.statusOnSymbol || "●")}"></div><div class="field"><label>Symbol vypnuto</label><input data-prop="statusOffSymbol" value="${this._escape(object.statusOffSymbol || "○")}"></div></div><div class="field"><label>Hodnoty zapnutého stavu</label><input data-prop="statusOnValues" value="${this._escape(object.statusOnValues || "on,true,1,open,home")}"><small>Oddělte čárkou, například on, true, open.</small></div>` : ""}`, true);
      const appearance = this._inspectorSection("mdi:palette-outline", "Vzhled", `${this._inspectorColor("color", object.color, "Barva textu")}<div class="toggle-stack">${this._inspectorToggle("bold", !!object.bold, "mdi:format-bold", "Tučné písmo")}${this._inspectorToggle("autoFit", object.autoFit !== false, "mdi:fit-to-page-outline", "Přizpůsobit text boxu")}</div>`);
      const variable = this._inspectorSection("mdi:variable", "Proměnná", `<div class="toggle-stack">${this._inspectorToggle("variable", !!object.variable, "mdi:variable-box", "Proměnný text")}</div>${object.variable ? `<div class="field" style="margin-top:10px"><label><ha-icon icon="mdi:identifier"></ha-icon>Interní název</label><input data-prop="variableName" value="${this._escape(object.variableName || "")}" placeholder="napr_teplota"><p class="inspector-help"><ha-icon icon="mdi:information-outline"></ha-icon><span>Název patří šabloně a není samostatnou entitou Home Assistantu.</span></p></div>${object.statusIcons ? "" : this._renderEntityBinding(object)}` : ""}`);
      const statusSource = object.statusIcons
        ? this._inspectorSection("mdi:database-sync-outline", "Vstup signalizace", this._renderEntityBinding(object), true)
        : "";
      return `${geometry}${content}${appearance}${variable}${statusSource}`;
    }

    if (object.type === "rect") return `${geometry}${this._inspectorSection("mdi:palette-outline", "Výplň a rámeček", `${this._inspectorColor("fill", object.fill, "Výplň", ["none", "black", "red", "white"])}${this._inspectorColor("stroke", object.stroke, "Rámeček", ["none", "black", "red"])}<div class="field"><label><ha-icon icon="mdi:border-width"></ha-icon>Síla rámečku</label><input data-prop="strokeWidth" type="number" min="0" value="${object.strokeWidth || 0}"></div>`)}`;

    if (object.type === "chart") {
      const chart = this._inspectorSection("mdi:chart-box-outline", "Graf", `
        ${this._inspectorSegments("chartType", object.chartType || "bar", [{ value: "line", label: "Spojnicový", icon: "mdi:chart-line" }, { value: "bar", label: "Sloupcový", icon: "mdi:chart-bar" }, { value: "area", label: "Plošný", icon: "mdi:chart-areaspline" }], "Typ grafu")}
        <div class="field"><label><ha-icon icon="mdi:format-title"></ha-icon>Název</label><input data-prop="chartTitle" value="${this._escape(object.chartTitle || "")}"></div>
        <div class="field"><label><ha-icon icon="mdi:code-array"></ha-icon>Data</label><textarea data-prop="data" rows="3" placeholder="2.10, 2.35, 2.18">${this._escape(object.data || "")}</textarea></div>
        <div class="field"><label><ha-icon icon="mdi:label-multiple-outline"></ha-icon>Popisky bodů</label><input data-prop="chartLabels" value="${this._escape(object.chartLabels || "")}" placeholder="00, 03, 06, 09"></div>
        <div class="row"><div class="field"><label>Osa X</label><input data-prop="xLabel" value="${this._escape(object.xLabel || "")}"></div><div class="field"><label>Osa Y</label><input data-prop="yLabel" value="${this._escape(object.yLabel || "")}"></div></div>
        <div class="row"><div class="field"><label>Časové okno (historie)</label><select data-prop="time_range_hours"><option value="1" ${Number(object.time_range_hours) === 1 ? "selected" : ""}>1 hodina</option><option value="6" ${Number(object.time_range_hours) === 6 ? "selected" : ""}>6 hodin</option><option value="24" ${Number(object.time_range_hours || 24) === 24 ? "selected" : ""}>24 hodin (1 den)</option><option value="168" ${Number(object.time_range_hours) === 168 ? "selected" : ""}>7 dní</option></select></div><div class="field"><label>Velikost textu</label><input data-prop="legendFontSize" type="number" min="6" max="18" value="${Number(object.legendFontSize || 8)}"></div></div>
        <div class="row"><div class="field"><label>Minimum</label><input data-prop="chartMin" type="number" step="any" value="${this._escape(object.chartMin ?? "")}" placeholder="Auto"></div><div class="field"><label>Maximum</label><input data-prop="chartMax" type="number" step="any" value="${this._escape(object.chartMax ?? "")}" placeholder="Auto"></div></div>`, true);
      const appearance = this._inspectorSection("mdi:palette-outline", "Barvy a zobrazení", `${this._inspectorColor("backgroundColor", object.backgroundColor || "white", "Pozadí")}${this._inspectorColor("color", object.color || "black", "Čára grafu")}${this._inspectorColor("graphColor", object.graphColor || "black", "Osy a popisky")}${object.chartType === "bar" ? this._inspectorColor("barColor", object.barColor || "red", "Sloupce") : ""}<div class="toggle-stack">${this._inspectorToggle("showAxes", object.showAxes !== false, "mdi:axis-arrow", "Zobrazit osy")}${this._inspectorToggle("showGrid", object.showGrid !== false, "mdi:grid", "Zobrazit mřížku")}${this._inspectorToggle("showValues", !!object.showValues, "mdi:numeric", "Zobrazit hodnoty")}</div>`);
      const source = this._inspectorSection("mdi:database-sync-outline", "Datový zdroj", `<div class="field"><label><ha-icon icon="mdi:identifier"></ha-icon>Název proměnné</label><input data-prop="variableName" value="${this._escape(object.variableName || "")}" placeholder="ceny_spot_24h"></div>${this._renderEntityBinding(object)}`);
      return `${geometry}${chart}${appearance}${source}`;
    }

    if (object.type === "weather") {
      const settings = this._inspectorSection("mdi:weather-partly-cloudy", "Předpověď počasí", `
        <div class="field"><label>Náhled teploty</label><input data-prop="sample_temp" value="${this._escape(object.sample_temp || "21.5")}"></div>
        <div class="field"><label>Náhled stavu</label><input data-prop="sample_value" value="${this._escape(object.sample_value || "sunny")}" placeholder="sunny, rainy, cloudy, snowy"></div>`, true);
      const appearance = this._inspectorSection("mdi:palette-outline", "Vzhled", this._inspectorColor("color", object.color || "black", "Barva ikon a textu"));
      const source = this._inspectorSection("mdi:home-assistant", "Zdroj dat počasí", this._renderEntityBinding(object));
      return `${geometry}${settings}${appearance}${source}`;
    }

    if (["bar_gauge", "pie", "slider", "gauge", "potentiometer"].includes(object.type)) {
      const isBar = object.type === "bar_gauge";
      const isPie = object.type === "pie";
      const isGauge = object.type === "gauge" || object.type === "potentiometer";
      const settings = this._inspectorSection("mdi:gauge", "Ukazatel hodnoty", `
        <div class="field"><label><ha-icon icon="mdi:label-outline"></ha-icon>Popisek</label><input data-prop="label" value="${this._escape(object.label || "")}"></div>
        <div class="row"><div class="field"><label>Minimum</label><input data-prop="min_value" type="number" step="any" value="${Number(object.min_value ?? 0)}"></div><div class="field"><label>Maximum</label><input data-prop="max_value" type="number" step="any" value="${Number(object.max_value ?? 100)}"></div></div>
        <div class="row"><div class="field"><label>Náhled hodnoty</label><input data-prop="sample_value" type="number" step="any" value="${Number(object.sample_value ?? 50)}"></div><div class="field"><label>Jednotka</label><input data-prop="unit" value="${this._escape(object.unit || "")}" placeholder="%"></div></div>
        ${isBar ? this._inspectorSegments("orientation", object.orientation || "horizontal", [{ value: "horizontal", label: "Vodorovně", icon: "mdi:arrow-left-right" }, { value: "vertical", label: "Svisle", icon: "mdi:arrow-up-down" }], "Orientace") : ""}
        ${isPie ? `<div class="field"><label>Velikost otvoru (%)</label><input data-prop="hole_percent" type="number" min="0" max="80" value="${Number(object.hole_percent ?? 45)}"></div>` : ""}
        ${isGauge ? `${this._inspectorSegments("arc_mode", object.arc_mode || "240", [{ value: "180", label: "180°", icon: "mdi:gauge-low" }, { value: "240", label: "240°", icon: "mdi:gauge" }, { value: "360", label: "360°", icon: "mdi:circle-outline" }], "Rozsah budíku")}<div class="field"><label>Síla oblouku</label><input data-prop="stroke_width" type="number" min="1" max="20" value="${Number(object.stroke_width ?? 6)}"></div>` : ""}
        <div class="toggle-stack">${this._inspectorToggle("show_value", object.show_value !== false, "mdi:numeric", "Zobrazit hodnotu")}${isGauge ? `${this._inspectorToggle("show_arc", object.show_arc !== false, "mdi:chart-arc", "Zobrazit oblouk")}${this._inspectorToggle("show_needle", object.show_needle !== false, "mdi:ray-start-arrow", "Zobrazit ručičku")}` : ""}</div>`, true);
      const appearance = this._inspectorSection("mdi:palette-outline", "Vzhled", `${this._inspectorColor(isBar ? "fill" : "color", isBar ? (object.fill || "red") : (object.color || "red"), "Aktivní barva")}${isBar ? `${this._inspectorColor("stroke", object.stroke || "black", "Rámeček", ["none", "black", "red"])}<div class="field"><label>Síla rámečku</label><input data-prop="stroke_width" type="number" min="0" max="12" value="${Number(object.stroke_width ?? 2)}"></div>` : ""}`);
      const source = this._inspectorSection("mdi:home-assistant", "Zdroj dat", this._renderEntityBinding(object));
      return `${geometry}${settings}${appearance}${source}`;
    }

    if (object.type === "line") {
      const points = this._inspectorSection("mdi:vector-line", "Koncové body", `<div class="row"><div class="field"><label>X1</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label>Y1</label><input data-prop="y" type="number" value="${object.y}"></div></div><div class="row"><div class="field"><label>X2</label><input data-prop="x2" type="number" value="${object.x2}"></div><div class="field"><label>Y2</label><input data-prop="y2" type="number" value="${object.y2}"></div></div>`);
      return `${points}${this._inspectorSection("mdi:palette-outline", "Vzhled", `${this._inspectorColor("color", object.color, "Barva čáry", ["black", "red"])}<div class="field"><label><ha-icon icon="mdi:format-line-weight"></ha-icon>Síla čáry</label><input data-prop="strokeWidth" type="number" min="1" value="${object.strokeWidth || 2}"></div>`)}`;
    }

    if (object.type === "barcode" || object.type === "qr") {
      const title = object.type === "qr" ? "QR kód" : "EAN kód";
      const data = this._inspectorSection(object.type === "qr" ? "mdi:qrcode" : "mdi:barcode", title, `<div class="field"><label><ha-icon icon="mdi:text-box-outline"></ha-icon>Data</label><input data-prop="text" value="${this._escape(object.text)}"></div>${this._inspectorColor("color", object.color || "black", "Barva kódu")}${this._inspectorColor("backgroundColor", object.backgroundColor || "white", "Pozadí kódu")}<div class="toggle-stack">${this._inspectorToggle("keepRatio", object.keepRatio !== false, "mdi:aspect-ratio", "Zachovat poměr stran")}</div>`);
      return `${geometry}${data}`;
    }

    return `${geometry}${this._inspectorSection("mdi:image-outline", "Obrázek", `${object.type === "image" ? `${this._inspectorColor("tint", object.tint || "original", "Přebarvení obrázku", ["original", "black", "red", "white"])}<div class="field"><label>Režim stínování (Dither)</label><select data-prop="dither_mode"><option value="none" ${object.dither_mode === "none" || !object.dither_mode ? "selected" : ""}>Přímý práh (Threshold)</option><option value="floyd_steinberg" ${object.dither_mode === "floyd_steinberg" ? "selected" : ""}>Floyd-Steinberg Tečkování (Pro fotky)</option></select></div>` : ""}<div class="toggle-stack">${this._inspectorToggle("keepRatio", !!object.keepRatio, "mdi:aspect-ratio", "Zachovat poměr stran")}</div><p class="inspector-help"><ha-icon icon="mdi:information-outline"></ha-icon><span>Režim Floyd-Steinberg zachovává jemné detaily a polotóny fotografií.</span></p>`)}`;
  },

  _inspectorColor(prop, value, label, colors = ["black", "red", "white"]) {
    const names = { none: "Žádná", original: "Původní", black: "Černá", red: "Červená", white: "Bílá" };
    const selected = value || (colors.includes("none") ? "none" : "black");
    return `<div class="field"><label><ha-icon icon="mdi:palette"></ha-icon>${label}</label><div class="color-options">${colors.map((color) => `<button type="button" class="color-option ${selected === color ? "selected" : ""}" data-inspector-prop="${prop}" data-inspector-value="${color}" title="${names[color]}"><span class="color-dot ${color}"></span><span>${names[color]}</span></button>`).join("")}</div></div>`;
  },

  _inspectorSegments(prop, value, options, label) {
    return `<div class="field"><label>${label}</label><div class="segment-control">${options.map((option) => `<button type="button" class="segment-button ${String(value) === String(option.value) ? "selected" : ""}" data-inspector-prop="${prop}" data-inspector-value="${option.value}" title="${option.label}"><ha-icon icon="${option.icon}"></ha-icon></button>`).join("")}</div></div>`;
  },

  _inspectorToggle(prop, checked, icon, label) {
    return `<label class="toggle-card"><ha-icon icon="${icon}"></ha-icon><span>${label}</span><input data-prop="${prop}" type="checkbox" ${checked ? "checked" : ""}></label>`;
  },

  _setInspectorProperty(prop, value) {
    const object = this._selectedObject();
    if (!object) return;
    const nextValue = prop === "rotation" ? Number(value) : value;
    if (object[prop] === nextValue) return;
    this._pushHistory();
    object[prop] = nextValue;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _readProperties(event = null) {
    const object = this._selectedObject();
    if (!object) return;
    const oldFontSize = Number(object.fontSize || 0);
    const changedProp = event && event.target ? event.target.dataset.prop : "";
    const wasVariable = !!object.variable;
    const oldVariableName = object.variableName || "";
    if (!this._propertyEditActive) {
      this._pushHistory();
      this._propertyEditActive = true;
      window.clearTimeout(this._propertyEditTimer);
    }
    window.clearTimeout(this._propertyEditTimer);
    this._propertyEditTimer = window.setTimeout(() => {
      this._propertyEditActive = false;
    }, 700);
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => {
      const key = input.dataset.prop;
      if (input.type === "checkbox") object[key] = input.checked;
      else if (["x", "y", "x2", "y2", "w", "h", "rotation", "fontSize", "minFontSize", "strokeWidth", "maxPoints", "legendFontSize", "min_value", "max_value", "sample_value", "hole_percent", "stroke_width"].includes(key)) object[key] = Number(input.value);
      else object[key] = input.value;
    });
    if (object.type === "text") {
      if (changedProp === "fontSize") {
        object.autoFit = false;
        delete object._renderedFontSize;
        const autoFitInput = this.shadowRoot.querySelector('[data-prop="autoFit"]');
        if (autoFitInput) autoFitInput.checked = false;
      }
      object.minFontSize = this._textMinFontSize(object);
      object.fontSize = Math.max(object.minFontSize, Number(object.fontSize || object.minFontSize));
      if (object.fontSize !== oldFontSize) {
        const lineCount = String(object.text || "").split("\n").length || 1;
        object.h = Math.max(Number(object.h || 1), Math.ceil(object.fontSize * 1.18 * lineCount));
      }
    }
    if (["text", "chart"].includes(object.type)) {
      if (object.type === "chart") object.variable = true;
      const defaultValue = object.type === "chart" ? (object.data || "") : (object.text || "");
      if (object.variable) {
        object.variableName = this._uniqueVariableName(object.variableName || (object.type === "chart" ? "data_grafu" : object.text) || "promenna", object.id);
        if (oldVariableName && oldVariableName !== object.variableName && this._variables[oldVariableName] !== undefined) {
          this._variables[object.variableName] = this._variables[oldVariableName];
          delete this._variables[oldVariableName];
        } else if (this._variables[object.variableName] === undefined) this._variables[object.variableName] = defaultValue;
      } else if (object.variableName) {
        delete this._variables[object.variableName];
        object.variableName = "";
      }
      if (changedProp === "variable" || wasVariable !== !!object.variable) this._render();
    }
    if (object.type === "chart") object.legendFontSize = Math.max(6, Math.min(18, Number(object.legendFontSize || 8)));
    this._paint();
    this._scheduleDraftSave();
  },

  _textMinFontSize(object = null) {
    if (object && Number.isFinite(Number(object.minFontSize))) return Math.max(10, Number(object.minFontSize));
    return this._readableMinFontSize();
  },

  _syncProperties() {
    const object = this._selectedObject();
    if (!object) return;
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => {
      const key = input.dataset.prop;
      const value = key === "fontSize" && object.autoFit !== false && Number.isFinite(Number(object._renderedFontSize))
        ? object._renderedFontSize
        : object[key];
      if (input.type === "checkbox") input.checked = !!value;
      else input.value = value ?? "";
    });
  },
};
