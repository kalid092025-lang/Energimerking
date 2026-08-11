using Core.Class.DTOs;
using Core.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Features;
using NetTopologySuite.Geometries;
using NetTopologySuite;
using Coordinate = Core.Models.Coordinate;
using EnergimerkingContext = Core.DbContexts.EnergimerkingContext;

namespace WebApi.Controllers
{
    [Route("api/bygg")]
    [ApiController]
    public class ByggController : ControllerBase
    {
        private readonly EnergimerkingContext _context;
        private readonly EnergimerkingService _service;
        private ILogger<EnergimerkingContext> _logger;

        //Om det dukker opp feil se på constructoren. 
        public ByggController(EnergimerkingContext context, EnergimerkingService service)
        {
            _context = context;
            _service = service;
        }
        /// <summary>
        /// IKKE FERDIG
        /// Henter ut gitt mengde med koordinater som har flere eiendoms-modeller knyttet til seg.
        /// </summary>
        /// <param name="amount">antall</param>
        /// <returns></returns>
        [HttpGet("get_many_in_one_geojson")]
        public async Task<IActionResult> getManyInOneGeoJson(int amount)
        {
            List<Coordinate> coordinates = await _context.Coordinates.Where(c => c.Kommunenummer != null && c.Geography != null).Take(amount).ToListAsync();
            foreach (var coord in coordinates)
            {
                
            }

            string jsonString = await _service.GetAmountCoordinateGeojson(amount);
            
            return Ok(jsonString);
        }
        
        /*[HttpGet("geojson")]
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
        }*/

       
        [HttpGet("nearby/geojson")]
        public async Task<IActionResult> GetNearbyGeoJson(
            double latitude,
            double longitude,
            int amount,
            double radiusInMeters = 5000)
        {
            if (radiusInMeters <= 0 || radiusInMeters > 50000)
            {
                return BadRequest("Radius må være mellom 1 og 50 000 meter.");
            }
            try
            {
                /*var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4258);

      
                var searchPoint = factory.CreatePoint(
                new NetTopologySuite.Geometries.Coordinate(longitude, latitude)
                );*/
                
                //Finner koordinater innenfor søkepunktet, og
                //returnerer en utspørringsliste med koordinat som nøkkel og en utspørringsliste med eiendommer som er knyttet til nøkkelen.
                /*var coordinates = _context.Coordinates
                    .Where(c =>
                        c.Geography != null &&
                        c.Geography.IsWithinDistance(searchPoint, radiusInMeters)
                    )
                    .Take(amount)
                    .GroupBy(c => c, value => _context.Coordinates.SelectMany(c_inner =>
                        _context.Eiendoms.Where(e => e.Coordinateid == c_inner.Coordinateid)));
                
                var dtoList = await coordinates.Select(item =>
                    new FlereEiendommerEttKoordGeojsonDto(item.Key, item.SelectMany(i => i))).ToListAsync();
                
                var jsonSerializer = new GeojsonSerializer<FlereEiendommerEttKoordGeojsonDto>(dtoList);*/
                string jsonString = await _service.GetNearbyGeoJson(latitude, longitude, amount, radiusInMeters);

                return Ok(jsonString);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Feil ved søk: {ex.Message}");
            }
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
                    .Take(2000)
                    .ToListAsync();

                return Ok(data);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Feil ved søk: {ex.Message}");
            }
        }
        
        /*[HttpGet("getamount_geojson")]
        public async Task<IActionResult> GetAmountGeojson(int amount)
        {
            string jsonString = null;
            try
            {
                var dbSetList = await _context.VByggMedKoordinaters.Where(c => c.Kommunenummer != null && c.Geography != null).Take(amount).ToListAsync();
                List<VByggMedKoordinaterGeojsonDto> list = dbSetList.Select(item=>new VByggMedKoordinaterGeojsonDto(item)).ToList();
                var jsonSerializer = new GeojsonSerializer<VByggMedKoordinaterGeojsonDto>(list);
                jsonString = jsonSerializer.Json;
                
            }
            catch(Exception ex)
            {
                //_logger.LogError(ex.Message);
                return StatusCode(500, ex.Message);
            }
            return Ok(jsonString);
        }*/

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
        /// <summary>
        /// Henter gitt mengde med denormaliserte energi-attester sammen med koordinater innenfor
        /// spesifisert radius i meter.(DenormMatrikkelOgEnovaOslo blir hentet)
        /// Blir ikke gjort om til geojson enda.
        /// </summary>
        /// <param name="latitude"></param>
        /// <param name="longitude"></param>
        /// <param name="radiusInMeters"></param>
        /// <param name="amount"></param>
        /// <returns></returns>
        [HttpGet("GetNearbyDeNormDynamicList")]
        public async Task<IActionResult> GetNearbyDeNormDynamicList(
            double latitude = 59.9,
            double longitude = 10.8,
            double radiusInMeters = 2500,
            int amount = 10 
        )
        {
            try
            {
                var sumStuff = await _service.GetNearbyDeNormDynamicList(latitude, longitude, amount, radiusInMeters);

                return Ok(sumStuff);
            } catch (Exception ex)
            {
                return StatusCode(500, $"Feil: {ex.Message}");
            }
        }
        /// <summary>
        /// Henter gitt mengde med denormaliserte energi-attester og eiendommer sammen med koordinater innenfor
        /// spesifisert radius i meter og gjøres om til geojson.(DenormMatrikkelOgEnovaOslo blir hentet)
        /// </summary>
        /// <param name="latitude"></param>
        /// <param name="longitude"></param>
        /// <param name="radiusInMeters"></param>
        /// <param name="amount"></param>
        /// <param name="onlyNew">Om du bare vil ha den nyeste attesten per eiendom.</param>
        /// <returns>Liste av DenormMatrikkelOgEnovaOslo i geojson</returns>
        [HttpGet("GetNearbyDeNormGeoJson")]
        public async Task<IActionResult> GetNearbyDeNormGeoJson(
            double latitude = 59.9,
            double longitude = 10.8,
            double radiusInMeters = 2500,
            int amount = 10,
            bool onlyNew = false,
            int skip = 0
        )
        {
            if (radiusInMeters <= 0 || radiusInMeters > 50000)
            {
                return BadRequest("Radius må være mellom 1 og 50 000 meter.");
            }
            if (amount <= 0)
            {
                return BadRequest("Amount must be greater than 0.");
            }
            if (skip < 0)
            {
                return BadRequest("Skip cannot be negative.");
            }
            try
            {
                var sumStuff = await _service.GetNearbyDeNormGeoJson(latitude, longitude, amount, radiusInMeters, onlyNew, skip);

                return Ok(sumStuff);
            } catch (Exception ex)
            {
                return StatusCode(500, $"Feil: {ex.Message}");
            }
        }

