using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Controllers;

[Route("api/bydel-stats")]
[ApiController]
public class BydelStatsController : ControllerBase
{
    private const string OsloPxWebBaseUrl = "https://statistikkbanken.oslo.kommune.no/statbank/api/v1/no/db1";
    private const string SsbPxWebV2BaseUrl = "https://data.ssb.no/api/pxwebapi/v2/tables";
    private const string NobilSearchUrl = "https://nobil.no/api/server/search.php";

    private static readonly IReadOnlyDictionary<string, BydelInfo> Bydeler = new Dictionary<string, BydelInfo>
    {
        ["all"] = new("Oslo i alt", "0", "328", "030100aa", 59.917330, 10.844128, 0.16, 0.34),
        ["gamle-oslo"] = new("Gamle Oslo", "1", "0", "030101a", 59.9056, 10.7867, 0.035, 0.055),
        ["grunerlokka"] = new("Grünerløkka", "2", "1", "030102a", 59.925, 10.759, 0.030, 0.045),
        ["sagene"] = new("Sagene", "3", "2", "030103a", 59.937, 10.755, 0.026, 0.040),
        ["st-hanshaugen"] = new("St. Hanshaugen", "4", "3", "030104a", 59.9227, 10.7396, 0.026, 0.040),
        ["frogner"] = new("Frogner", "5", "4", "030105a", 59.9225, 10.706, 0.044, 0.065),
        ["ullern"] = new("Ullern", "6", "5", "030106a", 59.925, 10.650, 0.052, 0.080),
        ["vestre-aker"] = new("Vestre Aker", "7", "6", "030107a", 59.957, 10.673, 0.062, 0.095),
        ["nordre-aker"] = new("Nordre Aker", "8", "7", "030108a", 59.956, 10.755, 0.055, 0.085),
        ["bjerke"] = new("Bjerke", "9", "8", "030109a", 59.942, 10.815, 0.045, 0.070),
        ["grorud"] = new("Grorud", "10", "9", "030110a", 59.962, 10.880, 0.052, 0.080),
        ["stovner"] = new("Stovner", "11", "10", "030111a", 59.962, 10.925, 0.050, 0.078),
        ["alna"] = new("Alna", "12", "11", "030112a", 59.932, 10.855, 0.060, 0.095),
        ["ostensjo"] = new("Østensjø", "13", "12", "030113a", 59.885, 10.832, 0.055, 0.085),
        ["nordstrand"] = new("Nordstrand", "14", "13", "030114a", 59.865, 10.795, 0.060, 0.090),
        ["sondre-nordstrand"] = new("Søndre Nordstrand", "15", "14", "030115a", 59.835, 10.840, 0.070, 0.100)
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BydelStatsController> _logger;

    public BydelStatsController(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<BydelStatsController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpGet("{bydelId}")]
    public async Task<IActionResult> GetBydelStats(string bydelId)
    {
        if (!Bydeler.TryGetValue(bydelId, out var bydel))
        {
            return NotFound(new { message = $"Unknown Oslo bydel: {bydelId}" });
        }

        var housingTask = GetHousingStats(bydel);
        var populationTask = GetPopulationStats(bydel);
        var incomeTask = GetIncomeStats(bydel);
        var chargerTask = GetChargerStats(bydel);

        await Task.WhenAll(housingTask, populationTask, incomeTask, chargerTask);

        return Ok(new
        {
            id = bydelId,
            name = bydel.Name,
            housing = housingTask.Result,
            demographics = new
            {
                incomeTask.Result.MedianHouseholdIncome,
                populationTask.Result.Population,
                populationTask.Result.PopulationGrowthPercent,
                populationTask.Result.LatestYear
            },
            chargers = chargerTask.Result,
            sources = new[]
            {
                "Oslo statistikkbank: BOL013, BOL016, BOL018",
                "SSB Statbank API v2: 06944, 10826",
                "NOBIL database"
            }
        });
    }

    private async Task<object> GetHousingStats(BydelInfo bydel)
    {
        var medianPrice = await QueryPxSingleValue(
            "Boliger og byggevirksomhet/Boligpriser/ok-bol013.px",
            new Dictionary<string, string[]>
            {
                ["år"] = ["top(1)"],
                ["geografi"] = [bydel.OsloSalesGeoValue],
                ["statistikkvariabel"] = ["1"]
            });

        var pricePerM2 = await QueryPxSingleValue(
            "Boliger og byggevirksomhet/Boligpriser/ok-bol018.px",
            new Dictionary<string, string[]>
            {
                ["år"] = ["top(1)"],
                ["geografi"] = [bydel.OsloSalesGeoValue],
                ["statistikkvariabel"] = ["2"]
            });

        var priceIndex = await QueryPxTimeSeries(
            "Boliger og byggevirksomhet/Boligpriser/ok-bol016.px",
            new Dictionary<string, string[]>
            {
                ["geografi"] = [bydel.Code],
                ["år, måned"] = ["top(12)"],
                ["statistikkvariabel"] = ["1"]
            });

        return new
        {
            medianHousePrice = medianPrice.Value,
            pricePerM2 = pricePerM2.Value,
            priceTrendPercent = CalculatePercentChange(priceIndex.Values),
            latestYear = FirstNonEmpty(medianPrice.Period, pricePerM2.Period, priceIndex.LatestPeriod),
            status = FirstNonEmpty(medianPrice.Error, pricePerM2.Error, priceIndex.Error)
        };
    }

    private async Task<(double? Population, double? PopulationGrowthPercent, string? LatestYear, string? Error)> GetPopulationStats(BydelInfo bydel)
    {
        var series = await QuerySsbV2TimeSeries(
            "10826",
            new Dictionary<string, string[]>
            {
                ["Region"] = [bydel.SsbRegionCode],
                ["Kjonn"] = ["*"],
                ["Alder"] = ["*"],
                ["ContentsCode"] = ["Personer"],
                ["Tid"] = ["top(2)"]
            });

        var latest = series.Values.LastOrDefault();
        return (latest.Value, CalculatePercentChange(series.Values), latest.Period ?? series.LatestPeriod, series.Error);
    }

    private async Task<(double? MedianHouseholdIncome, string? Error)> GetIncomeStats(BydelInfo bydel)
    {
        var income = await QuerySsbV2SingleValue(
            "06944",
            new Dictionary<string, string[]>
            {
                ["Region"] = [bydel.SsbRegionCode],
                ["HusholdType"] = ["0000"],
                ["ContentsCode"] = ["InntSkatt"],
                ["Tid"] = ["top(1)"]
            });

        return (income.Value, income.Error);
    }

    private async Task<object> GetChargerStats(BydelInfo bydel)
    {
        var apiKey = _configuration["Nobil:ApiKey"] ?? Environment.GetEnvironmentVariable("NOBIL_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new { publicChargers = (int?)null, fastChargers = (int?)null, status = "Set Nobil:ApiKey or NOBIL_API_KEY to load charger stats." };
        }

        try
        {
            var client = CreateExternalApiClient();
            var northEast = $"({FormatInvariant(bydel.Latitude + bydel.LatitudeSpan / 2)}, {FormatInvariant(bydel.Longitude + bydel.LongitudeSpan / 2)})";
            var southWest = $"({FormatInvariant(bydel.Latitude - bydel.LatitudeSpan / 2)}, {FormatInvariant(bydel.Longitude - bydel.LongitudeSpan / 2)})";
            var form = new Dictionary<string, string>
            {
                ["apikey"] = apiKey,
                ["apiversion"] = "3",
                ["action"] = "search",
                ["type"] = "rectangle",
                ["northeast"] = northEast,
                ["southwest"] = southWest,
                ["limit"] = "2000",
                ["format"] = "json"
            };

            using var response = await client.PostAsync(NobilSearchUrl, new FormUrlEncodedContent(form));
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);
            var stations = ExtractNobilStations(document.RootElement).ToList();

            var publicChargers = stations.Sum(station => station.ChargerPoints);
            var fastChargers = stations.Where(station => station.IsFast).Sum(station => station.ChargerPoints);

            return new { publicChargers, fastChargers, status = (string?)null };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch NOBIL charger stats.");
            return new { publicChargers = (int?)null, fastChargers = (int?)null, status = "NOBIL data unavailable." };
        }
    }

