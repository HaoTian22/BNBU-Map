#!/bin/bash

# This script should be run in "openmaptiles" folder

# Fetch and clip OSM data for BNBU area
curl https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf -L -o guangdong.osm.pbf 
osmconvert  guangdong.osm.pbf -b="113.502514,22.3406,113.554241,22.388225" -o="BNBU.osm.pbf"

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