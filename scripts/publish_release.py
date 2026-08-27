"""Create GitHub releases with attached dratek_eink.zip using GitHub API token."""

import json
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TOKEN_FILE = ROOT / ".github" / "accesstoken.txt"
ZIP_FILE = ROOT / "dratek_eink.zip"
REPO = "dratek-cz/dratek-eink-homeassistant"


def create_release(tag: str, name: str, body: str) -> None:
    token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "DRATEK-Release-Bot",
    }

    # 1. Create Release
    url = f"https://api.github.com/repos/{REPO}/releases"
    data = json.dumps({
        "tag_name": tag,
        "name": name,
        "body": body,
        "draft": False,
        "prerelease": False,
    }).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            release = json.loads(resp.read().decode("utf-8"))
            print(f"Created release {release['id']} for {tag}")
            upload_url = release["upload_url"].split("{")[0]
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        if "already_exists" in err:
            print(f"Release for {tag} already exists, finding it...")
            get_req = urllib.request.Request(f"{url}/tags/{tag}", headers=headers)
            with urllib.request.urlopen(get_req) as get_resp:
                release = json.loads(get_resp.read().decode("utf-8"))
                upload_url = release["upload_url"].split("{")[0]
                # Delete existing assets if present
                for asset in release.get("assets", []):
                    if asset["name"] == "dratek_eink.zip":
                        del_req = urllib.request.Request(asset["url"], headers=headers, method="DELETE")
                        with urllib.request.urlopen(del_req):
                            print(f"Deleted previous asset {asset['id']}")
        else:
            raise RuntimeError(f"Failed to create release: {e} - {err}")

    # 2. Upload dratek_eink.zip asset
    zip_bytes = ZIP_FILE.read_bytes()
    upload_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/zip",
        "User-Agent": "DRATEK-Release-Bot",
    }
    asset_url = f"{upload_url}?name=dratek_eink.zip"
    upload_req = urllib.request.Request(
        asset_url, data=zip_bytes, headers=upload_headers, method="POST"
    )
    try:
        with urllib.request.urlopen(upload_req) as resp:
            asset = json.loads(resp.read().decode("utf-8"))
            print(f"Uploaded asset {asset['name']} ({len(zip_bytes)} bytes)")
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        print(f"Asset upload notice: {e} - {err}")


if __name__ == "__main__":
    create_release(
        tag="v0.1.347",
        name="DRATEK eInk v0.1.347",
        body="""## Release 0.1.347

### Přidáno
- Novou gateway jde vyrobit i z počítače, u kterého sedíte. Krok „Nová gateway" nabízí obě cesty - ESP32 zapojenou do zařízení s Home Assistantem jako dosud, nebo do tohoto počítače. Prohlížečová cesta zapisuje firmware přes Web Serial a Home Assistant u toho nemusí být.
- Prohlížečové nahrání dojde až k hotové gatewayi: po zápisu firmwaru pošle desce Wi-Fi konfiguraci, vyčte z ní přidělenou IP adresu a gateway sám přidá do seznamu.
- Každý zapsaný obraz se ověří otiskem MD5 a konzole nahrávání ukazuje průběh. Ověření desky i volba „Jen Wi-Fi" fungují v prohlížečové cestě stejně jako u nahrávání přes server.

### Vylepšeno
- Obě cesty nahrávání čtou stejné profily obrazů, offsetů i mazaných NVS oblastí, takže nemohou zapsat rozdílný výsledek.
- Bez HTTPS nebo bez podpory Web Serial panel vysvětlí proč to nejde a pošle uživatele na nahrání přes zařízení s Home Assistantem.

### Opraveno
- Vybraná zastávka u šablony Odjezdy zůstane uložená. Ukládala se teprve po úspěšném načtení živé tabule, takže každý výpadek jízdních řádů volbu zahodil a výběr se vrátil prázdný.
- Odjezdy se načítají znovu samy. Tabule žila jen do zavření stránky - po znovuotevření displeje se hlavička jmenovala správnou zastávkou, ale čtyři spoje pod ní byly ukázková data, a ruční odeslání je poslalo i na displej. Náhled se teď při otevřené šabloně sám drží aktuální a odeslání počká na živá data.
- Tabule odjezdů se už nekreslí dvakrát. Automatizace uložené před verzí 0.1.346 mají zapsané jiné souřadnice řádku, než na kterých byl vykreslený; takové automatizace teď automatická aktualizace překreslí celou šablonou místo mazání a dokreslování do špatného obdélníku, takže stará tabule nezůstane vidět pod novou. Po dalším uložení automatizace se vrátí rychlejší způsob.
""",
    )
