import gzip
import json
import sys
from pathlib import Path


def write_gzip_json(path, value):
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as target:
            target.write(payload)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Uso: split_dashboard_data.py dashboard_completo.json directorio_salida")
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    payload = json.loads(source.read_text(encoding="utf-8"))
    records = payload.pop("records")
    files = {}
    for year in payload["years"]:
        target = output / f"records-{year}.json.gz"
        year_records = [record for record in records if record["y"] == year]
        write_gzip_json(target, year_records)
        files[str(year)] = f"/data/{target.name}"
        print(f"{year}: {len(year_records):,} grupos; {target.stat().st_size / 1024 / 1024:.1f} MB", flush=True)
    payload["recordFiles"] = files
    payload["meta"]["deliveryMethod"] = "Particiones anuales comprimidas, cargadas bajo demanda."
    (output / "dashboard.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
