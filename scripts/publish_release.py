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
        tag="v0.1.309",
        name="DRATEK eInk v0.1.309",
        body="""## Release 0.1.309

### Opraveno a vylepšeno
- **Oprava překrývání grafiky a terminálu v záložce Gatewayí**: Odstraněna umělá výšková omezení a vnitřní scroll-trapy (`calc(100vh - ...)` s `overflow: hidden`) na stránce gatewayí. Layout kroků 1–4 a konzole nahrávání se nyní plynule přizpůsobuje šířce okna se striktním `box-sizing`, žádné karty se nepřekrývají a terminál se při spuštění flashování plynule odroluje na viditelné místo.
- **Oprava čísla verze ve frontendu**: Zajištěno okamžité promítnutí čísla verze v záhlaví panelu a přehledové karty bez držení staré cache.
""",
    )
