export const inspectorMixin = {

  _bindLazyTemplateCatalogPreviews() {
    this._templateCatalogPreviewObserver?.disconnect?.();
    this._templateCatalogPreviewObserver = null;
    const nodes = [...this.shadowRoot.querySelectorAll("[data-template-catalog-preview]")];
    if (!nodes.length) return;
    const templates = this._displayTemplateCards();
    const hydrate = (node) => {
      if (!node?.isConnected || node.dataset.templatePreviewReady === "true") return;
      const template = templates.find((item) => item.id === node.dataset.templateCatalogPreview);
      if (!template) return;
      const orientation = node.dataset.templatePreviewOrientation === "portrait" ? "portrait" : "landscape";
      const width = Math.max(1, Number(node.dataset.templatePreviewWidth) || 250);
      const height = Math.max(1, Number(node.dataset.templatePreviewHeight) || 128);
      node.innerHTML = this._renderDisplayTemplateCatalogPreview(template, orientation, { width, height });
      node.dataset.templatePreviewReady = "true";
      node.classList.add("is-ready");
    };
    if (typeof IntersectionObserver !== "function") {
      nodes.slice(0, 8).forEach(hydrate);
      return;
    }
    this._templateCatalogPreviewObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        hydrate(entry.target);
        observer.unobserve(entry.target);
      });
    }, { root: null, rootMargin: "320px 0px", threshold: 0.01 });
    nodes.forEach((node) => this._templateCatalogPreviewObserver.observe(node));
  },

  _bind() {
    this._bindAutomationEvents?.();
    this._bindLazyTemplateCatalogPreviews();
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
    this.shadowRoot.querySelector("#exportQueueLog")?.addEventListener("click", () => this._exportQueueLog());
    this.shadowRoot.querySelector("#clearQueueHistory")?.addEventListener("click", async () => {
      await this._hass.callWS({ type: "dratek_eink/queue/clear" });
      await this._loadQueue(true);
    });
    this.shadowRoot.querySelectorAll("[data-cancel-queue-job]").forEach((button) => button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await this._hass.callWS({ type: "dratek_eink/queue/cancel", job_id: button.dataset.cancelQueueJob });
      await this._loadQueue(true);
    }));
    this.shadowRoot.querySelector("#discoverGateways")?.addEventListener("click", () => this._discoverGateways());
    this.shadowRoot.querySelector("#refreshGateways")?.addEventListener("click", () => this._loadGateways(true));
    this.shadowRoot.querySelectorAll("[data-gateway-tab]").forEach((button) => button.addEventListener("click", () => {
      this._gatewaySubtab = button.dataset.gatewayTab;
      this._gatewayResult = null;
      this._gatewayScrollTop = 0;
      this._render();
      this._paint();
    }));
    // Plocha s kartami roluje sama, ale _render() vymění celý strom. Bez tohohle
    // by odrolovaný seznam skočil zpět nahoru při každém pollu fronty.
    const gatewayScroller = this.shadowRoot.querySelector(".gateway-workspace-content");
    if (gatewayScroller) {
      if (this._gatewayScrollTop) gatewayScroller.scrollTop = this._gatewayScrollTop;
      gatewayScroller.addEventListener("scroll", () => {
        this._gatewayScrollTop = gatewayScroller.scrollTop;
      }, { passive: true });
    }
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
    const selectFlashBoard = (card) => {
      if (this._gatewayBusy || !card?.dataset.flashChip) return;
      this._flashForm.chip = card.dataset.flashChip;
      this._render();
      this._paint();
    };
    this.shadowRoot.querySelectorAll(".board-card[data-flash-chip]").forEach((card) => {
      card.addEventListener("click", (event) => { event.preventDefault(); selectFlashBoard(card); });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        selectFlashBoard(card);
      });
    });
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
    this.shadowRoot.querySelectorAll("[data-template-settings-open]").forEach((button) => button.addEventListener("click", () => {
      this._templateSettingsDialogOpen = true;
      this._templateSettingsDialogMode = "settings";
      this._render(); this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-template-settings-close]").forEach((control) => control.addEventListener("click", (event) => {
      if (control.classList.contains("template-settings-backdrop") && event.target !== control) return;
      this._templateSettingsDialogOpen = false;
      this._render(); this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", async () => {
      const nextTab = button.dataset.tab;
      if (nextTab === "devices") {
        await this._saveCurrentDeviceDraft();
        this._selectedDeviceAddress = "";
        this._loadedDraftAddress = "";
        this._selectedGatewayId = "";
        this._selectedTemplateEditorElementId = "";
        this._selectedTemplatePart = "";
      }
      this._activeTab = nextTab;
      this._render();
      this._paint();
      // Nová záložka se otevře od začátku. Bez toho zůstane odrolovaná pozice
      // z předchozí stránky a lišta záložek působí, jako by uskočila.
      this.shadowRoot.querySelector(".page")?.scrollIntoView({ block: "start" });
      if (this._activeTab === "devices") {
        await Promise.all([
          this._loadQueue(true),
          this._scan({ background: true }),
        ]);
        this._scheduleDeviceStatusPoll();
      }
      if (this._activeTab === "queue") {
        await this._loadQueue(true);
      }
      if (this._activeTab === "automations") {
        await Promise.all([
          this._loadAutomations(false),
          this._loadQueue(false),
        ]);
        this._render();
        this._paint();
      }
      if (this._activeTab === "topology") {
        await Promise.all([
          this._loadGateways(false),
          this._loadQueue(true),
        ]);
      }
      if (this._activeTab === "gateways") {
        // Kapacita gatewaye i dlaždice "Zapisují" čtou frontu přes
        // _gatewayActiveJob(). Bez jejího načtení hlásila každá online gateway
        // "Volná pro další displej", i když zrovna zapisovala.
        await Promise.all([
          this._loadGateways(true),
          this._loadQueue(false),
          this._loadSerialPorts(),
        ]);
      }
    }));
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
    // Anything carrying this attribute opens that template's data sources -
    // the device-info bar above the preview (a plain container, so a click on
    // its nested rename button must not also trigger this) and each card's
    // "Nastaveno"/"Nenastaveno" status pill (itself the button, so the guard
    // below must not reject a click landing on the trigger element itself).
    this.shadowRoot.querySelectorAll("[data-display-template-configure]").forEach((bar) => {
      const openTemplateSettings = () => {
        const templateId = bar.dataset.displayTemplateConfigure || "";
        if (!templateId) return;
        if (templateId === "custom_image") {
          this._templateSettingsDialogOpen = false;
          this._openCustomImageStudioView?.("images");
          return;
        }
        this._templateEditMenuId = "";
        this._templateSettingsDialogOpen = true;
        this._templateSettingsDialogMode = "variables";
        this._templateSettingsDialogTemplateId = templateId;
        this._render();
        this._paint();
      };
      bar.addEventListener("click", (event) => {
        const blocker = event.target.closest("button,input,select,textarea,a,details,summary");
        if (blocker && blocker !== bar) return;
        event.stopPropagation();
        openTemplateSettings();
      });
      bar.addEventListener("keydown", (event) => {
        if (event.target !== bar || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openTemplateSettings();
      });
    });
    const openDisplaySettings = async (address) => {
      // A bulk preview load (or a stale localStorage cache) may not have this
      // device's full draft yet - especially its custom_image_data, which is
      // large enough that it is skipped from the local cache write entirely.
      // Going through _selectDevice fetches the authoritative draft from the
      // backend first, so the custom image preview is correct on first open
      // instead of only appearing once something else happens to reload it.
      await this._selectDevice?.(address, { render: false });
      this._displaySettingsView = "templates";
      this._activeTab = "display-settings";
      const openedDevice = this._device();
      if (openedDevice) {
        this._displayTemplateOrientation = this._deviceFrameGeometry(openedDevice).portraitLayout ? "portrait" : "landscape";
      }
      // The left panel's auto-update section needs this device's automation
      // record (interval/trigger mode) - normally only fetched when the
      // Automatické zápisy tab itself is opened. Loaded in the background so
      // it never delays the page render; the section shows its own
      // "not sent yet" state until this resolves and re-renders.
      if (!this._automations) this._loadAutomations();
      this._render();
      this._paint();
      this.shadowRoot.querySelector(".page")?.scrollIntoView({ block: "start" });
    };
    this.shadowRoot.querySelectorAll("[data-device-settings]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      openDisplaySettings(button.dataset.deviceSettings);
    }));
    this.shadowRoot.querySelectorAll("[data-device-card-settings]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button,input,select,textarea,a,details,summary")) return;
        openDisplaySettings(card.dataset.deviceCardSettings);
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openDisplaySettings(card.dataset.deviceCardSettings);
      });
    });
    this.shadowRoot.querySelector("[data-display-template-search]")?.addEventListener("input", (event) => {
      this._displayTemplateSearchQuery = event.target.value;
      this._renderKeepingSearchFocus();
    });
    this.shadowRoot.querySelector("[data-display-grid-layout-menu]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      this._displayTemplateLayoutMenuOpen = !this._displayTemplateLayoutMenuOpen;
      this._render();
      this._paint();
    });
    this.shadowRoot.querySelector("[data-display-grid-layout-menu-close]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      this._displayTemplateLayoutMenuOpen = false;
      this._render();
      this._paint();
    });
    this.shadowRoot.querySelectorAll("[data-display-grid-layout-choice]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const device = this._device();
      const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
      if (!address) return;
      const definition = this._displayTemplateLayoutDefinition(button.dataset.displayGridLayoutChoice);
      const current = this._assignedDisplayTemplates(device);
      const assignments = current.length
        ? Array.from({ length: definition.capacity }, (_unused, index) => current[index] || "blank")
        : [];
      this._displayTemplateAssignments ||= {};
      this._displayTemplateAssignments[address] = assignments;
      this._displayTemplateLargeLayout = definition.id;
      this._selectedDisplayTemplateId = assignments[0] || "";
      this._selectedDisplayTemplateSecondaryId = assignments[1] || "";
      this._selectedTemplateCanvasSlot = "primary";
      this._templateSendResult = null;
      this._displayTemplateLayoutMenuOpen = false;
      this._render();
      this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    }));
    // `placement` is the explicit choice from either the drop-zone cross or the
    // placement dialog: "full" replaces everything with just this template;
    // "left"/"right"/"top"/"bottom" put it in one half and keep whatever
    // already occupies the other one. Left unset, the call falls back to the
    // older replaceIndex-based behaviour used by the plain template swap
    // control.
    const openDisplayTemplate = (templateId, replaceIndex = null, stayInCatalog = false, placement = null) => {
      const device = this._device();
      const template = this._displayTemplateCards().find((item) => item.id === templateId);
      if (templateId === "custom_image" && !this._customImageDataUrl) {
        this._useBundledCustomImageTemplate()
          .then(() => { this._render(); this._paint(); })
          .catch((error) => {
            this._templateSendResult = { ok: false, message: this._message(error) };
            this._render();
          });
      }
      const previousAssigned = this._assignedDisplayTemplates(device);
      const layoutSlotMatch = String(placement || "").match(/^slot-(\d+)$/);
      const isPlacementMove = Boolean(layoutSlotMatch) || ["left", "right", "top", "bottom", "full"].includes(placement);
      // A template can be assigned to a display only once. Re-dropping the
      // same card used to run the complete apply flow again even though the
      // assignment itself stayed unchanged. That reset the active template
      // state and could leave the physical preview empty. Treat a duplicate
      // drop/click as a genuine no-op and keep the existing preview intact -
      // unless it is an explicit placement move, which repositions it on
      // purpose (e.g. dragging the already-assigned template to "full").
      if (previousAssigned.includes(templateId) && !isPlacementMove) {
        this._pendingDisplayTemplateConflict = null;
        this._prepareDisplayTemplateBindings(template);
        // Ensure the assignment is persisted (first-click may have only set
        // _selectedDisplayTemplateId via the fallback but never written it to
        // _displayTemplateAssignments). Without this spot-prices and similar
        // templates appeared already assigned but never rendered on the left.
        this._assignDisplayTemplate(device, templateId);
        this._selectedDisplayTemplateId = templateId;
        if (template?.user_created) {
          this._applyUserDisplayTemplate(template);
          this._render();
          this._paint();
        } else {
          // Re-render first so the dithered canvas in DOM has the correct key
          // before _applyTemplate paints into it (same guard as main path).
          this._render();
          this._applyTemplate(templateId, true);
        }
        return;
      }
      this._rememberActiveTemplateEditorState?.();
      this._prepareDisplayTemplateBindings(template);
      const size = this._devicePreviewSize(device);
      const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
      let assigned;
      let forcedLayout = null;
      if (layoutSlotMatch) {
        assigned = this._placeDisplayTemplateInLayoutSlot(device, templateId, Number(layoutSlotMatch[1]));
      } else if (placement === "full") {
        assigned = this._assignDisplayTemplateFull(device, templateId);
        forcedLayout = "single";
      } else if (placement === "left" || placement === "top") {
        assigned = this._placeDisplayTemplateInSlot(device, templateId, 0);
        forcedLayout = placement === "left" ? "side-by-side" : "stacked";
      } else if (placement === "right" || placement === "bottom") {
        assigned = this._placeDisplayTemplateInSlot(device, templateId, 1);
        forcedLayout = placement === "right" ? "side-by-side" : "stacked";
      } else {
        assigned = this._assignDisplayTemplate(device, templateId, replaceIndex);
      }
      this._displayTemplateSizes ||= { primary: "large", secondary: "small" };
      if (!largeDisplay || assigned.length < 2) {
        this._displayTemplateSizes.primary = "large";
        this._displayTemplateSizes.secondary = "small";
      } else {
        this._displayTemplateSizes.primary = "small";
        this._displayTemplateSizes.secondary = "small";
      }
      this._selectedDisplayTemplateId = templateId;
      this._selectedDisplayTemplateSecondaryId = assigned[1] || "";
      if (forcedLayout) this._displayTemplateLargeLayout = forcedLayout;
      else if (!largeDisplay) this._displayTemplateLargeLayout = "single";
      this._templateOrientationMenuOpen = false;
      this._selectedTemplateCanvasSlot = assigned.indexOf(templateId) === 1 ? "secondary" : "primary";
      if (!largeDisplay) {
        const format = this._displayTemplateOrientation === "landscape" ? "wide" : "narrow";
        this._displayTemplateFormats.primary = format;
        this._displayTemplateFormats.secondary = format;
      }
      this._pendingDisplayTemplateConflict = null;
      this._templateDesignerReturnView = "templates";
      this._displaySettingsView = stayInCatalog ? "templates" : "designer";

      // Load template objects into canvas state. _applyTemplate ends with its
      // own render+paint; _applyUserDisplayTemplate does not, so only that
      // branch needs one here. Calling render+paint a second time regardless
      // of branch used to re-run _render() right after _applyTemplate's own,
      // replacing the canvas it had just painted with a fresh, blank one - the
      // _paint() that would have repainted it is a silent no-op, guarded
      // against running twice in the same tick. The dithered preview canvas
      // then never gets another chance to be drawn into, because nothing else
      // is pending to trigger a repaint: the first assignment of any template
      // still works, since its render arrives later through an async image
      // load that lands after the guard resets, but assigning the same
      // template again - a warm cache, no async round trip - painted the
      // canvas _render() was about to throw away and nothing else, so the
      // display outright disappeared.
      if (template?.user_created) {
        this._applyUserDisplayTemplate(template);
        this._render();
        this._paint();
      } else {
        // When staying in the catalog (drag onto device, or click on thumbnail)
        // the dithered-preview canvas key in the DOM still reflects the
        // previous template ID at the point _applyTemplate would paint into it.
        // Re-render the DOM first so the canvas carries the correct key for the
        // newly assigned template, then let _applyTemplate do its own paint.
        if (stayInCatalog) this._render();
        this._applyTemplate(templateId, true);
      }
      // Assigning a template while staying in the catalog - by clicking its
      // preview, or by dragging it onto the device preview - keeps the
      // user on the same page, so their scroll position must not move. Only
      // switching into the designer is a real page change worth resetting.
      if (!stayInCatalog) {
        this.shadowRoot.querySelector(".page")?.scrollIntoView({ block: "start" });
      }
    };
    const openTemplateDesigner = (templateId) => {
      const template = this._displayTemplateCards().find((item) => item.id === templateId);
      if (!template) return;
      if (templateId === "custom_image" && !this._customImageDataUrl) {
        this._useBundledCustomImageTemplate()
          .then(() => { this._render(); this._paint(); })
          .catch((error) => {
            this._templateSendResult = { ok: false, message: this._message(error) };
            this._render();
          });
      }
      this._rememberActiveTemplateEditorState?.();
      this._prepareDisplayTemplateBindings(template);
      this._selectedDisplayTemplateId = templateId;
      this._selectedDisplayTemplateSecondaryId = "";
      this._selectedTemplateCanvasSlot = "primary";
      this._displayTemplateLargeLayout = "single";
      this._templateOrientationMenuOpen = false;
      this._templateSettingsDialogOpen = false;
      this._pendingDisplayTemplateConflict = null;
      this._templateDesignerReturnView = "templates";
      this._displaySettingsView = "designer";
      // See the matching branch in openDisplayTemplate above for why this
      // must not render+paint a second time after _applyTemplate already did.
      if (template.user_created) {
        this._applyUserDisplayTemplate(template);
        this._render();
        this._paint();
      } else {
        this._applyTemplate(templateId, true);
      }
      this.shadowRoot.querySelector(".page")?.scrollIntoView({ block: "start" });
    };
    // A large display running a multi-slot layout has no room for another
    // template without the user choosing where it goes, so both the
    // "configure" button and the selectable preview have to detect that and
    // defer to the placement dialog instead of silently doing nothing. That
    // is true both with one full-size template already there (no split
    // exists yet to drop the new one into) and with both halves of an
    // existing split already taken (a third template has nowhere free to
    // land). A large display explicitly running the "single" layout has
    // exactly one destination, occupied or not, so clicking another template
    // there always just replaces it - it must not trigger this dialog.
    const hasTemplateSlotConflict = (templateId) => {
      const device = this._device();
      const size = this._devicePreviewSize(device);
      const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
      if (!templateId || !largeDisplay) return false;
      const layoutId = this._displayTemplateLayoutDefinition?.(this._displayTemplateLargeLayout)?.id;
      return layoutId !== "single";
    };
    this.shadowRoot.querySelectorAll("[data-display-template-edit-menu]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const templateId = button.dataset.displayTemplateEditMenu || "";
        this._templateEditMenuId = this._templateEditMenuId === templateId ? "" : templateId;
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-display-template-edit-choice]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const templateId = button.dataset.displayTemplateId || "";
        const choice = button.dataset.displayTemplateEditChoice || "designer";
        this._templateEditMenuId = "";
        if (templateId === "custom_image") {
          this._openCustomImageStudioView?.(choice);
          return;
        }
        if (choice === "variables") {
          this._templateSettingsDialogOpen = true;
          this._templateSettingsDialogMode = "variables";
          this._templateSettingsDialogTemplateId = templateId;
          this._displaySettingsView = "templates";
          this._render();
          this._paint();
          return;
        }
        this._templateSettingsDialogOpen = false;
        this._templateSettingsDialogMode = "settings";
        openTemplateDesigner(templateId);
      });
    });
    this.shadowRoot.querySelectorAll("[data-display-template-open]").forEach((button) => {
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        button.click();
      });
      button.addEventListener("click", () => {
      const templateId = button.dataset.displayTemplateOpen || "";
      // The setup window offers this button too; leaving it open would put a modal
      // over the settings it just sent the user to.
      this._displayTemplateSetupId = "";
      openTemplateDesigner(templateId);
      });
    });
    // Clicking a template's preview thumbnail puts that template on the display
    // right away instead of opening the designer - the designer stays reachable
    // through the "Nastavit šablonu" button next to it for anyone who wants to
    // adjust bindings first.
    this.shadowRoot.querySelectorAll("[data-display-template-select]").forEach((tile) => {
      tile.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        tile.click();
      });
      tile.addEventListener("click", () => {
        const templateId = tile.dataset.displayTemplateSelect || "";
        if (!templateId) return;
        if (hasTemplateSlotConflict(templateId)) {
          this._pendingDisplayTemplateConflict = { templateId, stayInCatalog: true };
          this._render();
          this._paint();
          return;
        }
        openDisplayTemplate(templateId, null, true);
      });
    });
    this.shadowRoot.querySelectorAll("[data-display-template-drag]").forEach((card) => {
      card.addEventListener("dragstart", (event) => {
        const templateId = card.dataset.displayTemplateDrag || "";
        if (!templateId) return;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-dratek-display-template", templateId);
        event.dataTransfer.setData("text/plain", templateId);
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        const dropzone = this.shadowRoot.querySelector("[data-display-template-dropzone]");
        dropzone?.classList.remove("is-drag-over");
        dropzone?.querySelectorAll("[data-display-template-drop-zone]").forEach((zone) => zone.classList.remove("is-target"));
        this._pendingTemplateDropZone = null;
      });
    });
    const templateDropzone = this.shadowRoot.querySelector("[data-display-template-dropzone]");
    const dropZonesEl = templateDropzone?.querySelector("[data-display-template-drop-zones]");
    const dropZoneElements = dropZonesEl ? Array.from(dropZonesEl.querySelectorAll("[data-display-template-drop-zone]")) : [];
    const dropScreenEl = templateDropzone?.querySelector(".designer-device-screen, .device-preview-screen");
    const clearDropZoneHighlight = () => {
      dropZoneElements.forEach((zone) => zone.classList.remove("is-target"));
      this._pendingTemplateDropZone = null;
    };
    // The drag targets use the exact same geometry as the selected layout and
    // the click-placement dialog, including the asymmetric 2+3 arrangement.
    templateDropzone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      templateDropzone.classList.add("is-drag-over");
      if (!dropZonesEl || !dropScreenEl) return;
      const dzRect = templateDropzone.getBoundingClientRect();
      const screenRect = dropScreenEl.getBoundingClientRect();
      dropZonesEl.style.left = `${screenRect.left - dzRect.left}px`;
      dropZonesEl.style.top = `${screenRect.top - dzRect.top}px`;
      dropZonesEl.style.width = `${screenRect.width}px`;
      dropZonesEl.style.height = `${screenRect.height}px`;
      const fx = (event.clientX - screenRect.left) / (screenRect.width || 1);
      const fy = (event.clientY - screenRect.top) / (screenRect.height || 1);
      const slots = this._displayTemplateLayoutSlots(this._displayTemplateLargeLayout, 1, 1);
      const matchedSlot = slots.find((slot) => fx >= slot.x && fx <= slot.x + slot.w && fy >= slot.y && fy <= slot.y + slot.h) || slots[0];
      const zone = `slot-${matchedSlot.index}`;
      this._pendingTemplateDropZone = zone;
      dropZoneElements.forEach((element) => element.classList.toggle("is-target", element.dataset.displayTemplateDropZone === zone));
    });
    templateDropzone?.addEventListener("dragleave", (event) => {
      if (!templateDropzone.contains(event.relatedTarget)) {
        templateDropzone.classList.remove("is-drag-over");
        clearDropZoneHighlight();
      }
    });
    templateDropzone?.addEventListener("drop", (event) => {
      event.preventDefault();
      templateDropzone.classList.remove("is-drag-over");
      const templateId = event.dataTransfer.getData("application/x-dratek-display-template")
        || event.dataTransfer.getData("text/plain");
      const pendingZone = this._pendingTemplateDropZone;
      clearDropZoneHighlight();
      if (!this._displayTemplateCards().some((item) => item.id === templateId)) return;
      const device = this._device();
      const size = this._devicePreviewSize(device);
      const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
      const placement = largeDisplay ? (pendingZone || "slot-0") : "full";
      openDisplayTemplate(templateId, null, true, placement);
    });
    this.shadowRoot.querySelectorAll("[data-display-template-replace]").forEach((button) => button.addEventListener("click", () => {
      const card = button.closest(".display-template-card-replace");
      const target = Number(card?.querySelector("[data-template-replace-target]")?.value);
      openDisplayTemplate(button.dataset.displayTemplateReplace || "", Number.isInteger(target) ? target : 0);
    }));
    this.shadowRoot.querySelectorAll("[data-template-placement]").forEach((button) => button.addEventListener("click", async () => {
      const pendingTemplateId = this._pendingDisplayTemplateConflict?.templateId || "";
      const placement = button.dataset.templatePlacement;
      if (!pendingTemplateId || placement === "cancel") {
        this._pendingDisplayTemplateConflict = null;
        this._render();
        this._paint();
        return;
      }
      // Resolving the placement only changes the editor draft. The user still
      // confirms the physical transfer separately with the Send button.
      const stayInCatalog = this._pendingDisplayTemplateConflict?.stayInCatalog === true;
      // The dialog stood in with a two-up split for a "single" layout that
      // already had one template on it (see _renderTemplatePlacementDialog) -
      // a chosen slot only makes sense once that becomes the real layout, or
      // _placeDisplayTemplateInLayoutSlot below would still see the old
      // "single" capacity of 1 and reject slot index 1 outright.
      if (/^slot-\d+$/.test(String(placement || "")) && this._displayTemplateLargeLayout === "single" && this._assignedDisplayTemplates().length) {
        this._displayTemplateLargeLayout = "side-by-side";
      }
      openDisplayTemplate(pendingTemplateId, null, stayInCatalog, placement);
    }));
    this.shadowRoot.querySelectorAll("[data-template-orientation]").forEach((button) => button.addEventListener("click", () => {
      const previousOrientation = this._displayTemplateOrientation;
      this._displayTemplateOrientation = button.dataset.templateOrientation === "landscape" ? "landscape" : "portrait";
      const userTemplate = this._currentUserDisplayTemplate?.();
      const device = this._device();
      const size = this._devicePreviewSize(device);
      const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
      if (!largeDisplay && !userTemplate) {
        const format = this._displayTemplateOrientation === "landscape" ? "wide" : "narrow";
        this._displayTemplateFormats.primary = format;
        this._displayTemplateFormats.secondary = format;
      }
      this._templateOrientationMenuOpen = false;
      if (this._displayTemplateOrientation !== previousOrientation) {
        // The physical canvas just changed shape - re-fit every stored custom
        // image to it instead of leaving last orientation's pixels to be
        // stretched or squashed into the new frame.
        this._resyncCustomImagesForOrientation?.(device).catch((error) => {
          console.warn("DRATEK eInk image orientation refresh failed:", error);
        });
      }
      this._render();
      this._paint();
    }));
    const designerViewport = this.shadowRoot.querySelector("[data-template-designer-viewport-canvas]");
    if (designerViewport) {
      const applyDesignerViewport = () => {
        designerViewport.style.setProperty("--template-preview-zoom", String(this._displayTemplatePreviewZoom || 1));
        designerViewport.style.setProperty("--template-designer-pan-x", `${this._templateDesignerPan?.x || 0}px`);
        designerViewport.style.setProperty("--template-designer-pan-y", `${this._templateDesignerPan?.y || 0}px`);
      };
      applyDesignerViewport();
      designerViewport.addEventListener("wheel", (event) => {
        event.preventDefault();
        const current = Math.max(0.5, Math.min(16, Number(this._displayTemplatePreviewZoom || 1)));
        const factor = event.deltaY < 0 ? 1.22 : 1 / 1.22;
        this._displayTemplatePreviewZoom = Math.max(0.5, Math.min(16, Math.round(current * factor * 100) / 100));
        applyDesignerViewport();
      }, { passive: false });
      let designerPan = null;
      designerViewport.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button,input,select,a,[data-template-editable-part],[data-template-editor-element]")) return;
        event.preventDefault();
        designerPan = { x: event.clientX, y: event.clientY, left: this._templateDesignerPan?.x || 0, top: this._templateDesignerPan?.y || 0 };
        designerViewport.setPointerCapture?.(event.pointerId);
        designerViewport.classList.add("is-panning");
      });
      designerViewport.addEventListener("pointermove", (event) => {
        if (!designerPan) return;
        this._templateDesignerPan = { x: designerPan.left + event.clientX - designerPan.x, y: designerPan.top + event.clientY - designerPan.y };
        applyDesignerViewport();
      });
      const stopDesignerPan = () => { designerPan = null; designerViewport.classList.remove("is-panning"); };
      designerViewport.addEventListener("pointerup", stopDesignerPan);
      designerViewport.addEventListener("pointercancel", stopDesignerPan);
      designerViewport.addEventListener("dblclick", () => {
        this._displayTemplatePreviewZoom = 1;
        this._templateDesignerPan = { x: 0, y: 0 };
        applyDesignerViewport();
      });
    }
    const imageDropzone = this.shadowRoot.querySelector(".display-template-dropzone.has-template");
    if (imageDropzone) {
      const applyImageViewport = () => {
        const zoom = Math.max(0.5, Math.min(16, Number(this._displayTemplatePreviewZoom || 1)));
        imageDropzone.style.setProperty("--template-preview-pan-x", `${this._displayTemplateViewportPan?.x || 0}px`);
        imageDropzone.style.setProperty("--template-preview-pan-y", `${this._displayTemplateViewportPan?.y || 0}px`);
        imageDropzone.querySelector(".template-physical-preview")?.style.setProperty(
          "--template-preview-zoom",
          String(zoom),
        );
        imageDropzone.classList.toggle("is-pixel-zoom", zoom >= 2);
        const value = this.shadowRoot.querySelector("[data-template-preview-zoom-value]");
        if (value) value.textContent = `${Math.round(zoom * 100)} %`;
      };
      applyImageViewport();
      imageDropzone.addEventListener("wheel", (event) => {
        event.preventDefault();
        const current = Math.max(0.5, Math.min(16, Number(this._displayTemplatePreviewZoom || 1)));
        const factor = event.deltaY < 0 ? 1.22 : 1 / 1.22;
        this._displayTemplatePreviewZoom = Math.max(0.5, Math.min(16, Math.round(current * factor * 100) / 100));
        applyImageViewport();
      }, { passive: false });
      let pan = null;
      imageDropzone.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button,input,select,a")) return;
        event.preventDefault();
        pan = { x: event.clientX, y: event.clientY, left: this._displayTemplateViewportPan?.x || 0, top: this._displayTemplateViewportPan?.y || 0 };
        imageDropzone.setPointerCapture?.(event.pointerId);
        imageDropzone.classList.add("is-panning");
      });
      imageDropzone.addEventListener("pointermove", (event) => {
        if (!pan) return;
        this._displayTemplateViewportPan = { x: pan.left + event.clientX - pan.x, y: pan.top + event.clientY - pan.y };
        applyImageViewport();
      });
      const stopPan = () => { pan = null; imageDropzone.classList.remove("is-panning"); };
      imageDropzone.addEventListener("pointerup", stopPan);
      imageDropzone.addEventListener("pointercancel", stopPan);
      imageDropzone.addEventListener("dblclick", () => {
        this._displayTemplatePreviewZoom = 1;
        this._displayTemplateViewportPan = { x: 0, y: 0 };
        applyImageViewport();
      });
    }
    this.shadowRoot.querySelectorAll("[data-template-viewport-menu]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      this._templateViewportMenuOpen = !this._templateViewportMenuOpen;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-template-viewport-menu-close]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      this._templateViewportMenuOpen = false;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-template-designer-viewport]").forEach((button) => button.addEventListener("click", () => {
      const viewport = button.dataset.templateDesignerViewport || "wide";
      if (!["narrow", "wide", "large", "large-portrait"].includes(viewport)) return;
      const unchanged = viewport === this._templateDesignerViewport;
      this._templateViewportMenuOpen = false;
      if (unchanged) {
        this._render();
        this._paint();
        return;
      }
      this._templateDesignerViewport = viewport;
      const portrait = viewport === "narrow" || viewport === "large-portrait";
      this._displayTemplateOrientation = portrait ? "portrait" : "landscape";
      this._displayTemplateFormats ||= { primary: "wide", secondary: "narrow" };
      this._displayTemplateFormats.primary = portrait ? "narrow" : "wide";
      this._templateSaveResult = null;
      this._rememberActiveTemplateEditorState?.();
      this._render();
      this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    }));
    this.shadowRoot.querySelectorAll("[data-template-canvas-slot]:not(.is-auto-fit):not(.is-full-bleed)").forEach((item) => {
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        const slot = item.dataset.templateCanvasSlot || "primary";
        if (this._selectedTemplateCanvasSlot === slot) return;
        this._selectedTemplateCanvasSlot = slot;
        this._render();
        this._paint();
      });
      item.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        if (event.target.closest?.(".template-editable-part")) return;
        event.preventDefault();
        event.stopPropagation();
        const slot = item.dataset.templateCanvasSlot || "primary";
        const host = item.closest("[data-template-display-slot]");
        const bounds = host?.getBoundingClientRect();
        const itemBounds = item.getBoundingClientRect();
        if (!bounds?.width || !bounds?.height) return;
        this._selectedTemplateCanvasSlot = slot;
        this.shadowRoot.querySelectorAll("[data-template-canvas-slot].is-selected").forEach((selectedItem) => {
          if (selectedItem !== item) selectedItem.classList.remove("is-selected");
        });
        const placement = this._templateCanvasPlacements?.[slot] || { x: 9, y: 9 };
        this._templateCanvasDrag = {
          slot,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: Number.isFinite(Number.parseFloat(item.style.getPropertyValue("--template-item-x"))) ? Number.parseFloat(item.style.getPropertyValue("--template-item-x")) : Number(placement.x || 0),
          originY: Number.isFinite(Number.parseFloat(item.style.getPropertyValue("--template-item-y"))) ? Number.parseFloat(item.style.getPropertyValue("--template-item-y")) : Number(placement.y || 0),
          width: bounds.width,
          height: bounds.height,
          itemWidth: (itemBounds.width / bounds.width) * 100,
          itemHeight: (itemBounds.height / bounds.height) * 100,
        };
        item.setPointerCapture?.(event.pointerId);
        item.classList.add("is-dragging");
        item.classList.add("is-selected");
      });
      item.addEventListener("pointermove", (event) => {
        const drag = this._templateCanvasDrag;
        if (!drag || drag.pointerId !== event.pointerId || drag.slot !== item.dataset.templateCanvasSlot) return;
        const x = Math.max(0, Math.min(100 - drag.itemWidth, drag.originX + ((event.clientX - drag.startX) / drag.width) * 100));
        const y = Math.max(0, Math.min(100 - drag.itemHeight, drag.originY + ((event.clientY - drag.startY) / drag.height) * 100));
        this._templateCanvasPlacements ||= {};
        this._templateCanvasPlacements[drag.slot] = { x, y };
        item.style.setProperty("--template-item-x", `${x}%`);
        item.style.setProperty("--template-item-y", `${y}%`);
      });
      const finishTemplateDrag = (event) => {
        if (!this._templateCanvasDrag || this._templateCanvasDrag.pointerId !== event.pointerId) return;
        this._templateCanvasDrag = null;
        item.classList.remove("is-dragging");
        item.releasePointerCapture?.(event.pointerId);
      };
      item.addEventListener("pointerup", finishTemplateDrag);
      item.addEventListener("pointercancel", finishTemplateDrag);
    });
    this.shadowRoot.querySelectorAll("[data-template-size]").forEach((button) => button.addEventListener("click", () => {
      const device = this._device();
      const size = this._devicePreviewSize(device);
      const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
      if (!largeDisplay) return;
      const slot = this._selectedTemplateCanvasSlot === "secondary" && this._displayTemplateLargeLayout !== "single"
        ? "secondary"
        : "primary";
      const templateSize = button.dataset.templateSize === "small" ? "small" : "large";
      this._displayTemplateSizes ||= { primary: "large", secondary: "small" };
      const address = String(device?.address || "").toUpperCase();
      if (templateSize === "large") {
        const activeTemplateId = slot === "secondary"
          ? this._selectedDisplayTemplateSecondaryId
          : this._selectedDisplayTemplateId;
        this._selectedDisplayTemplateId = activeTemplateId || this._selectedDisplayTemplateId;
        this._selectedDisplayTemplateSecondaryId = "";
        this._selectedTemplateCanvasSlot = "primary";
        this._displayTemplateSizes.primary = "large";
        this._displayTemplateSizes.secondary = "small";
        this._displayTemplateLargeLayout = "single";
        const format = this._displayTemplateFormats.primary === "wide" ? "wide" : "narrow";
        this._templateCanvasPlacements.primary = format === "wide" ? { x: 3, y: 6 } : { x: 14, y: 3 };
        if (address) this._displayTemplateAssignments[address] = [this._selectedDisplayTemplateId].filter(Boolean);
      } else {
        this._displayTemplateSizes[slot] = "small";
        const format = this._displayTemplateFormats?.[slot] === "wide" ? "wide" : "narrow";
        const placement = this._templateCanvasPlacements?.[slot] || { x: 9, y: 9 };
        const width = format === "wide" ? 82 : 46;
        const height = format === "wide" ? 46 : 82;
        this._templateCanvasPlacements[slot] = {
          x: Math.max(0, Math.min(100 - width, Number(placement.x || 0))),
          y: Math.max(0, Math.min(100 - height, Number(placement.y || 0))),
        };
        if (this._selectedDisplayTemplateSecondaryId) {
          this._displayTemplateSizes.primary = "small";
          this._displayTemplateSizes.secondary = "small";
          this._displayTemplateLargeLayout = "side-by-side";
        }
      }
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-template-entity-picker]").forEach((picker) => {
      const bindingKey = picker.dataset.templateEntityPicker;
      picker.hass = this._hass;
      picker.selector = { entity: {} };
      picker.value = this._displayTemplateBindings?.[bindingKey]
        || picker.dataset.templateDefaultEntity
        || "";
      picker.required = false;
      picker.addEventListener("value-changed", (event) => {
        this._displayTemplateBindings ||= {};
        this._displayTemplateBindings[bindingKey] = String(event.detail?.value || "");
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-display-template-setup]").forEach((button) => button.addEventListener("click", (event) => {
      // The tile is draggable and its preview sends the template on click, so the
      // help button has to keep its click to itself.
      event.stopPropagation();
      this._displayTemplateSetupId = button.dataset.displayTemplateSetup;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-delete-user-template]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const templateId = button.dataset.deleteUserTemplate;
      if (!templateId) return;
      this._deleteUserDisplayTemplate?.(templateId);
    }));
    this.shadowRoot.querySelectorAll("[data-display-template-export]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const templateId = button.dataset.displayTemplateExport;
      this._exportDisplayTemplate?.(templateId);
    }));
    const importTrigger = this.shadowRoot.querySelector("[data-display-template-import-trigger]");
    const fileInput = this.shadowRoot.querySelector("#displayTemplateFileInput");
    if (importTrigger && fileInput) {
      importTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        fileInput.click();
      });
      fileInput.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) {
          this._importDisplayTemplateFile?.(file);
          fileInput.value = "";
        }
      });
    }
    this.shadowRoot.querySelectorAll("[data-template-setup-close]").forEach((element) => element.addEventListener("click", (event) => {
      // The backdrop carries the same attribute as the buttons do, so a click that
      // bubbled up from inside the dialog must not close it. On a button any target
      // counts - the click usually lands on its ha-icon rather than the button.
      if (element.classList.contains("modal-backdrop") && event.target !== element) return;
      this._displayTemplateSetupId = "";
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-template-option]").forEach((input) => input.addEventListener("change", (event) => {
      this._displayTemplateOptions ||= {};
      this._displayTemplateOptions[input.dataset.templateOption] = !!event.target.checked;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-template-palette-category]").forEach((button) => button.addEventListener("click", () => {
      const category = button.dataset.templatePaletteCategory || "";
      this._templateElementPaletteCategory = this._templateElementPaletteCategory === category ? "" : category;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelector("[data-template-palette-close]")?.addEventListener("click", () => {
      this._templateElementPaletteCategory = "";
      this._render();
      this._paint();
    });
    this.shadowRoot.querySelectorAll("[data-template-editor-tool]").forEach((button) => button.addEventListener("click", () => {
      this._templateElementPaletteCategory = "";
      let preset = {};
      try { preset = JSON.parse(button.dataset.templateEditorPreset || "{}"); } catch (_err) { /* Invalid third-party preset. */ }
      this._addTemplateEditorElement(button.dataset.templateEditorTool, button.dataset.templateEditorIcon || "", null, preset);
    }));
    this.shadowRoot.querySelector("#templateEditorImage")?.addEventListener("change", (event) => {
      this._importTemplateEditorImage(event.target.files?.[0]);
    });
    this.shadowRoot.querySelector("[data-template-editor-import]")?.addEventListener("click", () => {
      this.shadowRoot.querySelector("#templateEditorImage")?.click();
    });
    this.shadowRoot.querySelectorAll("[data-template-library-image]").forEach((button) => button.addEventListener("click", () => {
      const asset = (this._templateImageLibrary || []).find((item) => item.id === button.dataset.templateLibraryImage);
      if (asset) {
        this._templateElementPaletteCategory = "";
        this._insertTemplateLibraryImage(asset);
      }
    }));
    this.shadowRoot.querySelectorAll("[data-template-library-remove]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._templateImageLibrary = (this._templateImageLibrary || []).filter((asset) => asset.id !== button.dataset.templateLibraryRemove);
      this._render();
      this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    }));
    this.shadowRoot.querySelectorAll("[data-template-editor-remove]").forEach((button) => button.addEventListener("click", () => {
      this._pushTemplateHistory?.();
      this._templateEditorElements = (this._templateEditorElements || []).filter((item) => item.id !== button.dataset.templateEditorRemove);
      if (this._selectedTemplateEditorElementId === button.dataset.templateEditorRemove) this._selectedTemplateEditorElementId = "";
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-template-editor-select]").forEach((button) => button.addEventListener("click", (event) => {
      if (event.target.closest("[data-template-editor-remove]")) return;
      event.stopPropagation();
      this._selectedTemplateEditorElementId = button.dataset.templateEditorSelect || "";
      this._selectedTemplatePart = "";
      this._render();
      this._paint();
    }));
    const updateTemplateElement = (prop, rawValue, shouldRender = true) => {
      const item = this._templateEditorElement?.();
      if (!item && prop === "rotation" && this._selectedTemplatePart) {
        const adjustment = this._templateElementAdjustments?.[this._selectedTemplatePart];
        if (!adjustment) return;
        adjustment.rotation = Number(rawValue || 0);
        this._templateSaveResult = null;
        const element = this.shadowRoot.querySelector(`[data-template-editable-part="${CSS.escape(this._selectedTemplatePart)}"]`);
        const surface = element?.closest(".display-template-surface");
        if (element && surface) this._applyTemplatePartAdjustment(element, surface, adjustment);
        if (shouldRender) { this._render(); this._paint(); }
        return;
      }
      if (!item || !prop) return;
      const numeric = ["x", "y", "w", "h", "rotation", "fontSize", "strokeWidth", "radius", "value", "historyLimit", "overlayOpacity", "textBorderWidth", "textOutlineWidth"].includes(prop);
      item[prop] = numeric ? Number(rawValue) : rawValue;
      if (prop === "historyLimit") {
        item.historyLimit = Math.max(1, Math.min(20, Number(item.historyLimit || 10)));
        item.historyValues = (item.historyValues || []).slice(-item.historyLimit);
      }
      item.w = Math.max(2, Math.min(100, Number(item.w || 2)));
      item.h = Math.max(2, Math.min(100, Number(item.h || 2)));
      item.x = Math.max(0, Math.min(100 - item.w, Number(item.x || 0)));
      item.y = Math.max(0, Math.min(100 - item.h, Number(item.y || 0)));
      this._templateSaveResult = null;
      if (prop === "entityAttribute" || prop === "sampleInterval" || prop === "resetInterval") this._refreshTemplateEntityElements?.();
      if (shouldRender) {
        this._render(); this._paint();
        return;
      }
      const element = this.shadowRoot.querySelector(`[data-template-overlay-id="${CSS.escape(item.id)}"]`);
      if (!element) return;
      element.style.left = `${item.x}%`; element.style.top = `${item.y}%`; element.style.width = `${item.w}%`; element.style.height = `${item.h}%`;
      element.style.transform = `rotate(${item.rotation}deg)`;
      element.style.setProperty("--element-color", item.color); element.style.setProperty("--element-fill", item.fill); element.style.setProperty("--element-stroke", item.stroke);
      element.style.setProperty("--element-stroke-width", `${item.strokeWidth}px`); element.style.setProperty("--element-radius", `${item.radius}px`); element.style.setProperty("--element-font-size", `${item.fontSize}px`); element.style.setProperty("--element-font-weight", item.fontWeight); element.style.setProperty("--element-text-align", item.textAlign); element.style.setProperty("--element-value", `${item.value}%`);
      element.style.setProperty("--element-font-family", item.fontFamily); element.style.setProperty("--element-font-style", item.fontStyle); element.style.setProperty("--element-text-decoration", item.textDecoration); element.style.setProperty("--element-text-outline-width", `${item.textOutlineWidth}px`); element.style.setProperty("--element-text-outline-color", item.textOutlineColor); element.style.setProperty("--element-text-border-width", `${item.textBorderWidth}px`); element.style.setProperty("--element-text-border-color", item.textBorderColor); element.style.setProperty("--element-overlay-opacity", `${item.overlayOpacity}%`);
      if (["text", "button"].includes(item.type)) element.querySelector(":scope > span:not(.template-overlay-selection)")?.replaceChildren(document.createTextNode(item.text || item.label));
      if (item.type === "icon") element.querySelector("ha-icon")?.setAttribute("icon", `mdi:${item.icon || "star-outline"}`);
      if (item.type === "signal") {
        const label = element.querySelector(".template-signal-visual .eink-signal-label");
        if (label) label.textContent = item.text || item.label;
        element.querySelector(".template-signal-visual ha-icon")?.setAttribute("icon", `mdi:${item.icon || "check-circle"}`);
      }
    };
    this.shadowRoot.querySelectorAll("[data-template-element-prop]").forEach((input) => {
      const historyKey = `${this._selectedTemplateEditorElementId || this._selectedTemplatePart}:${input.dataset.templateElementProp}`;
      input.addEventListener("input", () => {
        if (this._templatePropertyHistoryKey !== historyKey) {
          this._pushTemplateHistory?.();
          this._templatePropertyHistoryKey = historyKey;
        }
        updateTemplateElement(input.dataset.templateElementProp, input.value, false);
      });
      input.addEventListener("change", () => {
        if (this._templatePropertyHistoryKey !== historyKey) this._pushTemplateHistory?.();
        this._templatePropertyHistoryKey = "";
        updateTemplateElement(input.dataset.templateElementProp, input.value);
      });
    });
    this.shadowRoot.querySelector("[data-template-chart-values]")?.addEventListener("change", (event) => {
      const item = this._templateEditorElement?.();
      if (!item || item.type !== "chart") return;
      const values = String(event.currentTarget.value || "")
        .split(/[;,\n]+/)
        .map((value) => Number(String(value).trim().replace(",", ".")))
        .filter(Number.isFinite)
        .slice(-Math.max(2, Math.min(20, Number(item.historyLimit || 10))));
      this._pushTemplateHistory?.();
      item.historyValues = values;
      if (values.length) item.value = values.at(-1);
      item.historyUpdatedAt = Date.now();
      this._templateSaveResult = null;
      this._render(); this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    });
    this.shadowRoot.querySelectorAll("[data-template-element-toggle]").forEach((input) => input.addEventListener("change", () => {
      this._pushTemplateHistory?.();
      updateTemplateElement(input.dataset.templateElementToggle, input.checked);
    }));
    const setTemplateElementEntity = (rawValue) => {
      const item = this._templateEditorElement?.();
      if (!item) return;
      const entityId = String(rawValue || "").trim();
      if (item.entityId === entityId) return;
      this._pushTemplateHistory?.();
      item.entityId = entityId;
      item.historyValues = [];
      item.historyUpdatedAt = 0;
      item.historyResetAt = 0;
      item.resolvedActive = undefined;
      this._refreshTemplateEntityElements?.();
      this._render(); this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    };
    this.shadowRoot.querySelectorAll("[data-template-element-entity-picker]").forEach((picker) => {
      const item = this._templateEditorElement?.();
      if (!item || item.id !== picker.dataset.templateElementEntityPicker) return;
      picker.hass = this._hass;
      picker.selector = { entity: {} };
      picker.value = item.entityId || "";
      picker.required = false;
      picker.addEventListener("value-changed", (event) => setTemplateElementEntity(event.detail?.value));
    });
    this.shadowRoot.querySelectorAll("[data-template-element-entity-id]").forEach((input) => {
      input.addEventListener("change", () => setTemplateElementEntity(input.value));
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); setTemplateElementEntity(input.value); } });
    });
    this.shadowRoot.querySelector("[data-template-element-history-clear]")?.addEventListener("click", () => {
      const item = this._templateEditorElement?.();
      if (!item) return;
      this._pushTemplateHistory?.();
      item.historyValues = []; item.historyUpdatedAt = 0; item.historyResetAt = Date.now();
      this._render(); this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    });
    this.shadowRoot.querySelectorAll("[data-template-element-color]").forEach((button) => button.addEventListener("click", () => {
      const [prop, value] = String(button.dataset.templateElementColor || "").split(":");
      this._pushTemplateHistory?.();
      updateTemplateElement(prop, value);
    }));
    this.shadowRoot.querySelectorAll("[data-template-element-align]").forEach((button) => button.addEventListener("click", () => {
      this._pushTemplateHistory?.();
      updateTemplateElement("textAlign", button.dataset.templateElementAlign);
    }));
    this.shadowRoot.querySelectorAll("[data-template-element-format]").forEach((button) => button.addEventListener("click", () => {
      const item = this._templateEditorElement?.();
      if (!item) return;
      this._pushTemplateHistory?.();
      if (button.dataset.templateElementFormat === "bold") {
        updateTemplateElement("fontWeight", Number(item.fontWeight || 400) >= 700 ? "400" : "700");
      }
    }));
    this.shadowRoot.querySelectorAll("[data-template-element-rotate]").forEach((button) => button.addEventListener("click", () => {
      const item = this._templateEditorElement?.();
      const part = this._selectedTemplatePart ? this._templateElementAdjustments?.[this._selectedTemplatePart] : null;
      if (!item && !part) return;
      this._pushTemplateHistory?.();
      const rotation = Number(item?.rotation ?? part?.rotation ?? 0) + Number(button.dataset.templateElementRotate || 0);
      updateTemplateElement("rotation", ((rotation + 180) % 360 + 360) % 360 - 180);
    }));
    this.shadowRoot.querySelectorAll("[data-template-element-area-orientation]").forEach((button) => button.addEventListener("click", () => {
      const item = this._templateEditorElement?.();
      const part = this._selectedTemplatePart ? this._templateElementAdjustments?.[this._selectedTemplatePart] : null;
      if (!item && !part) return;
      const requested = button.dataset.templateElementAreaOrientation;
      const quarterTurn = Math.abs(Math.round(Number(part?.rotation || 0) / 90)) % 2 === 1;
      const baseLandscape = Number(part?.baseWidth || 0) >= Number(part?.baseHeight || 0);
      const isLandscape = item ? Number(item.w || 0) >= Number(item.h || 0) : (quarterTurn ? !baseLandscape : baseLandscape);
      if ((requested === "landscape") === isLandscape) return;
      this._pushTemplateHistory?.();
      if (part) {
        updateTemplateElement("rotation", Number(part.rotation || 0) + 90);
        return;
      }
      const centerX = Number(item.x || 0) + Number(item.w || 0) / 2;
      const centerY = Number(item.y || 0) + Number(item.h || 0) / 2;
      [item.w, item.h] = [Number(item.h || 2), Number(item.w || 2)];
      item.x = Math.max(0, Math.min(100 - item.w, centerX - item.w / 2));
      item.y = Math.max(0, Math.min(100 - item.h, centerY - item.h / 2));
      this._templateSaveResult = null;
      this._render(); this._paint();
    }));
    this.shadowRoot.querySelector("[data-template-element-deselect]")?.addEventListener("click", () => { this._selectedTemplateEditorElementId = ""; this._render(); this._paint(); });
    this.shadowRoot.querySelector("[data-template-element-delete]")?.addEventListener("click", () => {
      if (!this._selectedTemplateEditorElementId && this._selectedTemplatePart) {
        const adjustment = this._templateElementAdjustments?.[this._selectedTemplatePart];
        if (!adjustment) return;
        this._pushTemplateHistory?.();
        adjustment.hidden = true;
        this._selectedTemplatePart = "";
        this._render(); this._paint();
        return;
      }
      this._deleteSelectedTemplateElement?.();
    });
    this.shadowRoot.querySelector("[data-template-element-duplicate]")?.addEventListener("click", () => {
      const item = this._templateEditorElement?.();
      if (!item && this._selectedTemplatePart) {
        const element = this.shadowRoot.querySelector(`[data-template-editable-part="${CSS.escape(this._selectedTemplatePart)}"]`);
        const surface = element?.closest(".display-template-surface");
        const frame = surface?.getBoundingClientRect();
        const rect = element?.getBoundingClientRect();
        if (!element || !frame?.width || !frame?.height || !rect) return;
        this._pushTemplateHistory?.();
        const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
        const clone = this._normalizeTemplateEditorElement({
          id: `template-element-${Date.now()}-${this._templateEditorElements.length}`,
          type: text ? "text" : "rect", label: text ? `${text.slice(0, 24)} kopie` : "Kopie prvku", text: text || undefined,
          x: Math.max(0, Math.min(96, ((rect.left - frame.left) / frame.width) * 100 + 3)),
          y: Math.max(0, Math.min(96, ((rect.top - frame.top) / frame.height) * 100 + 3)),
          w: Math.max(4, Math.min(100, (rect.width / frame.width) * 100)),
          h: Math.max(4, Math.min(100, (rect.height / frame.height) * 100)),
          color: ({ black: "#111111", red: "#d71912", white: "#ffffff" })[this._templateElementAdjustments?.[this._selectedTemplatePart]?.color] || "#111111",
        });
        this._templateEditorElements.push(clone);
        this._selectedTemplateEditorElementId = clone.id;
        this._selectedTemplatePart = "";
        this._render(); this._paint();
        return;
      }
      if (!item) return;
      this._pushTemplateHistory?.();
      const clone = structuredClone(item); clone.id = `template-element-${Date.now()}-${this._templateEditorElements.length}`; clone.label = `${item.label} kopie`; clone.x = Math.min(100 - clone.w, clone.x + 4); clone.y = Math.min(100 - clone.h, clone.y + 4);
      this._templateEditorElements.push(clone); this._selectedTemplateEditorElementId = clone.id; this._render(); this._paint();
    });
    this.shadowRoot.querySelectorAll("[data-template-element-order]").forEach((button) => button.addEventListener("click", () => {
      const index = (this._templateEditorElements || []).findIndex((item) => item.id === this._selectedTemplateEditorElementId);
      if (index < 0 && this._selectedTemplatePart) {
        const adjustment = this._templateElementAdjustments?.[this._selectedTemplatePart];
        if (!adjustment) return;
        this._pushTemplateHistory?.();
        adjustment.order = button.dataset.templateElementOrder === "front" ? 100 : -100;
        this._render(); this._paint();
        return;
      }
      if (index < 0) return;
      this._pushTemplateHistory?.();
      const [item] = this._templateEditorElements.splice(index, 1);
      if (button.dataset.templateElementOrder === "front") this._templateEditorElements.push(item); else this._templateEditorElements.unshift(item);
      this._render(); this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-template-history]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.templateHistory === "undo") this._undoTemplateHistory?.();
      else this._redoTemplateHistory?.();
    }));
    this._bindTemplatePartEditor?.();
    this._bindTemplateEditorOverlays?.();
    this.shadowRoot.querySelectorAll("[data-template-part-prop]").forEach((input) => {
      const key = String(this._selectedTemplatePart || "");
      const prop = input.dataset.templatePartProp || "";
      const historyKey = `${key}:${prop}`;
      const update = (render = false) => {
        const adjustment = this._templateElementAdjustments?.[key];
        if (!adjustment) return;
        adjustment[prop] = prop === "scale" ? Math.max(.2, Math.min(3, Number(input.value) / 100)) : Number(input.value || 0);
        const selected = this.shadowRoot.querySelector(`[data-template-editable-part="${CSS.escape(key)}"]`);
        const surface = selected?.closest(".display-template-surface");
        if (selected && surface) this._applyTemplatePartAdjustment(selected, surface, adjustment);
        this._templateSaveResult = null;
        if (render) { this._render(); this._paint(); }
      };
      input.addEventListener("input", () => {
        if (this._templatePropertyHistoryKey !== historyKey) { this._pushTemplateHistory?.(); this._templatePropertyHistoryKey = historyKey; }
        update(false);
      });
      input.addEventListener("change", () => { this._templatePropertyHistoryKey = ""; update(true); });
    });
    this.shadowRoot.querySelectorAll("[data-template-part-toggle]").forEach((input) => input.addEventListener("change", () => {
      const key = String(this._selectedTemplatePart || "");
      const adjustment = this._templateElementAdjustments?.[key];
      if (!adjustment) return;
      this._pushTemplateHistory?.();
      if (input.dataset.templatePartToggle === "hidden") adjustment.hidden = !input.checked;
      else adjustment.locked = input.checked;
      this._render(); this._paint();
    }));
    this.shadowRoot.querySelector("[data-template-part-deselect]")?.addEventListener("click", () => {
      this._selectedTemplatePart = "";
      this._render(); this._paint();
    });
    this.shadowRoot.querySelectorAll("[data-template-part-scale]").forEach((input) => input.addEventListener("input", () => {
      const key = input.dataset.templatePartScale || "";
      const adjustment = this._templateElementAdjustments?.[key];
      if (!adjustment) return;
      adjustment.scale = Math.max(0.5, Math.min(2, Number(input.value) / 100));
      const selected = this.shadowRoot.querySelector(`[data-template-editable-part="${CSS.escape(key)}"]`);
      const surface = selected?.closest(".display-template-surface");
      if (selected && surface) this._applyTemplatePartAdjustment(selected, surface, adjustment);
      const label = this.shadowRoot.querySelector("[data-template-part-scale-value]");
      if (label) label.textContent = `${Math.round(adjustment.scale * 100)} %`;
      this._templateSaveResult = null;
    }));
    this.shadowRoot.querySelectorAll("[data-template-part-reset]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.templatePartReset || "";
      this._pushTemplateHistory?.();
      this._templateElementAdjustments[key] = { x: 0, y: 0, scale: 1, rotation: 0 };
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelector("[data-template-save]")?.addEventListener("click", async () => {
      try {
        const savedUserTemplate = this._storeCurrentUserDisplayTemplate();
        if (savedUserTemplate) {
          try {
            const preview = await this._renderCurrentDisplayTemplateImage(this._device());
            const previewSize = this._devicePreviewSize(this._device());
            const landscape = this._displayTemplateOrientation === "landscape";
            savedUserTemplate.preview_image = preview;
            savedUserTemplate.preview_width = landscape ? Math.max(previewSize.width, previewSize.height) : Math.min(previewSize.width, previewSize.height);
            savedUserTemplate.preview_height = landscape ? Math.min(previewSize.width, previewSize.height) : Math.max(previewSize.width, previewSize.height);
            savedUserTemplate.preview_orientation = this._displayTemplateOrientation;
            savedUserTemplate.updated_at = new Date().toISOString();
            this._userDisplayTemplates = (this._userDisplayTemplates || []).map((template) => template.id === savedUserTemplate.id ? savedUserTemplate : template);
          } catch (_previewError) {
            // The editable template data is still authoritative; older browsers
            // can fall back to the live catalog compositor below.
          }
        }
        if (savedUserTemplate) await this._saveUserDisplayTemplate(savedUserTemplate);
        await this._saveDisplayTemplateDraft();
        this._templateSaveResult = savedUserTemplate
          ? { ok: true, message: `Šablona „${savedUserTemplate.title}“ byla uložena do seznamu.` }
          : { ok: true, message: "Šablona a její úpravy byly uloženy pro tento displej." };
        if (savedUserTemplate) {
          this._displaySettingsView = "templates";
        }
      } catch (err) {
        this._templateSaveResult = { ok: false, message: `Uložení selhalo: ${this._message(err)}` };
      }
      this._render();
      this._paint();
    });
    this.shadowRoot.querySelector("[data-template-send]")?.addEventListener("click", () => this._sendDisplayTemplatePreview());
    this.shadowRoot.querySelectorAll("[data-display-template-canvas-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const templateId = button.dataset.displayTemplateCanvasOpen || "";
        this._applyTemplate(templateId, true);
        const device = this._device();
        if (device) this._selectedDeviceAddress = device.address;
        this._displaySettingsView = "designer";
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-photoshop-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this._photoshopSidebarTab = button.dataset.photoshopTab;
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-template-part-color]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = String(this._selectedTemplatePart || "");
        if (!key) return;
        this._templateElementAdjustments ||= {};
        this._templateElementAdjustments[key] ||= { x: 0, y: 0, scale: 1 };
        this._pushTemplateHistory?.();
        this._templateElementAdjustments[key].color = button.dataset.templatePartColor;
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-layer-select]").forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedTemplatePart = button.dataset.layerSelect;
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-layer-toggle-hide]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.layerToggleHide;
        this._templateElementAdjustments ||= {};
        this._templateElementAdjustments[key] ||= { x: 0, y: 0, scale: 1 };
        this._pushTemplateHistory?.();
        this._templateElementAdjustments[key].hidden = !this._templateElementAdjustments[key].hidden;
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-layer-toggle-lock]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.layerToggleLock;
        this._templateElementAdjustments ||= {};
        this._templateElementAdjustments[key] ||= { x: 0, y: 0, scale: 1 };
        this._pushTemplateHistory?.();
        this._templateElementAdjustments[key].locked = !this._templateElementAdjustments[key].locked;
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-device-price-sale]").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        this._activePriceSaleDeviceAddress = button.dataset.devicePriceSale;
        this._render();
        this._paint();

        setTimeout(() => {
          const updateLiveDiscount = () => {
            const address = this._activePriceSaleDeviceAddress;
            const titleVal = this.shadowRoot.querySelector("#priceSaleTitle")?.value || "Jablka Golden";
            const oldValRaw = this.shadowRoot.querySelector("#priceSaleOldPrice")?.value || "199";
            const newValRaw = this.shadowRoot.querySelector("#priceSaleNewPrice")?.value || "149";
            const codeVal = this.shadowRoot.querySelector("#priceSaleCode")?.value || "8594001234567";

            const oldVal = parseFloat(String(oldValRaw).replace(",", ".")) || 0;
            const newVal = parseFloat(String(newValRaw).replace(",", ".")) || 0;
            const pct = oldVal > 0 ? Math.round(((oldVal - newVal) / oldVal) * 100) : 0;
            const saved = Math.max(0, oldVal - newVal);

            const pctEl = this.shadowRoot.querySelector(".summary-discount-badge");
            const saveEl = this.shadowRoot.querySelector(".summary-save-text strong");
            if (pctEl) pctEl.textContent = `- ${pct} %`;
            if (saveEl) saveEl.textContent = `${saved.toFixed(1).replace(".", ",")} Kč`;

            if (address) {
              const upperAddr = String(address).toUpperCase();
              this._deviceDrafts ||= {};
              this._deviceDrafts[upperAddr] ||= { template: "price", assigned_templates: ["price"] };
              const draft = this._deviceDrafts[upperAddr];
              draft.bindings ||= {};
              draft.bindings["tag-outline"] = titleVal;
              draft.bindings["cash-multiple"] = String(oldValRaw);
              draft.bindings["currency-usd"] = String(newValRaw);
              draft.bindings["barcode"] = codeVal;

              this._displayTemplateBindings ||= {};
              this._displayTemplateBindings["price:tag-outline"] = titleVal;
              this._displayTemplateBindings["price:cash-multiple"] = String(oldValRaw);
              this._displayTemplateBindings["price:currency-usd"] = String(newValRaw);
              this._displayTemplateBindings["price:barcode"] = codeVal;

              this._paint();
            }
          };

          this.shadowRoot.querySelector("#priceSaleTitle")?.addEventListener("input", updateLiveDiscount);
          this.shadowRoot.querySelector("#priceSaleOldPrice")?.addEventListener("input", updateLiveDiscount);
          this.shadowRoot.querySelector("#priceSaleNewPrice")?.addEventListener("input", updateLiveDiscount);
          this.shadowRoot.querySelector("#priceSaleCode")?.addEventListener("input", updateLiveDiscount);
        }, 50);
      });
    });
    this.shadowRoot.querySelectorAll("[data-price-sale-close]").forEach((closeBtn) => {
      closeBtn.addEventListener("click", (e) => {
        if (e.target === closeBtn || closeBtn.classList.contains("price-sale-close-btn")) {
          this._activePriceSaleDeviceAddress = null;
          this._render();
          this._paint();
        }
      });
    });

    const applyPriceSale = async (isSaleActive) => {
      const address = this._activePriceSaleDeviceAddress;
      if (!address) return;

      const titleVal = this.shadowRoot.querySelector("#priceSaleTitle")?.value || "Jablka Golden";
      const oldVal = this.shadowRoot.querySelector("#priceSaleOldPrice")?.value || "199";
      const newVal = this.shadowRoot.querySelector("#priceSaleNewPrice")?.value || "149";
      const codeVal = this.shadowRoot.querySelector("#priceSaleCode")?.value || "8594001234567";

      this._displayTemplateBindings ||= {};
      this._displayTemplateBindings["price:tag-outline"] = titleVal;
      this._displayTemplateBindings["price:cash-multiple"] = String(oldVal);
      this._displayTemplateBindings["price:currency-usd"] = String(newVal);
      this._displayTemplateBindings["price:barcode"] = codeVal;
      this._displayTemplateOptions ||= {};
      this._displayTemplateOptions["price:sale"] = isSaleActive;

      const upperAddr = String(address).toUpperCase();
      this._deviceDrafts ||= {};
      this._deviceDrafts[upperAddr] ||= { template: "price", assigned_templates: ["price"] };
      const draft = this._deviceDrafts[upperAddr];
      draft.template = "price";
      draft.assigned_templates = ["price"];
      draft.options ||= {};
      draft.options["sale"] = isSaleActive;
      draft.bindings ||= {};
      draft.bindings["tag-outline"] = titleVal;
      draft.bindings["cash-multiple"] = String(oldVal);
      draft.bindings["currency-usd"] = String(newVal);
      draft.bindings["barcode"] = codeVal;

      this._activePriceSaleDeviceAddress = null;
      await this._saveCurrentDeviceDraft?.();
      this._render();
      this._paint();
    };

    this.shadowRoot.querySelector("[data-price-sale-apply]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      applyPriceSale(true);
    });
    this.shadowRoot.querySelector("[data-price-sale-disable]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      applyPriceSale(false);
    });
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
    this.shadowRoot.querySelectorAll("[data-device-refresh-interval], #refreshInterval").forEach((select) => {
      select.addEventListener("change", (event) => {
        event.stopPropagation();
        const address = select.dataset.deviceRefreshInterval || this._selectedDeviceAddress;
        const seconds = Math.max(30, Math.min(86400, Number(event.target.value) || 60));
        this._refreshIntervalSeconds = seconds;
        const upperAddr = String(address || "").toUpperCase();
        if (upperAddr) {
          if (!this._deviceDrafts) this._deviceDrafts = {};
          const draft = this._deviceDrafts[upperAddr] || {};
          draft.refresh_interval_seconds = seconds;
          this._deviceDrafts[upperAddr] = draft;
        }
        this._scheduleDraftSave();
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-device-refresh-trigger-mode]").forEach((select) => {
      select.addEventListener("change", (event) => {
        event.stopPropagation();
        const address = select.dataset.deviceRefreshTriggerMode || this._selectedDeviceAddress;
        const mode = ["both", "change_only", "interval_only"].includes(event.target.value) ? event.target.value : "both";
        this._refreshTriggerMode = mode;
        const upperAddr = String(address || "").toUpperCase();
        if (upperAddr) {
          if (!this._deviceDrafts) this._deviceDrafts = {};
          const draft = this._deviceDrafts[upperAddr] || {};
          draft.refresh_trigger_mode = mode;
          this._deviceDrafts[upperAddr] = draft;
        }
        this._scheduleDraftSave();
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-meteoradar-country]").forEach((element) => {
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        const country = element.dataset.meteoradarCountry || "cz";
        this._meteoradarCountry = country;
        if (!this._displayTemplateConfig) this._displayTemplateConfig = {};
        this._displayTemplateConfig.meteoradar_country = country;
        const address = element.dataset.deviceAddress || this._selectedDeviceAddress;
        const upperAddr = String(address || "").toUpperCase();
        if (upperAddr) {
          if (!this._deviceDrafts) this._deviceDrafts = {};
          const draft = this._deviceDrafts[upperAddr] || {};
          if (!draft.template_config) draft.template_config = {};
          draft.template_config.meteoradar_country = country;
          this._deviceDrafts[upperAddr] = draft;
        }
        this._scheduleDraftSave();
        this._render();
        this._paint();
      });
    });
    this.shadowRoot.querySelectorAll("[data-custom-image-template-upload]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.shadowRoot.querySelector("#customImageTemplateFile")?.click();
      });
    });
    this.shadowRoot.querySelectorAll("[data-custom-image-template-default]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        try {
          await this._useBundledCustomImageTemplate(true);
          await this._saveDisplayTemplateDraft?.();
        } catch (error) {
          this._templateSendResult = { ok: false, message: this._message(error) };
          this._render();
        } finally {
          button.disabled = false;
        }
      });
    });
    this.shadowRoot.querySelector("#customImageTemplateFile")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) this._importCustomImageTemplate(file);
      event.target.value = "";
    });
    this.shadowRoot.querySelector("[data-custom-image-studio-upload]")?.addEventListener("click", () => {
      this.shadowRoot.querySelector("#customImageStudioFile")?.click();
    });
    this.shadowRoot.querySelector("#customImageStudioFile")?.addEventListener("change", async (event) => {
      for (const file of [...(event.target.files || [])]) await this._importCustomImageTemplate(file);
      event.target.value = "";
    });
    this.shadowRoot.querySelector("[data-custom-image-save]")?.addEventListener("click", async () => {
      try {
        await this._saveDisplayTemplateDraft();
        this._templateSaveResult = { ok: true, message: "Galerie a nastavení střídání byly uloženy pro tento displej." };
      } catch (err) {
        this._templateSaveResult = { ok: false, message: `Uložení galerie selhalo: ${this._message(err)}` };
      }
      this._render();
      this._paint();
    });
    this.shadowRoot.querySelector("[data-custom-image-download]")?.addEventListener("click", () => {
      const active = this._activeCustomImageAsset();
      const source = active ? this._paletteImageSrc(active) : this._customImageDataUrl;
      if (!source) return;
      const anchor = document.createElement("a");
      anchor.href = source;
      anchor.download = String(active?.name || this._customImageName || "dratek-eink.png").replace(/\.[^.]+$/, "") + "-eink.png";
      anchor.click();
    });
    this.shadowRoot.querySelector("[data-custom-image-gallery-focus]")?.addEventListener("click", () => {
      this.shadowRoot.querySelector("[data-custom-image-gallery]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    this.shadowRoot.querySelectorAll("[data-custom-image-select]").forEach((button) => button.addEventListener("click", async () => {
      const asset = (this._templateImageLibrary || []).find((item) => item.id === button.dataset.customImageSelect);
      if (!asset) return;
      this._customImageActiveId = asset.id;
      this._customImageSourceUrl = asset.source || asset.src;
      this._customImageVariants = structuredClone(asset.variants || {});
      this._customImageDataUrl = this._paletteImageSrc(asset);
      this._customImageName = asset.name || "Obrázek";
      this._render();
      this._paint();
      try {
        if (asset.fit_mode !== this._customImageFitMode && (asset.source || asset.src)) {
          await this._convertCustomImageTemplateSource(asset.source || asset.src, asset.name || "Obrázek");
        }
        await this._saveDisplayTemplateDraft?.();
      } catch (error) {
        this._templateSaveResult = { ok: false, message: `Přizpůsobení obrázku selhalo: ${this._message(error)}` };
        this._render();
      }
    }));
    this.shadowRoot.querySelectorAll("[data-custom-image-cycle]").forEach((input) => input.addEventListener("change", () => {
      const id = input.dataset.customImageCycle;
      const ids = new Set(this._customImageCycleIds || []);
      if (input.checked && ids.size < 12) ids.add(id);
      else ids.delete(id);
      this._customImageCycleIds = [...ids];
      if (this._customImageCycleIds.length < 2) this._customImageCycleEnabled = false;
      this._render();
      this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    }));
    this.shadowRoot.querySelector("[data-custom-image-cycle-enabled]")?.addEventListener("change", (event) => {
      this._customImageCycleEnabled = event.target.checked && (this._customImageCycleIds || []).length > 1;
      this._render();
      this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    });
    this.shadowRoot.querySelector("[data-custom-image-cycle-minutes]")?.addEventListener("change", (event) => {
      this._customImageCycleMinutes = Math.max(1, Math.min(1440, Number(event.target.value) || 10));
      this._render();
      this._paint();
      this._saveDisplayTemplateDraft?.().catch(() => {});
    });
    this.shadowRoot.querySelector("[data-custom-image-fit-mode]")?.addEventListener("change", async (event) => {
      this._customImageFitMode = ["cover", "contain", "stretch"].includes(event.target.value)
        ? event.target.value
        : "cover";
      const activeId = this._customImageActiveId;
      const assets = [...(this._templateImageLibrary || [])];
      try {
        for (const asset of assets) {
          if (asset?.source || asset?.src) {
            await this._convertCustomImageTemplateSource(asset.source || asset.src, asset.name || "Obrázek");
          }
        }
        const active = (this._templateImageLibrary || []).find((asset) => asset.id === activeId)
          || this._activeCustomImageAsset();
        if (active) {
          this._customImageActiveId = active.id;
          this._customImageSourceUrl = active.source || active.src;
          this._customImageVariants = structuredClone(active.variants || {});
          this._customImageDataUrl = this._paletteImageSrc(active);
          this._customImageName = active.name || "Obrázek";
        }
        await this._saveDisplayTemplateDraft?.();
        this._templateSaveResult = { ok: true, message: "Všechny obrázky byly znovu přizpůsobeny rozměrům displeje." };
      } catch (error) {
        this._templateSaveResult = { ok: false, message: `Přizpůsobení obrázku selhalo: ${this._message(error)}` };
      }
      this._render();
      this._paint();
    });
    this.shadowRoot.querySelectorAll("[data-custom-image-remove]").forEach((button) => button.addEventListener("click", async () => {
      const id = button.dataset.customImageRemove;
      const address = String(this._selectedDeviceAddress || "").toUpperCase();
      button.disabled = true;
      try {
        if (address && this._hass) {
          await this._hass.callWS({
            type: "dratek_eink/device_drafts/delete_image",
            address,
            image_id: id,
          });
        }
        this._templateImageLibrary = (this._templateImageLibrary || []).filter((asset) => asset.id !== id);
        this._customImageCycleIds = (this._customImageCycleIds || []).filter((assetId) => assetId !== id);
        if (this._customImageActiveId === id) {
          const next = this._templateImageLibrary[0];
          this._customImageActiveId = next?.id || "";
          this._customImageSourceUrl = next?.source || "";
          this._customImageVariants = structuredClone(next?.variants || {});
          this._customImageDataUrl = next ? this._paletteImageSrc(next) : "";
          this._customImageName = next?.name || "";
        }
        if (this._customImageCycleIds.length < 2) this._customImageCycleEnabled = false;
        await this._saveDisplayTemplateDraft?.();
        this._templateSaveResult = { ok: true, message: "Obrázek i jeho uložená data byly trvale odstraněny." };
      } catch (error) {
        this._templateSaveResult = { ok: false, message: `Smazání obrázku selhalo: ${this._message(error)}` };
      }
      this._render();
      this._paint();
    }));
    const imageStage = this.shadowRoot.querySelector("[data-custom-image-stage]");
    if (imageStage) {
      const image = imageStage.querySelector("img");
      const applyStageTransform = () => {
        const zoom = Math.max(0.5, Math.min(16, Number(this._customImageStudioZoom || 1)));
        image?.style.setProperty("--image-zoom", String(zoom));
        image?.style.setProperty("--image-pan-x", `${this._customImageViewportPan?.x || 0}px`);
        image?.style.setProperty("--image-pan-y", `${this._customImageViewportPan?.y || 0}px`);
        imageStage.classList.toggle("is-pixel-zoom", zoom >= 2);
        const value = this.shadowRoot.querySelector("[data-image-stage-zoom-value]");
        if (value) value.textContent = `${Math.round(zoom * 100)} %`;
      };
      applyStageTransform();
      imageStage.addEventListener("wheel", (event) => {
        event.preventDefault();
        const current = Math.max(0.5, Math.min(16, Number(this._customImageStudioZoom || 1)));
        const factor = event.deltaY < 0 ? 1.22 : 1 / 1.22;
        this._customImageStudioZoom = Math.max(0.5, Math.min(16, Math.round(current * factor * 100) / 100));
        applyStageTransform();
      }, { passive: false });
      let stagePan = null;
      imageStage.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        stagePan = { x: event.clientX, y: event.clientY, left: this._customImageViewportPan?.x || 0, top: this._customImageViewportPan?.y || 0 };
        imageStage.setPointerCapture?.(event.pointerId);
        imageStage.classList.add("is-panning");
      });
      imageStage.addEventListener("pointermove", (event) => {
        if (!stagePan) return;
        this._customImageViewportPan = { x: stagePan.left + event.clientX - stagePan.x, y: stagePan.top + event.clientY - stagePan.y };
        applyStageTransform();
      });
      const stopStagePan = () => { stagePan = null; imageStage.classList.remove("is-panning"); };
      imageStage.addEventListener("pointerup", stopStagePan);
      imageStage.addEventListener("pointercancel", stopStagePan);
    }
    [
      { id: "mrOptPrecipitation", key: "meteoradar_show_precipitation" },
      { id: "mrOptDotted", key: "meteoradar_dotted_light" },
      { id: "mrOptWind", key: "meteoradar_show_wind" },
    ].forEach(({ id, key }) => {
      const input = this.shadowRoot.querySelector(`#${id}`);
      if (input) {
        input.addEventListener("change", () => {
          const checked = input.checked;
          if (!this._displayTemplateConfig) this._displayTemplateConfig = {};
          this._displayTemplateConfig[key] = checked;
          const address = input.dataset.deviceAddress || this._selectedDeviceAddress;
          const upperAddr = String(address || "").toUpperCase();
          if (upperAddr) {
            if (!this._deviceDrafts) this._deviceDrafts = {};
            const draft = this._deviceDrafts[upperAddr] || {};
            if (!draft.template_config) draft.template_config = {};
            draft.template_config[key] = checked;
            this._deviceDrafts[upperAddr] = draft;
          }
          this._scheduleDraftSave();
          this._render();
          this._paint();
        });
      }
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
    this.shadowRoot.querySelector("#imageFile")?.addEventListener("change", (event) => this._addImage(event.target.files[0]));
    this.shadowRoot.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => this._addObject(button.dataset.add)));
    this.shadowRoot.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => this._applyTemplate(button.dataset.template)));
    this.shadowRoot.querySelector("#undoAction")?.addEventListener("click", () => this._undo());
    this.shadowRoot.querySelector("#redoAction")?.addEventListener("click", () => this._redo());
    this.shadowRoot.querySelector("#duplicateSelected")?.addEventListener("click", () => this._duplicateSelected());
    this.shadowRoot.querySelector("#deleteSelected")?.addEventListener("click", () => this._deleteSelected());
    this.shadowRoot.querySelector("#clearDesign")?.addEventListener("click", () => this._clearDesign());
    this.shadowRoot.querySelector("#rotateSelected")?.addEventListener("click", () => this._rotateSelected());
    this.shadowRoot.querySelector("#mirrorSelected")?.addEventListener("click", () => this._mirrorSelected());
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
    this.shadowRoot.querySelectorAll("[data-gateway-map-mode]").forEach((button) => button.addEventListener("click", () => {
      this._gatewayMapMode = button.dataset.gatewayMapMode;
      this._saveUiPreference("gateway-map-mode", this._gatewayMapMode);
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-map-focus-device]").forEach((node) => node.addEventListener("click", () => {
      const address = node.dataset.mapFocusDevice;
      this._gatewayMapFocusAddress = this._gatewayMapFocusAddress === address ? "" : address;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelector("[data-map-reset-view]")?.addEventListener("click", () => {
      this._gatewayMapView = { scale: 1, x: 0, y: 0 };
      this._render();
      this._paint();
    });
    // Stary uzel se vzdy zahodi spolu s .page - listenery zavesene na nem same
    // odejdou s nim, ale ty pripojene na window (kolo/tazeni presahujici svg)
    // je treba odpojit rucne, jinak by se pri kazdem _bind() hromadily.
    if (this._gwmapPanMove) window.removeEventListener("mousemove", this._gwmapPanMove);
    if (this._gwmapPanEnd) window.removeEventListener("mouseup", this._gwmapPanEnd);
    const gwmapSvg = this.shadowRoot.querySelector(".gwmap-svg");
    if (gwmapSvg) this._bindGatewayMapViewport(gwmapSvg);
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
    canvas?.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    canvas?.addEventListener("pointermove", (event) => this._onPointerMove(event));
    canvas?.addEventListener("pointerup", () => this._onPointerUp());
    canvas?.addEventListener("pointerleave", () => this._onPointerUp());
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => input.addEventListener("input", (event) => this._readProperties(event)));
    this.shadowRoot.querySelectorAll("[data-inspector-prop]").forEach((button) => button.addEventListener("click", () => {
      this._setInspectorProperty(button.dataset.inspectorProp, button.dataset.inspectorValue);
    }));
  },

  _inspectorSection(icon, title, body, open = false) {
    return `<details class="inspector-section" ${open ? "open" : ""}><summary class="inspector-section-title"><ha-icon icon="${icon}"></ha-icon><span>${title}</span><ha-icon class="inspector-chevron" icon="mdi:chevron-down"></ha-icon></summary><div class="inspector-section-body">${body}</div></details>`;
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

    if (object.type === "rect") return `${geometry}${this._inspectorSection("mdi:palette-outline", "Výplň a rámeček", `${this._inspectorColor("fill", object.fill, "Výplň", ["none", "black", "red", "white"])}${this._inspectorColor("stroke", object.stroke, "Rámeček", ["none", "black", "red"])}<div class="field"><label><ha-icon icon="mdi:format-line-weight"></ha-icon>Síla rámečku</label><input data-prop="strokeWidth" type="number" min="0" value="${object.strokeWidth || 0}"></div>`)}`;

    if (object.type === "chart") {
      const chart = this._inspectorSection("mdi:chart-box-outline", "Graf", `
        ${this._inspectorSegments("chartType", object.chartType || "bar", [{ value: "line", label: "Spojnicový", icon: "mdi:chart-line" }, { value: "bar", label: "Sloupcový", icon: "mdi:chart-bar" }, { value: "area", label: "Plošný", icon: "mdi:chart-areaspline" }], "Typ grafu")}
        <div class="field"><label><ha-icon icon="mdi:format-title"></ha-icon>Název</label><input data-prop="chartTitle" value="${this._escape(object.chartTitle || "")}"></div>
        <div class="field"><label><ha-icon icon="mdi:code-array"></ha-icon>Data</label><textarea data-prop="data" rows="3" placeholder="2.10, 2.35, 2.18">${this._escape(object.data || "")}</textarea></div>
        <div class="field"><label><ha-icon icon="mdi:label-multiple-outline"></ha-icon>Popisky bodů</label><input data-prop="chartLabels" value="${this._escape(object.chartLabels || "")}" placeholder="00, 03, 06, 09"></div>
        <div class="row"><div class="field"><label>Osa X</label><input data-prop="xLabel" value="${this._escape(object.xLabel || "")}"></div><div class="field"><label>Osa Y</label><input data-prop="yLabel" value="${this._escape(object.yLabel || "")}"></div></div>
        <div class="row"><div class="field"><label>Časové okno (historie)</label><select data-prop="time_range_hours"><option value="1" ${Number(object.time_range_hours) === 1 ? "selected" : ""}>1 hodina</option><option value="6" ${Number(object.time_range_hours) === 6 ? "selected" : ""}>6 hodin</option><option value="24" ${Number(object.time_range_hours || 24) === 24 ? "selected" : ""}>24 hodin (1 den)</option><option value="168" ${Number(object.time_range_hours) === 168 ? "selected" : ""}>7 dní</option></select></div><div class="field"><label>Velikost textu</label><input data-prop="legendFontSize" type="number" min="10" max="24" value="${Number(object.legendFontSize || 12)}"></div></div>
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
    if (this._displaySupportsYellow?.() && colors.includes("red") && !colors.includes("yellow")) {
      const whiteIndex = colors.indexOf("white");
      colors = [...colors];
      colors.splice(whiteIndex >= 0 ? whiteIndex : colors.length, 0, "yellow");
    }
    const names = { none: "Žádná", original: "Původní", black: "Černá", red: "Červená", yellow: "Žlutá", white: "Bílá" };
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
    if (object.type === "chart") object.legendFontSize = Math.max(10, Math.min(24, Number(object.legendFontSize || 12)));
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
