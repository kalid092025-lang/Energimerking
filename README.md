# Energimerking

Energimerking er en webapplikasjon for å utforske energimerker for bygg i Oslo. Prosjektet består av en React/Vite-frontend, en .NET Web API-backend og en PostgreSQL/PostGIS-database.

Applikasjonen viser bygg i kart, lar brukeren filtrere på byggeår, energibruk, energikarakter og oppvarmingskarakter, og henter bydelsstatistikk fra lokale databasedata og eksterne kilder.

## Innhold

- Kartvisning med MapLibre
- Markør-, heatmap-, tile- og oppgraderingsvisning
- Søk etter adresser/enheter i innlastede byggdata
- Radius-søk ved klikk i kartet
- Filter for byggeår, energibruk, energikarakter og oppvarmingskarakter
- Bydelsstatistikk for Oslo
- Swagger for backend-API
- Docker-oppsett for PostGIS og pgAdmin

## Teknologistack

### Frontend

- React 19
- Vite
- MapLibre GL
- Zustand
- Framer Motion
- Lucide React

### Backend

- .NET 10
- ASP.NET Core Web API
- Entity Framework Core
- Npgsql
- NetTopologySuite
- Swagger / Swashbuckle

### Database

- PostgreSQL
- PostGIS
- pgAdmin

## Prosjektstruktur

```text
.
├── Backend/
│   ├── Core/              # EF Core-modeller, DbContext og domenetjenester
│   ├── Docker/            # Docker Compose og databasefiler
│   └── WebApi/            # ASP.NET Core API
├── Frontend/              # React/Vite-applikasjon
├── Energimerking.sln      # Visual Studio/.NET solution
└── README.md
```

## Forutsetninger

Installer dette før du kjører prosjektet lokalt:

- Docker Desktop
- .NET 10 SDK
- Node.js og npm

## Lokal oppstart

Kjør kommandoene fra rotmappen i repoet hvis ikke annet er oppgitt.

### 1. Start database

```powershell
cd Backend\Docker
docker compose up -d
```

Dette starter:

- PostgreSQL/PostGIS på `localhost:5432`
- pgAdmin på `http://localhost:8080`

Standard databaseoppsett i `docker-compose.yaml`:

```text
Database: Energimerking
User:     Kodehode
Password: 12345
```

pgAdmin-login:

```text
Email:    admin@example.com
Password: securepassword
```

Merk: `Backend/Docker/db-init/Energimerking.sql` ligger i repoet, men compose-filen bruker per nå et navngitt Docker-volum for `/docker-entrypoint-initdb.d`. Det betyr at SQL-filen ikke nødvendigvis kjøres automatisk ved første oppstart. Hvis databasen er tom, importer SQL-filen manuelt i databasen eller endre volumet i compose-filen til en bind mount, for eksempel:

```yaml
- ./db-init:/docker-entrypoint-initdb.d
```

Dette må gjøres før første databaseoppstart, eller etter at databasevolumet er slettet.

### 2. Start backend

Fra rotmappen:

```powershell
dotnet restore Energimerking.sln
dotnet run --project Backend\WebApi\WebApi.csproj
```

Backend kjører normalt på:

```text
http://localhost:5277
```

Swagger er tilgjengelig på:

```text
http://localhost:5277/swagger
```

Backend bruker denne connection stringen fra `Backend/WebApi/appsettings.json`:

```text
Host=localhost;Port=5432;Database=Energimerking;Username=Kodehode;Password=12345
```

Du kan overstyre den med miljøvariabel:

```powershell
$env:ConnectionStrings__Postgres="Host=localhost;Port=5432;Database=Energimerking;Username=Kodehode;Password=12345"
```

### 3. Start frontend

I en ny terminal:

```powershell
cd Frontend
npm install
npm run dev
```

Frontend kjører normalt på:

```text
http://localhost:5173
```

Vite-proxyen sender `/api`-kall videre til backend på `http://localhost:5277`.

Hvis backend kjører på en annen adresse, kan proxyen overstyres slik:

```powershell
$env:VITE_API_PROXY_TARGET="http://localhost:5277"
npm run dev
```

## Viktige API-endepunkter

Backend eksponerer blant annet:

```text
GET  /api/bygg/GetNearbyDeNormGeoJson
GET  /api/bygg/GetNearbyDeNormDynamicList
GET  /api/bygg/nearby
GET  /api/bygg/nearby/geojson
POST /api/bygg/refresh
GET  /api/bydel-stats/{bydelId}
```

Eksempel:

```text
http://localhost:5277/api/bygg/GetNearbyDeNormGeoJson?latitude=59.9&longitude=10.8&radiusInMeters=2500&amount=100&onlyNew=false
```

## Miljøvariabler

### Backend

```text
ConnectionStrings__Postgres
NOBIL_API_KEY
```

`NOBIL_API_KEY` er valgfri. Uten den returnerer backend fortsatt bydelsstatistikk, men ladestasjonstall fra NOBIL blir ikke fylt ut.

### Frontend

```text
VITE_HOST
VITE_PORT
VITE_API_PROXY_TARGET
VITE_HMR_HOST
VITE_HMR_CLIENT_PORT
```

## Bygg

Frontend:

```powershell
cd Frontend
npm run build
```

Backend:

```powershell
dotnet build Energimerking.sln
```

## Datakilder

Prosjektet bruker lokale energimerke-, matrikkel- og koordinatdata i PostGIS. Bydelsstatistikk hentes også fra:

- Oslo statistikkbank
- SSB Statbank API
- NOBIL, hvis API-nøkkel er satt

Kartbakgrunner lastes fra Carto basemap-URL-er, så frontend trenger internett-tilgang for at bakgrunnskartet skal vises.

## Feilsøking

### Frontend viser "No backend data loaded"

Sjekk at:

- databasen kjører på `localhost:5432`
- backend kjører på `http://localhost:5277`
- `VITE_API_PROXY_TARGET` peker til riktig backend
- databasen inneholder data i tabellene/viewene API-et leser fra

### API-et får databasefeil

Sjekk connection string i `Backend/WebApi/appsettings.json`, og bekreft at Docker-containeren `energimerke-db` kjører:

```powershell
docker ps
```

### pgAdmin får ikke koblet til databasen

Bruk disse verdiene når du registrerer serveren i pgAdmin:

```text
Host:     postgis
Port:     5432
Database: Energimerking
Username: Kodehode
Password: 12345
```

Når du kobler fra maskinen utenfor Docker-nettverket, bruk `localhost` som host.

## Notater

- Passordene i Docker-oppsettet er utviklingsverdier og bør ikke brukes i produksjon.
- `Frontend/dist` er en bygget frontend-versjon og kan regenereres med `npm run build`.
- Det ser ikke ut til å være egne testkommandoer konfigurert i repoet per nå.
