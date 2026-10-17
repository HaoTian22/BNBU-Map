#!/bin/bash

# This script should be run in "openmaptiles" folder

# Fetch OSM data for the BNBU area from the Geofabrik Guangdong extract
# and clip it down to the campus bounding box.

BNBU_BBOX="113.502514,22.3406,113.554241,22.388225"

curl https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf -L -o guangdong.osm.pbf
osmconvert guangdong.osm.pbf -b="$BNBU_BBOX" -o="BNBU.osm.pbf"

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