    private async Task<PxValueResult> QueryPxSingleValue(string tablePath, IReadOnlyDictionary<string, string[]> filters)
    {
        var result = await QueryPxTimeSeries(tablePath, filters);
        var latest = result.Values.LastOrDefault();
        return latest is null
            ? new PxValueResult(null, result.LatestPeriod, result.Error)
            : new PxValueResult(latest.Value, latest.Period ?? result.LatestPeriod, result.Error);
    }

    private async Task<PxValueResult> QuerySsbV2SingleValue(string tableId, IReadOnlyDictionary<string, string[]> filters)
    {
        var result = await QuerySsbV2TimeSeries(tableId, filters);
        var latest = result.Values.LastOrDefault();
        return latest is null
            ? new PxValueResult(null, result.LatestPeriod, result.Error)
            : new PxValueResult(latest.Value, latest.Period ?? result.LatestPeriod, result.Error);
    }

    private async Task<PxSeriesResult> QuerySsbV2TimeSeries(string tableId, IReadOnlyDictionary<string, string[]> filters)
    {
        try
        {
            var client = CreateExternalApiClient();
            var url = $"{SsbPxWebV2BaseUrl}/{tableId}/data?lang=no&outputFormat=json-stat2";
            var query = new
            {
                selection = filters.Select(item => new
                {
                    variableCode = item.Key,
                    valueCodes = item.Value
                })
            };

            using var response = await client.PostAsJsonAsync(url, query);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);
            return ParseJsonStat2TimeSeries(document.RootElement);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch SSB table {TableId}.", tableId);
            return new PxSeriesResult([], null, "SSB statistics unavailable.");
        }
    }

    private async Task<PxSeriesResult> QueryPxTimeSeries(string tablePath, IReadOnlyDictionary<string, string[]> filters)
    {
        try
        {
            var client = CreateExternalApiClient();
            var url = $"{OsloPxWebBaseUrl}/{Uri.EscapeUriString(tablePath)}";
            var query = new
            {
                query = filters.Select(item => new
                {
                    code = item.Key,
                    selection = BuildPxSelection(item.Value)
                }),
                response = new { format = "JSON-stat2" }
            };

            using var response = await client.PostAsJsonAsync(url, query);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);
            return ParseJsonStat2TimeSeries(document.RootElement);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch PxWeb table {TablePath}.", tablePath);
            return new PxSeriesResult([], null, "Oslo statistics unavailable.");
        }
    }

    private static object BuildPxSelection(string[] values)
    {
        if (values.Contains("*"))
        {
            return new { filter = "all", values = Array.Empty<string>() };
        }

        if (values.Length == 1 && values[0].StartsWith("top(", StringComparison.OrdinalIgnoreCase) && values[0].EndsWith(')'))
        {
            return new { filter = "top", values = new[] { values[0][4..^1] } };
        }

        return new { filter = "item", values };
    }

    private static PxSeriesResult ParseJsonStat2TimeSeries(JsonElement root)
    {
        if (!root.TryGetProperty("id", out var idsElement) ||
            !root.TryGetProperty("size", out var sizesElement) ||
            !root.TryGetProperty("value", out var valuesElement) ||
            idsElement.ValueKind != JsonValueKind.Array ||
            sizesElement.ValueKind != JsonValueKind.Array)
        {
            return new PxSeriesResult([], null, null);
        }

        var ids = idsElement.EnumerateArray().Select(item => item.GetString() ?? "").ToList();
        var sizes = sizesElement.EnumerateArray().Select(item => item.GetInt32()).ToList();
        var timeDimensionId = GetJsonStatTimeDimensionId(root) ?? "Tid";
        var timeDimensionIndex = ids.IndexOf(timeDimensionId);
        if (timeDimensionIndex < 0) return new PxSeriesResult([], null, null);

        var periods = GetJsonStatCategoryCodes(root, timeDimensionId);
        var sums = periods.ToDictionary(period => period.Position, _ => 0d);

        var values = valuesElement.ValueKind == JsonValueKind.Array
            ? valuesElement.EnumerateArray().ToList()
            : [];

        for (var flatIndex = 0; flatIndex < values.Count; flatIndex += 1)
        {
            var value = ParseNullableDouble(values[flatIndex]);
            if (!value.HasValue) continue;

            var timePosition = GetDimensionPosition(flatIndex, sizes, timeDimensionIndex);
            if (sums.ContainsKey(timePosition))
            {
                sums[timePosition] += value.Value;
            }
        }

        var points = periods
            .Where(period => sums.TryGetValue(period.Position, out var sum) && sum > 0)
            .Select(period => new PxPoint(period.Label, sums[period.Position]))
            .ToList();

        return new PxSeriesResult(points, points.LastOrDefault().Period, null);
    }

    private static string? GetJsonStatTimeDimensionId(JsonElement root)
    {
        if (!root.TryGetProperty("role", out var role) ||
            !role.TryGetProperty("time", out var time) ||
            time.ValueKind != JsonValueKind.Array ||
            time.GetArrayLength() == 0)
        {
            return null;
        }

        return time[0].GetString();
    }

    private static List<(int Position, string Label)> GetJsonStatCategoryCodes(JsonElement root, string dimensionId)
    {
        if (!root.TryGetProperty("dimension", out var dimensions) ||
            !dimensions.TryGetProperty(dimensionId, out var dimension) ||
            !dimension.TryGetProperty("category", out var category) ||
            !category.TryGetProperty("index", out var index) ||
            index.ValueKind != JsonValueKind.Object)
        {
            return [];
        }

        var labels = category.TryGetProperty("label", out var labelElement) && labelElement.ValueKind == JsonValueKind.Object
            ? labelElement
            : default;

        return index.EnumerateObject()
            .Select(property => (
                Position: property.Value.GetInt32(),
                Label: labels.ValueKind == JsonValueKind.Object && labels.TryGetProperty(property.Name, out var label)
                    ? label.GetString() ?? property.Name
                    : property.Name))
            .OrderBy(item => item.Position)
            .ToList();
    }

    private static int GetDimensionPosition(int flatIndex, IReadOnlyList<int> sizes, int dimensionIndex)
    {
        var divisor = 1;
        for (var index = dimensionIndex + 1; index < sizes.Count; index += 1)
        {
            divisor *= sizes[index];
        }

        return flatIndex / divisor % sizes[dimensionIndex];
    }

    private static IEnumerable<NobilStation> ExtractNobilStations(JsonElement root)
    {
        var stationElements = new List<JsonElement>();
        if (root.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in root.EnumerateArray())
            {
                if (item.TryGetProperty("chargerstations", out var nested) && nested.ValueKind == JsonValueKind.Array)
                {
                    stationElements.AddRange(nested.EnumerateArray());
                }
                else
                {
                    stationElements.Add(item);
                }
            }
        }
        else if (root.TryGetProperty("chargerstations", out var stations) && stations.ValueKind == JsonValueKind.Array)
        {
            stationElements.AddRange(stations.EnumerateArray());
        }

        foreach (var station in stationElements)
        {
            var source = station.TryGetProperty("csmd", out var csmd) ? csmd : station;
            var points = GetInt(source, "Number_charging_points", "chargerpointnumber") ?? 1;
            var speedText = string.Join(" ", GetString(source, "chargerspeed"), GetString(source, "Description_of_location"), station.ToString());
            yield return new NobilStation(Math.Max(points, 1), IsFastCharger(speedText));
        }
    }

    private static bool IsFastCharger(string value)
    {
        var text = value.ToLowerInvariant();
        if (text.Contains("hurtig") || text.Contains("lyn") || text.Contains("fast")) return true;
        return System.Text.RegularExpressions.Regex.Matches(text, @"(\d+(?:[.,]\d+)?)\s*kw")
            .Select(match => double.TryParse(match.Groups[1].Value.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0)
            .Any(number => number >= 50);
    }

    private static double? CalculatePercentChange(IReadOnlyList<PxPoint> points)
    {
        if (points.Count < 2) return null;
        var first = points.First().Value;
        var last = points.Last().Value;
        return first == 0 ? null : Math.Round(((last - first) / first) * 100, 1);
    }

    private static double? ParseNullableDouble(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Number && element.TryGetDouble(out var number)) return number;
        if (element.ValueKind == JsonValueKind.String && double.TryParse(element.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out number)) return number;
        return null;
    }

    private static int? GetInt(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (element.TryGetProperty(name, out var value))
            {
                if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)) return number;
                if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out number)) return number;
            }
        }

        return null;
    }

    private static string? GetString(JsonElement element, string name)
    {
        return element.TryGetProperty(name, out var value) ? value.ToString() : null;
    }

    private static string FormatInvariant(double value) => value.ToString("0.######", CultureInfo.InvariantCulture);

    private static string? FirstNonEmpty(params string?[] values) => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

    private HttpClient CreateExternalApiClient()
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(12);
        return client;
    }

    private sealed record BydelInfo(string Name, string Code, string OsloSalesGeoValue, string SsbRegionCode, double Latitude, double Longitude, double LatitudeSpan, double LongitudeSpan);
    private sealed record PxPoint(string? Period, double Value);
    private sealed record PxSeriesResult(IReadOnlyList<PxPoint> Values, string? LatestPeriod, string? Error);
    private sealed record PxValueResult(double? Value, string? Period, string? Error);
    private sealed record NobilStation(int ChargerPoints, bool IsFast);
}
