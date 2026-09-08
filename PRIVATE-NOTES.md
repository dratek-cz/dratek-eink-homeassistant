# Interní poznámky – co odstranit před finálním prodejním vydáním

Tento soubor je pracovní poznámka pro nás, ne dokumentace pro uživatele.
Vede se v něm, co nesmí být ve **vydání pro prodej displejů**.

Verze **1.0.0** je první takové vydání a je čistá — sekce 1 je odbytá. Nové
interní věci přidávejte níž stejným způsobem: komentář `INTERNAL` v kódu
plus řádek v tabulce, a najdete je pak i grepem.

---

## 1. Šablona „Logo Drátek“ — ODSTRANĚNO ve verzi 1.0.0

Hotovo. Firemní showroomová šablona (hromadné odeslání loga na všechny displeje
s předchozím zrušením automatizací a fronty) byla z `main` odstraněna při vydání
**1.0.0**, které je první prodejní verzí.

**Kde je, když ji budete potřebovat:** poslední build, který ji obsahuje, je tag
`v1.0.0-rc.1`. Vrátit se k ní jde třeba takhle:

```bash
git checkout v1.0.0-rc.1 -- custom_components/dratek_eink/frontend/panel/templates/dratek_logo.js
git checkout v1.0.0-rc.1 -- custom_components/dratek_eink/frontend/panel/panel-brand-logo.mixin.js
git checkout v1.0.0-rc.1 -- tests/test_brand_logo_broadcast.py
```

Zapojení (import mixinu, položka v katalogu, `_blockBrandLogo`, větve `broadcast`,
CSS a překlady) je v diffu commitu, který ji odebral — `git log --oneline -S brandLogo`.

**Pozor, tabulka v původním checklistu byla neúplná.** Kromě vyjmenovaných souborů
na mixin odkazovaly ještě dva testy, které v ní chyběly a shodily celou sadu:

| Soubor | Co v něm bylo |
| --- | --- |
| `tests/test_rendering_device_scope.py` | konstanta `BRAND_LOGO`, `_brandLogoRenderFor` v seznamu bran a modul v křížové kontrole `_pushRenderingDevice` |
| `tests/test_meteoradar_per_display_isolation.py` | `self.brand_logo` a modul v kontrole ručních zápisů `_renderingDeviceAddress` |

Kdyby se interní funkce někdy vracela, počítejte s tím, že ji tyhle dvě křížové
kontroly budou chtít zpátky ve svém seznamu modulů.

Obrázky `frontend/dratek-eink-logo.png` a `frontend/dratek-eink-header.png`
zůstaly — používá je hlavička panelu.

---

## 2. Ostatní

Zatím nic dalšího. Nové interní věci přidávejte sem stejným způsobem –
komentář `INTERNAL` v kódu + řádek v tabulce výše.
