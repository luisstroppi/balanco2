import csv
import difflib
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


NON_FOOD_TERMS = (
    "algodon", "fibra", "fibrilla", "linter", "cascarilla", "planta", "plantin",
    "vivero", "pino", "eucalipt", "palmera", "rosal", "fresno", "lapacho",
    "alamo", "acacia", "arborea", "lenosa", "suculenta", "cespitosa", "epifita",
    "trepadora", "estaca", "esqueje", "semilla", "pallet", "tabaco", "jacaranda",
    "paraiso", "casuarina", "braquiquito", "chamaedorea", "palo borracho",
    "orquidea", "ibira", "aguaribay", "chivato", "tipa", "cana fistula", "timbo",
    "sauce", "encina", "helecho", "aloe", "juniperus", "jojoba", "peteribi",
)

HORTICULTURE_TERMS = (
    "PIMIENTO", "ZANAHORIA", "ZAPALLO", "ZAPALLITO", "ZUCCHINI", "TOMATE",
    "BERENJENA", "SANDIA", "MELON", "BROCOLI", "COLIFLOR", "LECHUGA",
    "ACELGA", "ACHICORIA",
)


def norm(value):
    value = unicodedata.normalize("NFD", (value or "").upper())
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return re.sub(r"[^A-Z0-9]+", " ", value).strip()


def product_group(product):
    value = norm(product)
    # SENASA registra varias hortalizas por unidad como planta o plantín. La
    # clasificación analítica debe reconocer primero el producto y conservar
    # su denominación original para no ocultarlo como material vegetal.
    if any(term in value for term in HORTICULTURE_TERMS):
        return "Hortalizas"
    if any(term in value.lower() for term in NON_FOOD_TERMS):
        return "Material vegetal y otros"
    if any(term in value for term in ("LIMON", "NARANJA", "MANDARINA", "POMELO", "LIMA", "KUMQUAT", "TANGELO", "BERGAMOTA")):
        return "Cítricos"
    if any(term in value for term in ("BANANA", "PLATANO", "PALTA", "MANGO", "PAPAYA", "KIWI")):
        return "Frutas tropicales"
    if any(term in value for term in ("PAPA", "CEBOLLA", "AJO", "BATATA", "OCA")):
        return "Tubérculos y bulbos"
    if any(term in value for term in ("PERA", "MANZANA", "DURAZNO", "CIRUELA", "PELON", "MEMBRILLO", "DAMASCO", "CEREZA", "HIGO")):
        return "Frutas de pepita y carozo"
    if "UVA" in value or "VID" in value:
        return "Uvas y derivados"
    if any(term in value for term in ("PISTACHO", "NUEZ", "AVELLANA", "PECAN", "DESECAD", "PASA")):
        return "Frutos secos y desecados"
    return "Otros productos SENASA"


def haversine(lat1, lon1, lat2, lon2):
    radius = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_georef(departments_path, provinces_path):
    departments = json.loads(Path(departments_path).read_text())["departamentos"]
    provinces = json.loads(Path(provinces_path).read_text())["provincias"]
    province_centroids = {
        norm(item["nombre"]): (item["centroide"]["lat"], item["centroide"]["lon"], item["nombre"])
        for item in provinces
    }
    by_province = defaultdict(dict)
    for item in departments:
        province = norm(item["provincia"]["nombre"])
        by_province[province][norm(item["nombre"])] = (
            item["centroide"]["lat"], item["centroide"]["lon"], item["nombre"]
        )
    return by_province, province_centroids


def match_location(province_raw, department_raw, by_province, province_centroids, cache):
    cache_key = (province_raw, department_raw)
    if cache_key in cache:
        return cache[cache_key]
    province = norm(province_raw)
    department = norm(department_raw)
    if province == "TIERRA DEL FUEGO":
        province = next((key for key in province_centroids if key.startswith("TIERRA DEL FUEGO")), province)
    if province == "SIN DETERMINAR" or province not in province_centroids:
        result = None
    else:
        candidates = by_province.get(province, {})
        if department in candidates:
            lat, lon, official = candidates[department]
            result = (lat, lon, official, "departamento")
        else:
            close = difflib.get_close_matches(department, candidates.keys(), n=1, cutoff=0.82)
            if close:
                lat, lon, official = candidates[close[0]]
                result = (lat, lon, official, "aproximado")
            else:
                lat, lon, official_province = province_centroids[province]
                result = (lat, lon, department_raw.title(), "provincia")
    cache[cache_key] = result
    return result


