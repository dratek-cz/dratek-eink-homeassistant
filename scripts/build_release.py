"""Build the HACS release archive with portable POSIX member paths."""

from __future__ import annotations

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def build_release(output: Path) -> None:
    """Write component files to a HACS ZIP without Windows path separators."""
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for source in sorted(COMPONENT.rglob("*")):
            if not source.is_file():
                continue
            relative = source.relative_to(COMPONENT)
            if "__pycache__" in relative.parts or source.suffix in {".pyc", ".pyo"}:
                continue
            archive.write(source, relative.as_posix())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, help="Destination dratek_eink.zip")
    args = parser.parse_args()
    build_release(args.output.resolve())


if __name__ == "__main__":
    main()
