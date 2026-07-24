# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

---

## [0.1.89] - 2026-07-24

### 🐛 Opravy & Vylepšení
- **Oprava `this._saveProjects is not a function`**: Nahrazena neexistující metoda správným uložením konceptů prvků a výkresů zařízení `_saveCachedDeviceDrafts()`. Ukládání vlastních prvků v Editoru prvku nyní probíhá zcela bezchybně.
- **Výběr cílové hodnoty / atributu entity u všech grafů a ukazatelů**:
  - Přidáno pole `Atribut entity / Zaměřená hodnota` pro sloupcové ukazatele, koláčové/donut grafy, posuvníky a potenciometry.
  - Každý graf/ukazatel se nyní může zaměřit buď na hlavní stav entity (`state`), nebo na jakýkoliv konkrétní atribut (např. `temperature`, `humidity`, `battery`, `power`, `current`, `voltage`, `pressure` atd.).
  - **Testovací / Náhledová hodnota (`sample_value`)**: Přidána možnost zadat manuální číselnou hodnotu (např. `75` nebo `45.2`) pro okamžité otestování polohy a plnění ručičky/čáry v nákresu.
- **Synchronizace PIL backendu**: Modul `render.py` automaticky extrahuje cílový atribut z Home Assistant entit i pro automatické aktualizace eInk displejů.

---

## [0.1.88] - 2026-07-24
- Dynamické ukazatele (Sloupcový, Koláč/Donut, Posuvník, Potenciometr), Queue Suite Overhaul & Oficiální CHANGELOG.md.

## [0.1.87] - 2026-07-24
- Hotfix SyntaxError v `render.py` pro bezproblémové nahrání integrace v Home Assistantu.

## [0.1.86] - 2026-07-24
- Vydání dynamických grafů, posuvníků, potenciometrů a opravy ikon entit.

## [0.1.85] - 2026-07-23
- Vylepšení vizualizací a stabilizace přenosových front.

## [0.1.84] - 2026-07-23
- Kompletní oprava otáčení displejů (Orientation & Transform Overhaul).

## [0.1.82] - 2026-07-23
- Vyčištění repozitáře pro plnou kompatibilitu s HACS.
