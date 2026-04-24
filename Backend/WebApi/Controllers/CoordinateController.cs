using Core.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Features;
using NetTopologySuite.Geometries;
using NetTopologySuite;

namespace WebApi.Controllers
{
    [Route("api/bygg")]
    [ApiController]
    public class ByggController : ControllerBase
    {
        private readonly EnergimerkingContext _context;

        public ByggController(EnergimerkingContext context)
        {
            _context = context;
        }

        
        
        [HttpGet("geojson")]
        public async Task<IActionResult> GetGeoJson(int limit = 8000)
        {
            var data = await _context.VByggMedKoordinaters
                .Where(x => x.Geography != null)
                .Select(x => new
                {
                    Bygningsnummer = x.Bygningsnummer,
                    bruksnummer = x.Bruksnummer,
                    Adresse = x.Adresse,
                    Attestnummer = x.Attestnummer,
                    Poststed = x.Poststed,
                    Kommunenavn = x.Kommunenavn ?? "",
                    Latitude = x.Latitude,
                    Longitude = x.Longitude,
                    Energikarakter = x.Energikarakter,
                    Oppvarmingskarakter = x.Oppvarmingskarakter,
                    EnergibrukKwhM2 = x.EnergibrukKwhM2,
                    Byggeaar = x.Byggeaar,
                    Bygningskategori = x.Bygningskategori
                })
                .Take(limit)
                .ToListAsync();

            var features = data.Select(item => new
            {
                type = "Feature",
                geometry = new
                {
                    type = "Point",
                    coordinates = new[] { item.Longitude, item.Latitude }
                },
                properties = new
                {
                    bygningsnummer = item.Bygningsnummer,
                    bruksnummer = item.bruksnummer,
                    adresse = item.Adresse,
                    attestnummer = item.Attestnummer,
                    poststed = item.Poststed,
                    kommunenavn = item.Kommunenavn,
                    energikarakter = item.Energikarakter,
                    Oppvarmingskarakter = item.Oppvarmingskarakter,
                    energibruk_kwh_m2 = item.EnergibrukKwhM2,
                    byggeaar = item.Byggeaar,
                    bygningskategori = item.Bygningskategori
                }
            }).ToList();

            var geoJson = new
            {
                type = "FeatureCollection",
                features = features
            };

            return Ok(geoJson);
        }

       
        [HttpGet("nearby")]
        public async Task<ActionResult<IEnumerable<object>>> GetNearby(
            double latitude,
            double longitude,
            double radiusInMeters = 5000)
        {
            if (radiusInMeters <= 0 || radiusInMeters > 50000)
            {
                return BadRequest("Radius må være mellom 1 og 50 000 meter.");
            }

            try
            {
               var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4258);

      
            var searchPoint = factory.CreatePoint(
            new NetTopologySuite.Geometries.Coordinate(longitude, latitude)
        );

                var data = await _context.Coordinates
                    .Where(c => c.Geography != null)
                    .Where(c => c.Geography.IsWithinDistance(searchPoint, radiusInMeters))
                    .Select(c => new
                    {
                        c.Coordinateid,
                        c.Latitude,
                        c.Longitude
                    })
                    .Take(8000)
                    .ToListAsync();

                return Ok(data);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Feil ved søk: {ex.Message}");
            }
        }

        //laget view får ikke koblet til gir 500 error
        [HttpPost("refresh")]
        public async Task<IActionResult> RefreshData()
        {
            try
            {
                await _context.Database.ExecuteSqlRawAsync(
                    "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bygg_med_koordinater;");
                
                return Ok(new { message = "Materialized view ble oppdatert" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Feil ved oppdatering: {ex.Message}");
            }
        }
    }
}