using Core.Class.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite;
using NetTopologySuite.Features;
using System.Globalization;
using EnergimerkingContext = Core.DbContexts.EnergimerkingContext;

namespace Core.Models;

public class EnergimerkingService(DbContexts.EnergimerkingContext context) : DbContext
{
    private const int MaxTilePointLimit = 5000;

    /// <summary>
    /// Looks at every coordinate, filtering out any that doesn't have "Kommunenummer" or Geography.
    /// Is prone to crashing web-browser.
    /// Result will likely exceed 40mb.
    /// </summary>
    /// <returns>Gives a serialized string of all coordinates</returns>
    public async Task<string> GetAllCoordinateGeojson()
    {
        var dbSetList = await context.Coordinates.Where(c => c.Kommunenummer != null && c.Geography != null)
            .ToListAsync();
        List<CoordinateGeojsonDto> list = dbSetList.Select(item => new CoordinateGeojsonDto(item)).ToList();
        var jsonSerializer = new GeojsonSerializer<CoordinateGeojsonDto>(list);
        return jsonSerializer.Json;
    }

    public async Task<string> GetAmountCoordinateGeojson(int amount)
    {
        var dbSetList = await context.Coordinates.Where(c => c.Kommunenummer != null && c.Geography != null)
            .Take(amount).ToListAsync();
        List<CoordinateGeojsonDto> list = dbSetList.Select(item => new CoordinateGeojsonDto(item)).ToList();
        var jsonSerializer = new GeojsonSerializer<CoordinateGeojsonDto>(list);
        return jsonSerializer.Json;
    }

