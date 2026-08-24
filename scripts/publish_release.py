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
                        with urllib.request.urlopen(del_req) as del_resp:
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
        tag="v0.1.338",
        name="DRATEK eInk v0.1.338",
        body="""## Release 0.1.338

### Opraveno
- **Mapa připojení ukazovala gateway jako nevyužitou**, i když displeje obsluhovala: sken gatewayí se přeskočil pokaždé, když běžel přenos přes Bluetooth Home Assistantu, a výběr trasy ignoroval zapamatovaná zachycení i sílu signálu.
- **Z několika gatewayí nevyhrávala nejsilnější**, ale první v pořadí – mapa tak mohla ukazovat jinou gateway, než která zápis provedla.
- **Chyba při vykreslení řádku „split“ s ikonou** shodila automatické překreslení.
- **Teplota u vícedenní předpovědi bez jednotky** – dny nově ukazují „22°C“ stejně jako hlavní teplota.
- **Zamrzlá stránka Gatewaye** během pravidelné kontroly a zastavení automatiky při neúspěšném odpojení integrace.

### Zabezpečeno
- **Ovládání panelu vyžaduje účet správce.** Všech 51 příkazů, včetně přehrání firmwaru gatewaye přes USB a odeslání údajů k Wi-Fi po sériové lince, bylo dostupných každému přihlášenému uživateli.
- **Adresa gatewaye se ověřuje** místo toho, aby se neověřená skládala do webového požadavku.

### Vylepšeno
- **Podrobnosti skenu pod mapou připojení** vysvětlí, proč nějaká gateway zrovna nic neobsluhuje.
""",
    )