        [HttpGet("GetBoundsDeNormGeoJson")]
        public async Task<IActionResult> GetBoundsDeNormGeoJson(
            double minLatitude,
            double minLongitude,
            double maxLatitude,
            double maxLongitude,
            int amount = 10,
            bool onlyNew = false,
            int skip = 0
        )
        {
            if (minLatitude < -90 || minLatitude > 90 || maxLatitude < -90 || maxLatitude > 90)
            {
                return BadRequest("Latitude must be between -90 and 90.");
            }
            if (minLongitude < -180 || minLongitude > 180 || maxLongitude < -180 || maxLongitude > 180)
            {
                return BadRequest("Longitude must be between -180 and 180.");
            }
            if (amount <= 0)
            {
                return BadRequest("Amount must be greater than 0.");
            }
            if (skip < 0)
            {
                return BadRequest("Skip cannot be negative.");
            }

            try
            {
                var sumStuff = await _service.GetBoundsDeNormGeoJson(
                    minLatitude,
                    minLongitude,
                    maxLatitude,
                    maxLongitude,
                    amount,
                    onlyNew,
                    skip);

                return Ok(sumStuff);
            } catch (Exception ex)
            {
                return StatusCode(500, $"Feil: {ex.Message}");
            }
        }

        [HttpGet("GetBoundsTilePoints")]
        public async Task<IActionResult> GetBoundsTilePoints(
            double minLatitude,
            double minLongitude,
            double maxLatitude,
            double maxLongitude,
            int limit = 2000,
            double? cursorLat = null,
            double? cursorLon = null,
            int? cursorId = null
        )
        {
            if (minLatitude < -90 || minLatitude > 90 || maxLatitude < -90 || maxLatitude > 90)
            {
                return BadRequest("Latitude must be between -90 and 90.");
            }
            if (minLongitude < -180 || minLongitude > 180 || maxLongitude < -180 || maxLongitude > 180)
            {
                return BadRequest("Longitude must be between -180 and 180.");
            }
            if (limit <= 0 || limit > 5000)
            {
                return BadRequest("Limit must be between 1 and 5000.");
            }

            var hasAnyCursor = cursorLat.HasValue || cursorLon.HasValue || cursorId.HasValue;
            var hasFullCursor = cursorLat.HasValue && cursorLon.HasValue && cursorId.HasValue;
            if (hasAnyCursor && !hasFullCursor)
            {
                return BadRequest("cursorLat, cursorLon, and cursorId must be supplied together.");
            }
            if (cursorLat is < -90 or > 90)
            {
                return BadRequest("cursorLat must be between -90 and 90.");
            }
            if (cursorLon is < -180 or > 180)
            {
                return BadRequest("cursorLon must be between -180 and 180.");
            }
            if (cursorId is <= 0)
            {
                return BadRequest("cursorId must be greater than 0.");
            }

            try
            {
                var result = await _service.GetBoundsTilePoints(
                    minLatitude,
                    minLongitude,
                    maxLatitude,
                    maxLongitude,
                    limit,
                    cursorLat,
                    cursorLon,
                    cursorId);

                return Ok(result);
            } catch (Exception ex)
            {
                return StatusCode(500, $"Feil: {ex.Message}");
            }
        }

        [HttpGet("GetTilePointDetails")]
        public async Task<IActionResult> GetTilePointDetails(int id)
        {
            if (id <= 0)
            {
                return BadRequest("Id must be greater than 0.");
            }

            try
            {
                var result = await _service.GetTilePointDetails(id);

                if (result == null)
                {
                    return NotFound("Tile point was not found.");
                }

                return Ok(result);
            } catch (Exception ex)
            {
                return StatusCode(500, $"Feil: {ex.Message}");
            }
        }
        /// <summary>
        /// Dette er bare ett leke-endepunkt.
        /// </summary>
        /// <param name="latitude"></param>
        /// <param name="longitude"></param>
        /// <param name="radiusInMeters"></param>
        /// <param name="amount"></param>
        /// <returns></returns>
        [HttpGet("get_sum")]
        public async Task<IActionResult> getSumTest(
            double latitude = 59.9,
            double longitude = 10.8,
            double radiusInMeters = 2500,
            int amount = 10,
            bool onlyNew = false
            )
        {
            if (radiusInMeters <= 0 || radiusInMeters > 50000)
            {
                return BadRequest("Radius må være mellom 1 og 50 000 meter.");
            }
            try
            {
                var sumStuff = await _service.GetNearbyDeNormGeoJson(latitude, longitude, amount, radiusInMeters,onlyNew);

                return Ok(sumStuff);
            } catch (Exception ex)
            {
                return StatusCode(500, $"Feil: {ex.Message}");
            }
        }
    }
}
