#!/bin/bash

# This script should be run in "openmaptiles" folder

# ---------------------------------------------------------------------------
# Fetch OSM data for the BNBU area.
#
# Primary source: osm.asia mirror.
#   1. Fetch https://osm.asia/ and extract the Vite JS bundle path from the
#      <script type="module" src="/assets/index-<hash>.js"> tag.
#   2. Fetch that JS bundle and extract the Zhuhai PBF download URL from the
#      `{id:"zhuhai",...,versions:[{label:"latest",url:"..."}]}` entry.
#   3. Download the Zhuhai PBF.
#
# Fallback: if osm.asia is unreachable or its structure changes, fall back to
# the original Geofabrik Guangdong extract and clip it down.
# ---------------------------------------------------------------------------

BNBU_BBOX="113.502514,22.3406,113.554241,22.388225"
ZHUHAI_PBF_FETCHED=0

fetch_zhuhai_from_osm_asia() {
  local html js_path js_url js_content zhuhai_url

  html=$(curl -fsS https://osm.asia/) || return 1
  js_path=$(printf '%s' "$html" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -n1)
  [ -z "$js_path" ] && { echo "[WARN] No JS bundle link found on https://osm.asia/"; return 1; }

  js_url="https://osm.asia${js_path}"
  echo "[INFO] JS bundle: $js_url"
  js_content=$(curl -fsS "$js_url") || return 1

  # Locate the zhuhai entry and grab the first url:"..." that follows it.
  zhuhai_url=$(printf '%s' "$js_content" | grep -oP 'id:"zhuhai".*?url:"\K[^"]+' | head -n1)
  [ -z "$zhuhai_url" ] && { echo "[WARN] Zhuhai PBF URL not found in $js_url"; return 1; }

  echo "[INFO] Discovered Zhuhai PBF: $zhuhai_url"
  curl -fSL "$zhuhai_url" -o zhuhai.osm.pbf || return 1

  ZHUHAI_PBF_FETCHED=1
}

if fetch_zhuhai_from_osm_asia; then
  osmconvert zhuhai.osm.pbf -b="$BNBU_BBOX" -o="BNBU.osm.pbf"
else
  echo "[WARN] Falling back to Geofabrik Guangdong extract."
  curl https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf -L -o guangdong.osm.pbf
  osmconvert guangdong.osm.pbf -b="$BNBU_BBOX" -o="BNBU.osm.pbf"
fi

mv BNBU.osm.pbf ./data

# Build map tiles
make clean
make
make start-db
make import-data
make import-osm
make import-sql
make generate-bbox-file
make generate-tiles-pg

# Securely copy the generated mbtiles file to remote server
scp -i ~/.ssh/gcp /home/azureuser/openmaptiles/data/tiles.mbtiles u0_a244@100.91.209.78:~/TileServer-GL/data/BNBU-3D.mbtiles

cp /home/azureuser/openmaptiles/data/tiles.mbtiles /home/azureuser/TileServer-GL/data/BNBU-3D.mbtiles

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[${TIMESTAMP}] Map tiles have been built and uploaded successfully."
