# Data tools

## bake_neo_data.py

Regenerates `js/neo-data.js` (the NEO Tracker dataset) from live sources:

1. Fetch raw inputs into a working directory:

   ```sh
   curl -s "https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=full_name,pdes,name,neo,pha,H,diameter,albedo,spec_B,spec_T,e,a,q,i,om,w,ma,epoch,per_y,moid&sb-group=neo&sb-kind=a&sb-cdata=%7B%22AND%22%3A%5B%22H%7CLT%7C22%22%5D%7D&full-prec=true&limit=2000" -o sbdb_raw.json
   curl -s "https://www.asterank.com/api/asterank?query=%7B%22neo%22%3A%22Y%22%7D&limit=1500" -o asterank_neo.json
   ```

2. Bake:

   ```sh
   python3 tools/bake_neo_data.py <dir-with-raw-json> js/neo-data.js
   ```

The tracker propagates positions client-side from the baked Keplerian
elements, so the data stays positionally accurate for years — re-bake
occasionally to pick up newly characterized objects and updated epochs.
