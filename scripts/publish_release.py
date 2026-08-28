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
        tag="v0.1.351",
        name="DRATEK eInk v0.1.351",
        body="""## Release 0.1.351

### Přidáno
- Nenastavená nebo jen částečně napojená šablona má výrazné upozornění přes celý náhled v katalogu i na ploše displeje. Vrstva je průhledná, takže je pod ní kresba šablony pořád vidět, hláška sedí na vlastní bílé kartičce a tlačítko Nastavit je jediná klikatelná věc na ní. Šablonu s ukázkovými daty jde stále odeslat.

### Vylepšeno
- Šablony Topení, Kvalita vzduchu a Spotřeba vody přerovnané: budík si řádek rozdělí na oblouk a pás pro stupnici, takže popisky nepadají přes další řádek; AQI je na Kvalitě vzduchu nahoře; Spotřeba vody dala víc místa sedmidenní křivce.
- Grafy, rozdělené řádky a dvouřádkové pruhy se už nekreslí přes sebe – opraveno v prohlížeči i v serverovém vykreslování, takže ruční odeslání a automatická aktualizace zůstávají shodné.
- Nabídka úprav šablony rozdělená podle významu: data, vzhled a soubor šablony.
- Odjezdy: dvě zastávky na jedné tabuli, větší ikona vozidla, počet spojů podle výšky displeje, čas a datum místo neexistující vzdálenosti.
- Nákupní seznam čte skutečnou entitu `todo.*`.
- Meteoradar na výšku má spravenou předpověď, logo Drátek se na malých displejích tiskne plnou barvou.

### Opraveno
- Gateway se sama zotaví ze zaseknutého přenosu (firmware 0.1.62): tři minuty bez postupu nebo deset minut celkem ukončí přenos a restartují bránu, místo aby čekala na odpojení od napájení. Po aktualizaci spusťte v panelu „Nahrát firmware“.
- Wi-Fi: QR kód bez žlutého podkladu, název sítě a heslo se už neořezávají ani na štítku na šířku.
- Odjezdy: čas se neosekává na „7:…“ ani odpočet na „za 12 m…“.
- Kliknutí na displej v přehledové kartě otevře ten displej, na který se kliklo naposledy.
""",
    )