    /// <summary>
    /// Lager et geografisk punkt som blir brukt til å gjøre utspørringer etter koordinater innenfor
    /// radiusen bruker gir og setter sammen eiendommene med koordinater.
    /// </summary>
    /// <param name="latitude">breddegrad</param>
    /// <param name="longitude">lengdegrad</param>
    /// <param name="amount">Hvor mange koordinater</param>
    /// <param name="radiusInMeters">radius</param>
    /// <returns>En string i geojson-format</returns>
    public async Task<string> GetNearbyGeoJson(
        double latitude,
        double longitude,
        int amount,
        double radiusInMeters = 5000)
    {
        if (radiusInMeters <= 0 || radiusInMeters > 50000)
        {
            return "Radius må være mellom 1 og 50 000 meter.";
        }

        try
        {
            var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4258);


            var searchPoint = factory.CreatePoint(
                new NetTopologySuite.Geometries.Coordinate(longitude, latitude)
            );
            
            //Finner koordinater innenfor søkepunktet, og
            //for hvert koordinat blir det lagd en FlereEiendommerEttKoordGeojsonDto som knytter eiendommer
            //med koordinater.
            var coordGeoJsonDtos = await context.Coordinates
                .Where(c =>
                    c.Geography != null &&
                    c.Geography.IsWithinDistance(searchPoint, radiusInMeters)
                )
                .Take(amount)
                .Select(c => new FlereEiendommerEttKoordGeojsonDto(c, context.Eiendoms
                    .Where(e => e.Coordinateid == c.Coordinateid).ToList()))
                .ToListAsync();

            var jsonSerializer = new GeojsonSerializer<FlereEiendommerEttKoordGeojsonDto>(coordGeoJsonDtos);

            return jsonSerializer.Json;
        }
        catch (Exception ex)
        {
            return $"Feil ved søk: {ex.Message}";
        }
    }

    /// <summary>
    /// Henter gitt mengde med denormaliserte energi-attester sammen med koordinater innenfor
    /// spesifisert radius i meter.(DenormMatrikkelOgEnovaOslo blir hentet)
    /// </summary>
    /// <param name="latitude"></param>
    /// <param name="longitude"></param>
    /// <param name="amount"></param>
    /// <param name="radiusInMeters"></param>
    /// <returns>Anonyme objekter av denormalisert attest, eiendom og koordinat.</returns>
    public async Task<dynamic> GetNearbyDeNormDynamicList(
        double latitude = 59.9,
        double longitude = 10.8,
        int amount = 10,
        double radiusInMeters = 2500)
    {
        if (radiusInMeters <= 0 || radiusInMeters > 50000)
        {
                    return "Radius må være mellom 1 og 50 000 meter.";
        }

        
        var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4258);


        var searchPoint = factory.CreatePoint(
                new NetTopologySuite.Geometries.Coordinate(longitude, latitude)
                );

        var deNormList = await context.DenormMatrikkelOgEnovaOslos
            .Where(d => d.KommuneNr != null &&
                        d.Coordinate != null &&
                        d.Coordinate.IsWithinDistance(searchPoint, radiusInMeters))
            .Select(d => new
            {
                denormId = d.Id,
                lon = d.Coordinate.Coordinate.X,
                lat = d.Coordinate.Coordinate.Y,
                adresse = d.Adresse,
                kommune = d.KommuneNr,
                gård = d.GaardsNr,
                bruk = d.BruksNr,
                feste = d.FesteNr,
                andel = d.AndelsNr,
                seksjon = d.SeksjonsNr,
                bruksenhetsNr = d.BruksenhetsNr,
                organisasjonsNr = d.OrganisasjonsNr,
                attestnummer = d.AttestNr,
                utstedelsesdato = d.UtstedelsesDato,
                energikarakter = d.Energikarakter,
                oppvarmingskarakter = d.Oppvarmingskarakter,
                beregnetLevertEnergiTotaltkWhm2 = d.BeregnetLevertEnergiTotaltkWhm2,
                materialvalg = d.Matierialvalg,
                byggeår = d.Byggeår
            })
            .Take(amount)
            .ToListAsync();
        
        //Bare for å se i debugern.
        var lookDebugList = await context.DenormMatrikkelOgEnovaOslos
            .Where(d => d.KommuneNr != null && d.Coordinate != null)
            .Take(amount)
            .ToListAsync();
        //grupper etter eiendommer med flere attester og eiendommer med bare en attest
        return deNormList;
    }

    /// <summary>
    /// IKKE FERDIG
    /// Gir foreløpig ikke noe annet ved:"onlyNew = true".
    /// Henter gitt mengde med denormaliserte energi-attester sammen med koordinater innenfor
    /// spesifisert radius i meter og gjør dem om til geojson.(DenormMatrikkelOgEnovaOslo blir hentet) 
    /// </summary>
    /// <param name="latitude"></param>
    /// <param name="longitude"></param>
    /// <param name="amount"></param>
    /// <param name="radiusInMeters"></param>
    /// <param name="onlyNew">Om du bare har lyst på den aller nyeste attesten per eiendoms-modell.</param>
    /// <returns></returns>
    public async Task<string> GetNearbyDeNormGeoJson(
        double latitude = 59.9,
        double longitude = 10.8,
        int amount = 10,
        double radiusInMeters = 2500,
        bool onlyNew = false,
        int skip = 0)
    {

        
        var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4258);


        var searchPoint = factory.CreatePoint(
            new NetTopologySuite.Geometries.Coordinate(longitude, latitude)
        );

        var deNormList = await context.DenormMatrikkelOgEnovaOslos
            .Where(d => d.KommuneNr != null &&
                        d.Coordinate != null &&
                        d.Coordinate.IsWithinDistance(searchPoint, radiusInMeters))
            .OrderBy(d => d.Id)
            .Skip(skip)
            .Take(amount)
            .AsNoTracking()
            .ToListAsync();

        //IEnumerable<List<DenormMatrikkelOgEnovaOslo>> filterlist = null; 
        List<DenormMatrikkelOgEnovaOsloGeojsonDto> geoJsonDtos = null;
        //Gjør om til dto med alle attester.
        if (!onlyNew)
        {
            //Grupper etter kommune, gård, bruk og adresse.
            var filterlist = deNormList.GroupBy(d => (d.KommuneNr, d.GaardsNr, d.BruksNr, d.Adresse))
                .Select(dg => dg.ToList());
            //Gjør om listene i filterList til DenormMatrikkelOgEnovaOsloGeojsonDto.
            var geoJsonDtoIE = 
                filterlist.Select(l => new DenormMatrikkelOgEnovaOsloGeojsonDto(l));
            geoJsonDtos = geoJsonDtoIE.ToList();
        }
        else
        {
            
        }

        var jsonSerializer = new GeojsonSerializer<DenormMatrikkelOgEnovaOsloGeojsonDto>(geoJsonDtos);
        return jsonSerializer.Json;
    }

    public async Task<string> GetBoundsDeNormGeoJson(
        double minLatitude,
        double minLongitude,
        double maxLatitude,
        double maxLongitude,
        int amount = 10,
        bool onlyNew = false,
        int skip = 0)
    {
        var minLat = (decimal)Math.Min(minLatitude, maxLatitude);
        var maxLat = (decimal)Math.Max(minLatitude, maxLatitude);
        var minLon = (decimal)Math.Min(minLongitude, maxLongitude);
        var maxLon = (decimal)Math.Max(minLongitude, maxLongitude);

        var deNormList = await context.DenormMatrikkelOgEnovaOslos
            .Where(d => d.KommuneNr != null &&
                        d.Coordinate != null &&
                        d.Lat != null &&
                        d.Lon != null &&
                        d.Lat >= minLat &&
                        d.Lat <= maxLat &&
                        d.Lon >= minLon &&
                        d.Lon <= maxLon)
            .OrderBy(d => d.Id)
            .Skip(skip)
            .Take(amount)
            .AsNoTracking()
            .ToListAsync();

        List<DenormMatrikkelOgEnovaOsloGeojsonDto> geoJsonDtos = null;
        if (!onlyNew)
        {
            var filterlist = deNormList.GroupBy(d => (d.KommuneNr, d.GaardsNr, d.BruksNr, d.Adresse))
                .Select(dg => dg.ToList());
            var geoJsonDtoIE =
                filterlist.Select(l => new DenormMatrikkelOgEnovaOsloGeojsonDto(l));
            geoJsonDtos = geoJsonDtoIE.ToList();
        }

        var jsonSerializer = new GeojsonSerializer<DenormMatrikkelOgEnovaOsloGeojsonDto>(geoJsonDtos);
        return jsonSerializer.Json;
    }

    public async Task<object> GetBoundsTilePoints(
        double minLatitude,
        double minLongitude,
        double maxLatitude,
        double maxLongitude,
        int limit = 2000,
        double? cursorLat = null,
        double? cursorLon = null,
        int? cursorId = null)
    {
        var minLat = (decimal)Math.Min(minLatitude, maxLatitude);
        var maxLat = (decimal)Math.Max(minLatitude, maxLatitude);
        var minLon = (decimal)Math.Min(minLongitude, maxLongitude);
        var maxLon = (decimal)Math.Max(minLongitude, maxLongitude);
        var safeLimit = Math.Clamp(limit, 1, MaxTilePointLimit);

        var query = context.DenormMatrikkelOgEnovaOslos
            .Where(d => d.KommuneNr != null &&
                        d.Coordinate != null &&
                        d.Lat != null &&
                        d.Lon != null &&
                        d.Lat >= minLat &&
                        d.Lat <= maxLat &&
                        d.Lon >= minLon &&
                        d.Lon <= maxLon);

        if (cursorLat.HasValue && cursorLon.HasValue && cursorId.HasValue)
        {
            var cursorLatValue = (decimal)cursorLat.Value;
            var cursorLonValue = (decimal)cursorLon.Value;
            var cursorIdValue = cursorId.Value;

            query = query.Where(d =>
                d.Lat!.Value > cursorLatValue ||
                (d.Lat.Value == cursorLatValue && d.Lon!.Value > cursorLonValue) ||
                (d.Lat.Value == cursorLatValue && d.Lon!.Value == cursorLonValue && d.Id > cursorIdValue));
        }

        var rows = await query
            .OrderBy(d => d.Lat)
            .ThenBy(d => d.Lon)
            .ThenBy(d => d.Id)
            .Select(d => new TilePointRow
            {
                Id = d.Id,
                Lat = d.Lat!.Value,
                Lon = d.Lon!.Value,
                Adresse = d.Adresse,
                KommuneNr = d.KommuneNr,
                Energikarakter = d.Energikarakter,
                Oppvarmingskarakter = d.Oppvarmingskarakter,
                Byggeaar = d.Byggeår,
                EnergiBruk = d.BeregnetLevertEnergiTotaltkWhm2
            })
            .Take(safeLimit + 1)
            .AsNoTracking()
            .ToListAsync();

        var hasMore = rows.Count > safeLimit;
        var pageRows = rows.Take(safeLimit).ToList();
        var last = pageRows.LastOrDefault();

        var features = pageRows.Select(row =>
        {
            var energyUse = ParseNullableDouble(row.EnergiBruk);

            return new
            {
                type = "Feature",
                id = row.Id,
                geometry = new
                {
                    type = "Point",
                    coordinates = new[] { (double)row.Lon, (double)row.Lat }
                },
                properties = new
                {
                    id = row.Id,
                    denormId = row.Id,
                    adresse = row.Adresse,
                    kommunenummer = row.KommuneNr,
                    kommunenavn = row.KommuneNr == 301 ? "Oslo" : "",
                    energikarakter = row.Energikarakter,
                    oppvarmingskarakter = row.Oppvarmingskarakter,
                    byggeaar = row.Byggeaar,
                    energibruk_kwh_m2 = energyUse,
                    beregnetLevertEnergiTotaltkWhm2 = energyUse
                }
            };
        }).ToList();

        return new
        {
            type = "FeatureCollection",
            features,
            hasMore,
            nextCursor = hasMore && last != null
                ? new
                {
                    lat = (double)last.Lat,
                    lon = (double)last.Lon,
                    id = last.Id
                }
                : null
        };
    }

    public async Task<string?> GetTilePointDetails(int id)
    {
        var selected = await context.DenormMatrikkelOgEnovaOslos
            .Where(d => d.Id == id &&
                        d.KommuneNr != null &&
                        d.Coordinate != null)
            .AsNoTracking()
            .FirstOrDefaultAsync();

        if (selected == null) return null;

        var details = await context.DenormMatrikkelOgEnovaOslos
            .Where(d => d.KommuneNr == selected.KommuneNr &&
                        d.GaardsNr == selected.GaardsNr &&
                        d.BruksNr == selected.BruksNr &&
                        d.Adresse == selected.Adresse &&
                        d.Coordinate != null)
            .OrderBy(d => d.BruksenhetsNr)
            .ThenByDescending(d => d.UtstedelsesDato)
            .ThenBy(d => d.Id)
            .AsNoTracking()
            .ToListAsync();

        if (details.Count == 0)
        {
            details.Add(selected);
        }

        var jsonSerializer = new GeojsonSerializer<DenormMatrikkelOgEnovaOsloGeojsonDto>(
            [new DenormMatrikkelOgEnovaOsloGeojsonDto(details)]);

        return jsonSerializer.Json;
    }

    private static double? ParseNullableDouble(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var normalized = value.Trim().Replace(',', '.');
        return double.TryParse(normalized, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private sealed class TilePointRow
    {
        public int Id { get; set; }
        public decimal Lat { get; set; }
        public decimal Lon { get; set; }
        public string? Adresse { get; set; }
        public short? KommuneNr { get; set; }
        public string? Energikarakter { get; set; }
        public string? Oppvarmingskarakter { get; set; }
        public short? Byggeaar { get; set; }
        public string? EnergiBruk { get; set; }
    }
    
}
