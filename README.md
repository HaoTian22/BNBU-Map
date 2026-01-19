This is a third-party map for Beijing-Normal Hong-Kong University (BNBU), which provides detailed campus maps features. 

It is designed to help students, staff, and visitors easily find their way around the campus using various map services and layers. 

Demo available at: https://u-map.haotian22.top

## Features

Features include:
- Interactive campus map with zoom and pan capabilities.
- Search functionality for buildings, facilities, and points of interest.
- Layer control to toggle different map features.
- User real-time location viewing.
- Mobile-friendly design for use on smartphones and tablets.

## Data Update Schedule

POI: Updated at 3:10 AM (UTC+8) daily via Overpass API following `Overpass.txt` query, by `fetch-poi.sh` (Source: [OSM](https://www.openstreetmap.org/))

Map Tiles: Updated at 3:20 AM (UTC+8) every Monday, until 2026-12-01 (Source: [OSM](https://www.openstreetmap.org/))  
Note: The service will be unavailable during the update process, estimated 5 minutes.

HTML/JS/CSS: Updated at 3 AM (UTC+8) daily, or as needed. (Source: This GitHub Repository)

## Build the Project

This repository contains all the necessary files, configuration, scripts, and resources to deploy and customize the BNBU campus map.

The project are powered by TileServer GL, Mapbox GL JS, OSM Liberty Style, Openmaptiles, and OpenStreetMap data.  
(So these are the config files for mutiple different programs, not a complete program by itself.)  
(This means that you need to have these programs installed and configured properly by the config files in this repo in order to run the BNBU campus map.)

More details can be found in this blog post: https://haotian22.top/bddb0203.html

## Contribute to the Project

Contributions are welcome! If you have suggestions, improvements, or bug fixes, please feel free to open an issue or submit a pull request.

Or, you can add/modify details on the [OpenStreetMap](https://www.openstreetmap.org/) directly to improve the map data.

Or, you can provide server resources to help host the map for better accessibility and performance.

Note: OpenStreetMap is a public platform, make sure to follow their [contribution guidelines and consences](https://wiki.openstreetmap.org/wiki/Getting_Involved) when making edits, and be respectful of the community standards.

---

Disclaimer: This project is not affiliated with or endorsed by Beijing Normal University-Hong Kong Baptist University United International College (BNBU). It is an independent initiative created to enhance campus navigation and accessibility for the BNBU community.