def main():
    if len(sys.argv) != 5:
        raise SystemExit("Uso: build_data.py movimientos.csv|directorio_csv departamentos.json provincias.json salida.json")
    csv_source, departments_path, provinces_path, output_path = sys.argv[1:]
    source_path = Path(csv_source)
    if source_path.is_dir():
        csv_paths = sorted(source_path.glob("SENASA_DTV_????_T?.csv"))
    else:
        csv_paths = [source_path]
    if not csv_paths:
        raise SystemExit(f"No se encontraron CSV de movimientos en {source_path}")
    by_province, province_centroids = load_georef(departments_path, provinces_path)
    cache = {}
    aggregates = defaultdict(lambda: [0, 0.0, 0, 0.0])
    source_rows = included_rows = geocoded_rows = plausible_rows = same_area_rows = 0
    match_quality = Counter()
    included_products = Counter()

    for csv_path in csv_paths:
        print(f"Procesando {csv_path.name}...", flush=True)
        with open(csv_path, encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                source_rows += 1
                group = product_group(row["PRODUCTO"])
                included_rows += 1
                included_products[row["PRODUCTO"]] += 1
                try:
                    mass_kg = float(row["PESO TOTAL"].replace(",", "."))
                except ValueError:
                    continue
                origin = match_location(row["PROVINCIA ORIGEN"], row["PARTIDO ORIGEN"], by_province, province_centroids, cache)
                destination = match_location(row["PROVINCIA DESTINO"], row["PARTIDO DESTINO"], by_province, province_centroids, cache)
                if not origin or not destination:
                    continue
                geocoded_rows += 1
                match_quality[origin[3]] += 1
                match_quality[destination[3]] += 1
                lat1, lon1, origin_name, origin_quality = origin
                lat2, lon2, destination_name, destination_quality = destination
                distance = haversine(lat1, lon1, lat2, lon2)
                same_area = norm(row["PROVINCIA ORIGEN"]) == norm(row["PROVINCIA DESTINO"]) and norm(origin_name) == norm(destination_name)
                if same_area:
                    same_area_rows += 1
                date_parts = row["FECHA EMISIÓN"].split("-")
                month = int(date_parts[1]) if len(date_parts) == 3 else 0
                year = int(date_parts[2]) if len(date_parts) == 3 else 0
                key = (
                    year, month, group, row["PRODUCTO"].strip(),
                    row["PROVINCIA ORIGEN"].title(), origin_name, round(lat1, 5), round(lon1, 5), origin_quality,
                    row["PROVINCIA DESTINO"].title(), destination_name, round(lat2, 5), round(lon2, 5), destination_quality,
                    round(distance, 2), 1 if same_area else 0,
                )
                item = aggregates[key]
                item[0] += 1
                item[1] += mass_kg / 1000
                plausible = 0 < mass_kg <= 60000
                if plausible:
                    plausible_rows += 1
                    item[2] += 1
                    item[3] += mass_kg / 1000

    records = []
    for key, values in aggregates.items():
        (year, month, group, product, op, od, olat, olon, oq, dp, dd, dlat, dlon, dq, km, same) = key
        records.append({
            "y": year, "mo": month, "g": group, "p": product,
            "op": op, "od": od, "olat": olat, "olon": olon, "oq": oq,
            "dp": dp, "dd": dd, "dlat": dlat, "dlon": dlon, "dq": dq,
            "km": km, "same": same,
            "n": values[0], "m": round(values[1], 3),
            "np": values[2], "mp": round(values[3], 3),
        })
    records.sort(key=lambda item: (item["y"], item["op"], item["dp"], item["g"], item["p"], item["od"], item["dd"]))
    payload = {
        "meta": {
            "dashboardRows": 8506233,
            "sourceRows": source_rows,
            "sourceFiles": len(csv_paths),
            "exportCoveragePct": 100 if len(csv_paths) == 23 else None,
            "completeDataset": len(csv_paths) == 23 and source_rows == 16154775,
            "includedRows": included_rows,
            "geocodedRows": geocoded_rows,
            "plausibleRows": plausible_rows,
            "sameAreaRows": same_area_rows,
            "routeGroups": len(records),
            "matchQuality": dict(match_quality),
            "scopeDefinition": "Incluye todos los productos con la nomenclatura original de SENASA y usa PESO TOTAL como kilogramos para estimar la carga transportada.",
            "distanceMethod": "Centroides departamentales GeoRef; distancia geodésica ajustada por factor vial. Viajes dentro del mismo departamento usan una distancia local configurable.",
            "sourceUpdated": "2026-09-03",
        },
        "factors": [
            {"id": "light", "label": "Utilitario ligero", "gPerTkm": 750},
            {"id": "medium", "label": "Camión mediano", "gPerTkm": 210},
            {"id": "heavy", "label": "Camión pesado", "gPerTkm": 95},
        ],
        "years": sorted({item["y"] for item in records}),
        "groups": sorted({item["g"] for item in records}),
        "products": sorted({item["p"] for item in records}),
        "originProvinces": sorted({item["op"] for item in records}),
        "destinationProvinces": sorted({item["dp"] for item in records}),
        "topProducts": [{"name": name, "trips": count} for name, count in included_products.most_common(12)],
        "records": records,
    }
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(payload["meta"], ensure_ascii=False))


if __name__ == "__main__":
    main()
