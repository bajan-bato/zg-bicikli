# Zagreb Bike Navigator

Web-aplikacija za biciklističku navigaciju u Zagrebu. Kombinira **cestovnu mrežu iz OpenStreetMapa** s **otvorenim podacima Grada Zagreba** (biciklističke staze i parkirališta za bicikle s [data.gov.hr](https://data.gov.hr)). Korisnik bira između **najkraće rute** i **rute koja daje prednost biciklističkim stazama**, a tijekom vožnje ga vodi **GPS navigacija** s automatskim preračunavanjem rute.

- **Frontend:** React 18, TypeScript, Vite, Leaflet / React-Leaflet, leaflet.markercluster, Turf.js
- **Backend:** Node.js, TypeScript, Express, Turf.js, Zod, CKAN API
- **Routing:** vlastiti A* routing engine unutar backenda nad OSM grafom (obrazloženje niže)
- **Arhitektura:** monolit – jedan repozitorij, jedan Node proces u produkciji (API + statični frontend)

---

## Brzi početak

Preduvjeti: **Node.js ≥ 20** i pristup internetu.

```bash
npm install
```

```bash
npm run dev
```

Otvorite <http://localhost:5173>. Naredba `npm run dev` pokreće backend (`:3001`) i frontend (`:5173`, prosljeđuje `/api` na backend).

**Prvo pokretanje traje ~1–2 minute:** backend preko CKAN API-ja pronalazi i preuzima podatke o stazama i parkiralištima, a s Overpass API-ja preuzima cestovnu mrežu Zagreba (~64 MB). Sve se sprema u `server/data/cache/`, pa su sljedeća pokretanja gotovo trenutna (graf se gradi za ~1,5 s). Dok se mreža priprema, gornja traka pokazuje „Priprema mreže…”, a API za rute vraća `503`.

### Testovi

```bash
npm test
```

### Produkcija

```bash
npm run build
```

```bash
npm start
```

`npm start` pokreće jedan Node proces na portu `PORT` (zadano 3001) koji poslužuje i API i izgrađeni frontend iz `client/dist`.

### HTTPS i GPS na mobitelu

Preglednici dopuštaju Geolocation API **samo u sigurnom kontekstu** (HTTPS ili `localhost`). Za testiranje na mobitelu u lokalnoj mreži:

```bash
npm run dev:https
```

Vite tada sluša na svim sučeljima sa samopotpisanim certifikatom. Otvorite `https://<IP-računala>:5173` na mobitelu i prihvatite upozorenje o certifikatu. **U produkciji aplikacija mora biti iza HTTPS-a** (npr. reverse proxy s Let’s Encrypt certifikatom), inače GPS funkcije neće raditi.

---

## Izvori podataka

### Portal otvorenih podataka (CKAN)

Backend **ne koristi hardkodirane identifikatore**. Pri preuzimanju:

1. poziva `package_search` s nekoliko upita (`"biciklističke staze"`, `"bicikl*"`, `"parkirališta za bicikle"`),
2. zadržava skupove čiji naslov odgovara traženom, s prednošću za organizaciju „Grad Zagreb”,
3. u njima traži resurse formata GeoJSON,
4. preuzima resurs i **provjerava strukturu** (FeatureCollection, očekivana svojstva na ≥ 90 % objekata, ispravan tip geometrije, WGS84 koordinate na području Zagreba),
5. čisti podatke (npr. suvišni navodnici u `MJESNI_ODBOR`) i stazama računa stvarnu duljinu iz geometrije (Turf.js),
6. sprema rezultat u memoriju i na disk.

Identifikatori koje je ovaj postupak pronašao (provjereno 3. 11. 2026.):

| Podaci | CKAN skup | GeoJSON resurs | Objekata | Licenca |
|---|---|---|---|---|
| Biciklističke staze | [`geoportal-biciklisticke-staze`](https://data.gov.hr/ckan/dataset/geoportal-biciklisticke-staze) (Grad Zagreb) | `cd574641-d3c6-4e2e-bf0f-863d2fa49e77` | 2889 MultiLineString, ukupno ~268 km | Otvorena dozvola |
| Parkirališta za bicikle | [`geoportal-javna-parkiralista-za-bicikle`](https://data.gov.hr/ckan/dataset/geoportal-javna-parkiralista-za-bicikle) (Grad Zagreb) | `5f3b098f-50b3-4301-884c-eebfc48e997a` | 318 Point | Otvorena dozvola |

Datoteke resursa CKAN dohvaća s ArcGIS Open Data poslužitelja Grada Zagreba (`opendata.arcgis.com/api/v3/datasets/…/downloads/data?format=geojson&spatialRefId=4326`). Atributi odgovaraju očekivanoj strukturi iz specifikacije. Pretraga po nazivu `pbp_view_pjesacko_biciklisticki_pravci` ili `bic_view_naprave_za_parkiranje` na portalu ne vraća ove skupove, pa se traži po naslovu.

**Predmemorija i osvježavanje:**
- Podaci su svježi 24 h (`CKAN_MAX_AGE_HOURS`); zastarjeli se osvježavaju u pozadini.
- `POST /api/infrastructure/refresh` ili gumb ↻ u gornjoj traci ručno osvježava podatke. Nakon osvježavanja staza graf se ponovno povezuje sa stazama.
- Ako portal nije dostupan, aplikacija nastavlja raditi s posljednjom uspješno preuzetom verzijom. Status je na `GET /api/infrastructure/status`.

### OpenStreetMap

- **Cestovna mreža:** Overpass API, obuhvat `15.82–16.25 E, 45.70–45.93 N`. Sve vrste `highway` osim autocesta, stepenica i neizgrađenih cesta, oko 88 000 putova i 430 000 čvorova. Predmemorija vrijedi 30 dana. Ako glavni Overpass poslužitelj ne odgovori, koriste se rezervni.
- **Kartografska podloga:** standardne OSM pločice (`tile.openstreetmap.org`).
- **Geokodiranje:** [Photon](https://photon.komoot.io) (OSM), ograničen na područje Zagreba; ako Photon ne radi, koristi se Nominatim. Moguć je i unos koordinata („45.81, 15.97”).

Podaci © suradnici OpenStreetMapa (ODbL).

---

## Routing engine – odabir i obrazloženje

Razmotreni su **GraphHopper**, **OSRM** i **vlastiti engine u Node.js backendu**. Odabran je vlastiti engine (A* nad grafom iz OSM-a):

| Kriterij | OSRM | GraphHopper | Vlastiti A* (odabrano) |
|---|---|---|---|
| Uključivanje GeoJSON staza Grada Zagreba u težine | profil u Lui, težine se fiksiraju pri predobradi | custom model s područjima (poligoni) – nespretno za linije | **izravno: svaki brid nosi izmjerenu duljinu preklapanja sa stazama** |
| Promjena težina po zahtjevu (kompromis duljina / staze) | ne (zahtijeva novu predobradu) | djelomično | **da (penal i dopušteni obilazak po zahtjevu)** |
| Osvježavanje podataka o stazama | ponovna predobrada | ponovni import | **ponovno povezivanje u ~1 s, bez ponovnog pokretanja** |
| Arhitektura | zaseban servis (Docker) | zaseban Java servis | **unutar monolita, bez dodatnih servisa** |
| Upute na hrvatskom | prijevod potreban | prijevod potreban | **generiraju se izravno na hrvatskom** |
| Performanse za Zagreb | odlične | odlične | dovoljne: 10–70 ms po ruti (132 000 vrhova) |

Za jedan grad graf stane u memoriju (~170 000 bridova), a A* s binarnom gomilom radi brzo. Specifikacija traži prostorno povezivanje staza s mrežom i podesive težine, a vlastiti engine to podržava bez zaobilaznih rješenja. Engine za cijelu Hrvatsku ili rute dulje od ~50 km bio bi razlog za prelazak na GraphHopper.

---

## Algoritam

### 1. Graf (`server/src/services/routing/graph.ts`)

- Iz OSM putova grade se **vrhovi** (raskrižja i krajevi putova) i **bridovi** s punom geometrijom dionice.
- **Pristup za bicikl:** ceste i staze (`cycleway`, `residential`, `tertiary`…`primary`, `service`, `track`, `path`…) su prohodne. `bicycle=no`, `access=private` i slično isključuju put. Pješačke površine (`footway`, `pedestrian`) bez `bicycle=yes|designated` su **uvjetne**: prohodne su samo ako ih podaci Grada Zagreba potvrđuju kao biciklističku stazu (≥ 60 % duljine se preklapa). Pješački prijelazi su prohodni kao spojnice.
- **Jednosmjerne ulice** se poštuju (`oneway`, kružni tokovi), uz iznimke `oneway:bicycle=no` i `cycleway=opposite*`.
- Komponente povezanosti (union-find) služe za prepoznavanje nepovezanih točaka.

### 2. Prostorno povezivanje staza s mrežom (`cyclewayIndex.ts`)

- Segmenti svih GeoJSON staza indeksiraju se u **prostornu mrežu ćelija** (60 m).
- Svaki brid uzorkuje se svakih 5 m. Uzorak se smatra preklapanjem ako postoji segment staze unutar **15 m** (tolerancija za stazu na nogostupu uz os ceste), približno **paralelan** (≤ 30°), a točka leži **uz** segment, a ne iza njegova kraja.
- Rezultat je za svaki brid broj metara koji se stvarno preklapaju sa stazom.

### 3. Cijene i A* (`astar.ts`, `routingService.ts`)

- **Najkraća ruta:** `cost = duljina`.
- **Prioritet staza:** `cost = metri_na_stazi × 1 + metri_bez_staze × (1 + penal)`, zadano `penal = 1,5`.
- A* koristi zračnu udaljenost kao heuristiku. Ona je dopustiva jer je najmanja cijena po metru 1.
- Polazište i odredište projiciraju se na najbliži prohodni brid (virtualni vrhovi), pa ruta počinje i završava točno na mreži.
- Bez potpune pokrivenosti stazama algoritam sam koristi obične ceste kao spojnice, jer optimizira cijelu mrežu, a ne odabire najbližu stazu.

### 4. Ograničenje duljine (kompromis)

Najprije se računa najkraća ruta duljine `L`. Ruta sa stazama prihvaća se ako je `≤ L × MAX_DETOUR_FACTOR` (zadano 1,4). Ako nije, penal se prepolovljuje (1,5 → 0,75 → 0,375 → 0,19) dok se uvjet ne ispuni. Ako ni to ne uspije, vraća se najkraća ruta, a sučelje to i napiše. Oba parametra mogu se zadati i po zahtjevu (`options.roadPenalty`, `options.maxDetourFactor`).

Primjeri na stvarnim podacima:

| Relacija | Najkraća | Prioritet staza |
|---|---|---|
| Jarun → Trg bana Jelačića | 10,8 km, 49 % staza | 10,8 km, 60 % staza |
| Jarun → Maksimirska 100 | 8,1 km, 37 % staza | 9,6 km, 82 % staza |

### 5. Statistika

Duljina staza na ruti računa se **prostornim preklapanjem cijele geometrije rute** s GeoJSON stazama istim postupkom kao gore. Ne zbrajaju se duljine staza u blizini niti atribut `duljina`. Udio = duljina staza / ukupna duljina. Trajanje = duljina / `AVERAGE_SPEED_KMH` (zadano 15 km/h).

### 6. Upute (`instructions.ts`)

Dionice se grupiraju po nazivu ulice i statusu staze, a kratki međudijelovi (< 15 m) se pripajaju. Kut između izlaznog i ulaznog smjera (mjeren na ~20 m) određuje uputu: ravno, blago, skrenite ili oštro lijevo/desno, okrenite se. Prepoznaju se i kružni tokovi. Upute se generiraju izravno na hrvatskom, na primjer:
„Skrenite desno na biciklističku stazu – Aleja Matije Ljubeka i vozite 750 m”, „Nastavite biciklističkom stazom – Savska cesta…”, „Stigli ste na odredište”.

---

## GPS navigacija

Navigacija radi na frontendu (`client/src/hooks/useNavigation.ts`, `utils/navigationTracker.ts`). Backend se poziva samo za novu rutu.

- `navigator.geolocation.watchPosition()` s visokom preciznošću. Watch se čisti na „Završi navigaciju”, pri dolasku i pri unmountanju komponente.
- Položaj se projicira na rutu (Turf `nearestPointOnLine`). Sučelje prikazuje sljedeće skretanje i udaljenost do njega, preostalu udaljenost i vrijeme, vrijeme dolaska i prijeđenu udaljenost (s filtrom podrhtavanja GPS-a).
- Karta prati korisnika. Nakon ručnog pomicanja praćenje se pauzira 15 s, a gumb „Centriraj” ga vraća.
- **Detekcija odstupanja:** prag 35 m + ½ prijavljene GPS nepreciznosti. Mjerenja lošija od ±50 m se ignoriraju (prikazuje se „Slaba GPS preciznost”). Odstupanje mora potrajati **3 uzastopna mjerenja i najmanje 4 s**. Tek tada se korisnik obavještava i poziva `POST /api/routes/recalculate`. Između preračunavanja mora proći najmanje 10 s.
- Greške: odbijeno dopuštenje zaustavlja navigaciju s porukom. Nedostupan signal ili timeout prikazuju se, a praćenje se nastavlja. Bez HTTPS-a korisnik dobiva objašnjenje.
- Ako preglednik to podržava, Screen Wake Lock drži zaslon upaljenim.

> **Ograničenje:** mobilni preglednici i operacijski sustavi mogu suspendirati stranicu kad je preglednik u pozadini ili je zaslon zaključan. Tada `watchPosition` ne isporučuje lokacije i praćenje se nastavlja tek kad se stranica vrati u prvi plan. Neprekidno praćenje u pozadini zahtijevalo bi nativnu aplikaciju.

---

## REST API

| Metoda | Putanja | Opis |
|---|---|---|
| GET | `/api/infrastructure/cycleways` | GeoJSON biciklističkih staza |
| GET | `/api/infrastructure/parking` | GeoJSON parkirališta |
| GET | `/api/infrastructure/status` | izvor, vrijeme preuzimanja, zadnja greška |
| POST | `/api/infrastructure/refresh` | ponovno preuzimanje s CKAN-a (`200` sve, `207` djelomično, `503` ništa) |
| GET | `/api/geocoding/search?q=…` | prijedlozi lokacija (`404` ako nema rezultata) |
| GET | `/api/geocoding/reverse?lat=…&lon=…` | naziv lokacije za klik na kartu |
| POST | `/api/routes` | `{ start: {lat, lon}, end: {lat, lon}, mode: "shortest" \| "cycleways", options? }` |
| POST | `/api/routes/recalculate` | `{ current, end, mode }` – ruta od trenutne lokacije |
| GET | `/api/health` | stanje routing enginea i podataka |
| GET | `/api/config` | javna konfiguracija (brzina, pragovi navigacije) |

Odgovor rute sadrži `geometry` (GeoJSON LineString), `distanceM`, `durationS`, `cyclewayDistanceM`, `cyclewayShare`, `roadDistanceM`, `cyclewaySegments`, `instructions[]`, `shortestDistanceM` i `penaltyUsed`.

Sve greške imaju oblik `{ "error": { "code", "message" } }` s porukom na hrvatskom:

| Situacija | HTTP | `code` |
|---|---|---|
| neispravan ulaz | 400 | `VALIDATION_ERROR` |
| lokacija nije pronađena | 404 | `GEOCODING_FAILED` |
| točke nisu povezane mrežom | 422 | `POINTS_NOT_CONNECTED` |
| točka daleko od mreže / ruta ne postoji | 422 | `ROUTE_NOT_FOUND` |
| izvan Zagreba | 422 | `OUTSIDE_AREA` |
| CKAN / geokoder nedostupan | 502 | `CKAN_UNAVAILABLE`, `GEOCODING_UNAVAILABLE` |
| neispravan GeoJSON / nema resursa | 502 | `INVALID_GEOJSON`, `CKAN_RESOURCE_NOT_FOUND` |
| podaci ili routing još nisu spremni | 503 | `DATA_UNAVAILABLE`, `ROUTING_UNAVAILABLE` |

---

## Konfiguracija

Sve je centralizirano u `server/src/config/index.ts` i može se nadjačati varijablama okruženja.

| Varijabla | Zadano | Opis |
|---|---|---|
| `PORT` | 3001 | port backenda |
| `CKAN_BASE_URL` | `https://data.gov.hr/ckan/api/3/action` | CKAN Action API |
| `CKAN_MAX_AGE_HOURS` | 24 | svježina podataka o infrastrukturi |
| `OVERPASS_URLS` | overpass-api.de, private.coffee, mail.ru | Overpass poslužitelji (zarezom odvojeni) |
| `OSM_MAX_AGE_DAYS` | 30 | svježina cestovne mreže |
| `PHOTON_URL` / `NOMINATIM_URL` | javni poslužitelji | geokodiranje |
| `AVERAGE_SPEED_KMH` | 15 | prosječna brzina za procjenu trajanja |
| `ROAD_PENALTY` | 1.5 | penal za dionice bez staze |
| `MAX_DETOUR_FACTOR` | 1.4 | najveći omjer prema najkraćoj ruti |
| `CYCLEWAY_MATCH_TOLERANCE_M` | 15 | prostorna tolerancija preklapanja |
| `CYCLEWAY_BEARING_TOLERANCE_DEG` | 30 | tolerancija smjera |
| `FOOTWAY_COVERAGE_THRESHOLD` | 0.6 | kad pješačka staza postaje prohodna |
| `SNAP_MAX_DISTANCE_M` | 400 | najveća udaljenost točke od mreže |
| `NAV_OFF_ROUTE_THRESHOLD_M` | 35 | prag odstupanja |
| `NAV_OFF_ROUTE_CONFIRMATIONS` | 3 | broj potvrda odstupanja |
| `NAV_OFF_ROUTE_MIN_DURATION_MS` | 4000 | najkraće trajanje odstupanja |
| `NAV_MAX_ACCURACY_M` | 50 | najlošija prihvatljiva GPS preciznost |
| `NAV_REROUTE_COOLDOWN_MS` | 10000 | razmak između preračunavanja |
| `DATA_DIR` | `server/data/cache` | predmemorija na disku |
| `USER_AGENT` | `ZagrebBikeNavigator/1.0 …` | identifikacija prema vanjskim servisima |

Frontend dohvaća parametre navigacije s `/api/config`, pa je izvor istine jedan.

---

## Testovi

`npm test` pokreće 56 testova backenda i 24 testa frontenda (Vitest; supertest za API, Testing Library za hookove). Testovi algoritama koriste male sintetičke mreže (`server/tests/helpers.ts`) kako bi rezultati bili deterministični. Aplikacija sama nikad ne koristi te podatke.

| Zahtjev | Testovi |
|---|---|
| 1. CKAN dohvaćanje skupova | `server/tests/ckan.test.ts` |
| 2. Parsiranje GeoJSON-a | `server/tests/geojsonParsers.test.ts` |
| 3. Prikaz staza | `client/src/components/Map/layers.test.ts` |
| 4. Prikaz parkirališta | `client/src/components/Map/layers.test.ts` |
| 5. Najkraća ruta | `server/tests/routing.test.ts` |
| 6. Ruta s prioritetom staza (+ ograničenje duljine) | `server/tests/routing.test.ts` |
| 7. Duljina staza na ruti | `server/tests/routeStats.test.ts` |
| 8. Udio staza | `server/tests/routeStats.test.ts` |
| 9. Detekcija odstupanja | `client/src/utils/deviation.test.ts`, `navigationTracker.test.ts` |
| 10. Ponovni izračun rute | `client/src/hooks/useNavigation.test.tsx`, `server/tests/api.test.ts` |
| 11. Nedostupni vanjski servisi | `server/tests/infrastructure.test.ts`, `api.test.ts`, `routing.test.ts` |

---

## Struktura projekta

```text
zagreb-bike-navigator/
├── shared/types/            # API ugovor (TypeScript tipovi)
├── server/
│   ├── src/
│   │   ├── config/          # centralna konfiguracija i URL-ovi servisa
│   │   ├── controllers/     # HTTP sloj + Zod validacija
│   │   ├── routes/          # Express router
│   │   ├── middleware/      # obrada grešaka
│   │   ├── services/
│   │   │   ├── ckan/            # CKAN klijent, otkrivanje skupova
│   │   │   ├── infrastructure/  # parsiranje, validacija, predmemorija
│   │   │   ├── routing/         # OSM mreža, graf, prostorni indeks, A*, upute
│   │   │   └── geocoding/       # Photon + Nominatim
│   │   ├── utils/
│   │   ├── app.ts           # sastavljanje Express aplikacije
│   │   └── index.ts         # pokretanje
│   └── tests/
├── client/
│   └── src/
│       ├── components/      # Map, RouteForm, RouteInfo, Navigation, ParkingMarkers
│       ├── hooks/           # useAppData, useCurrentLocation, useNavigation
│       ├── services/        # REST klijent
│       └── utils/           # navigacija, odstupanje, formatiranje
└── package.json             # npm workspaces + `npm run dev`
```

---

## Poznata ograničenja i preporuke

- **Šifre kategorija staza** (`PB`, `BT`, `BP`, `CM`, `BS`, `JS`, `PO`): portal ne objavljuje njihovo značenje, pa se prikazuju kako jesu, bez tumačenja.
- **Javni servisi** (Overpass, Photon, Nominatim, OSM pločice) imaju pravila korištenja i ograničenja brzine. Aplikacija ih štedi predmemorijom (mreža 30 dana, geokodiranje u LRU predmemoriji). Za javno objavljivanje s većim prometom preporučuje se vlastiti Photon/Nominatim i poslužitelj pločica ili komercijalni pružatelj. URL-ovi se mijenjaju varijablama okruženja.
- **Prostorno preklapanje** s tolerancijom od 15 m može uz širok bulevar pripisati stazu i kolniku i nogostupu. Na statistiku to ne utječe jer se računa po geometriji rute, a ruta i dalje ide pravom ulicom. Statistika pokazuje koliko rute ide uz evidentiranu stazu, a ne na kojoj strani ceste je staza.
- **Kvaliteta OSM oznaka** (npr. nedostaju `oneway:bicycle=no` ili oznake pristupa) izravno utječe na rute.
- **GPS u pozadini:** vidi napomenu u odjeljku o navigaciji.
