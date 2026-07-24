# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

---

## [0.1.88] - 2026-07-24

### 🚀 Novinky & Nové funkce
- **Dynamické grafy a vizualizace v Editoru prvku (Designer HA prvků)**:
  - **Sloupcové ukazatele (Bar Gauge)**: Horizontální i vertikální plnění podle hodnoty entity.
  - **Koláčové a Donut grafy (Pie / Donut Chart)**: Kruhové výseče s volitelným vnitřním výřezem (0–80 %).
  - **Posuvníky (Slider Widget)**: Posuvníkový ukazatel s vodicí dráhou, aktivní částí a jezdci.
  - **Potenciometry a Budíky (Rotary Dial / Gauge)**: Kruhové budíky s plynulým plnění rotační čáry (**Arc Fill**), rotující ručičkou (**Pointer Needle**) a volbou stupnice (240°, 180°, 360°).
- **Vlastní jednotky a rozsahy**:
  - Libovolné min/max limity (např. 0–100, -20 až +50) a podporované jednotky (`°C`, `%`, `kW`, `bar`, `lx`, `Pa`, `V`, `A` atd.).
- **Kompletně přepracovaná Fronta zápisu (Queue Suite)**:
  - Kapacita historie navýšena ze 20 na **100 záznamů**.
  - Vyhledávání podle zařízení, filtrování podle stavu, vyčištění historie a rychlé intervaly obnovení (10s a 15s).
  - Banner varování při přeskočení aktualizací s analytikou důvodů a dotčených zařízení.
- **Nový Designer displeje od nuly**:
  - Profesionální 3-sloupcový layout s 8 rezervačními body, rotací po 15°, zarovnáním a historii kroků.

### 🐛 Opravy & Stabilita
- **Hotfix SyntaxError v `render.py`**: Opravena chyba v syntaxi podmínek `render.py`, která způsobovala problém při nahrávání modulu v Home Assistantu.
- **Propagace prvků**: Úpravy v Designeru HA prvků se okamžitě dynamicky promítají na všechna plátna, uložené projekty i automatické aktualizace na displejích.
- **Oprava ikon prvků**: Správné zobrazení ikony rozšíření při přidávání registrů v Home Assistantu.
- **Sjednocení otáčení displejů**: Odstraněna duplicitní rotace a sjednocena transformace přímo v `render.py`.

---

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

## [0.1.70] - 2026-07-22
- Podpora vlastních prvků a vrstvených grafik.
