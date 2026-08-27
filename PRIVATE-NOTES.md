# Interní poznámky – co odstranit před finálním prodejním vydáním

Tento soubor je pracovní poznámka pro nás, ne dokumentace pro uživatele.
Repozitář je zatím pracovní; až se bude připravovat **finální vydání pro prodej
displejů**, musí z něj následující věci zmizet.

---

## 1. Šablona „Logo Drátek“ (hromadné odeslání na všechny displeje)

Firemní šablona pro showroom: jedním kliknutím zruší u každého známého displeje
automatickou aktualizaci, vyprázdní jeho čekající frontu a pošle na něj logo
Drátek přes celý panel. Logo vzniká deteringem skutečné ikony integrace, zvlášť
pro tříbarevný a zvlášť pro čtyřbarevný displej. Zákazník tuhle funkci nemá
dostat.

**Odstranit:**

| Soubor | Co s ním |
| --- | --- |
| `custom_components/dratek_eink/frontend/panel/templates/dratek_logo.js` | smazat celý soubor |
| `custom_components/dratek_eink/frontend/panel/panel-brand-logo.mixin.js` | smazat celý soubor |
| `custom_components/dratek_eink/frontend/panel/templates/index.js` | odebrat `import … dratek_logo.js` a položku `dratekLogo` z `DISPLAY_TEMPLATES` |
| `custom_components/dratek_eink/frontend/dratek-eink-panel.js` | odebrat `import { brandLogoMixin }` a `brandLogoMixin` z `Object.assign` |
| `custom_components/dratek_eink/frontend/panel/panel-template-svg.mixin.js` | odebrat `_blockBrandLogo`, řádek `if (row.brandLogo) …` v `_renderTemplateBlock`, `\|\| rows[0]?.brandLogo` v `_layoutTemplateSvg`, řádek `await this._preloadBrandLogoDither…` v `_buildDisplayTemplateSvg` a podmínku `rows.some((row) => row?.brandLogo)` v `_templateSvgThumbnail` |
| `custom_components/dratek_eink/frontend/panel/panel-devices.mixin.js` | odebrat větev `if (template.broadcast) { … }` v katalogové kartě |
| `custom_components/dratek_eink/frontend/panel/panel-inspector.mixin.js` | odebrat obě větve `broadcast` (v `openDisplayTemplate` a v obsluze kliknutí na dlaždici) |
| `custom_components/dratek_eink/frontend/panel/panel-render-ui.mixin.js` | odebrat blok CSS `.display-template-broadcast-*` / `.is-broadcast-*` |
| `custom_components/dratek_eink/frontend/panel/panel-i18n.mixin.js` | odebrat překlady označené komentářem „INTERNAL“ |
| `tests/test_brand_logo_broadcast.py` | smazat celý soubor |
| `tests/test_display_template_shapes.py` | odebrat `"dratek_logo"` ze `SINGLE_ROW_TEMPLATES` |
| `tests/test_frontend_tool_library.py` | vrátit počet `number: "` z 25 zpět na 24 |

> Obrázky `frontend/dratek-eink-logo.png` a `frontend/dratek-eink-header.png`
> **nemazat** – šablona z nich jen čte, používá je i hlavička panelu.

Všechna místa v kódu jsou označená komentářem `INTERNAL` a odkazem na tento
soubor, takže je najdete i grepem:

```bash
grep -rn "PRIVATE-NOTES" custom_components tests
```

Po odstranění musí projít celá sada testů:

```bash
python -m unittest discover -s tests -p "test_*.py"
```

---

## 2. Ostatní

Zatím nic dalšího. Nové interní věci přidávejte sem stejným způsobem –
komentář `INTERNAL` v kódu + řádek v tabulce výše.
