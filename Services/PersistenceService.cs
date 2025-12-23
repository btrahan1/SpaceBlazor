using Microsoft.JSInterop;
using System.Text.Json;
using SpaceBlazor.Services;

namespace SpaceBlazor.Services
{
    public class SaveData
    {
        public int Credits { get; set; }
        public int Fuel { get; set; }
        public int Hull { get; set; }
        public Dictionary<string, int> Cargo { get; set; } = new();
        public string CurrentSystemId { get; set; }
        public string ShipClassId { get; set; } = "sidewinder";
        // [NEW] Position Support
        public float PositionX { get; set; }
        public float PositionY { get; set; }
        public float PositionZ { get; set; }
        public DateTime Timestamp { get; set; }
        // [NEW] Supporter Status
        public bool IsSupporter { get; set; } = false;
    }

    public class PersistenceService
    {
        private readonly IJSRuntime _js;
        private const string MANIFEST_KEY = "SpaceBlazor_SaveManifest";
        private const string CALLSIGN_KEY = "SpaceBlazor_ActiveCallsign";

        public PersistenceService(IJSRuntime js)
        {
            _js = js;
        }

        public async Task<string?> GetCallsignAsync()
        {
            return await _js.InvokeAsync<string>("localStorage.getItem", CALLSIGN_KEY);
        }

        public async Task SetCallsignAsync(string callsign)
        {
            await _js.InvokeVoidAsync("localStorage.setItem", CALLSIGN_KEY, callsign);
        }

        public async Task<List<string>> GetSavesAsync()
        {
            var json = await _js.InvokeAsync<string>("localStorage.getItem", MANIFEST_KEY);
            if (string.IsNullOrEmpty(json)) return new List<string>();
            return JsonSerializer.Deserialize<List<string>>(json);
        }

        public async Task SaveGameAsync(string name, GameState state, string currentSystemId)
        {
            // 1. Get List
            var saves = await GetSavesAsync();
            if (!saves.Contains(name))
            {
                saves.Add(name);
                await _js.InvokeVoidAsync("localStorage.setItem", MANIFEST_KEY, JsonSerializer.Serialize(saves));
            }

            // 2. Get Position from JS
            // We assume spaceRenderer.getShipPosition returns generic object {x, y, z}
            var pos = await _js.InvokeAsync<PositionDto>("spaceRenderer.getShipPosition");

            var data = new SaveData
            {
                Credits = state.Credits,
                Fuel = state.Fuel,
                Hull = state.Hull,
                Cargo = new Dictionary<string, int>(state.Cargo),
                CurrentSystemId = currentSystemId,
                PositionX = pos.x,
                PositionY = pos.y,
                PositionZ = pos.z,
                Timestamp = DateTime.UtcNow,
                IsSupporter = state.IsSupporter // [NEW] Persist Status
            };

            var key = $"SpaceBlazor_Save_{name}";
            await _js.InvokeVoidAsync("localStorage.setItem", key, JsonSerializer.Serialize(data));
        }

        public async Task<SaveData?> LoadGameAsync(string name)
        {
            var key = $"SpaceBlazor_Save_{name}";
            var json = await _js.InvokeAsync<string>("localStorage.getItem", key);
            if (string.IsNullOrEmpty(json)) return null;
            return JsonSerializer.Deserialize<SaveData>(json);
        }

        public async Task SetShipPositionAsync(float x, float y, float z)
        {
            await _js.InvokeVoidAsync("spaceRenderer.setShipPosition", x, y, z);
        }

        public async Task DeleteGameAsync(string name)
        {
            var key = $"SpaceBlazor_Save_{name}";
            await _js.InvokeVoidAsync("localStorage.removeItem", key);

            // Update Manifest
            var saves = await GetSavesAsync();
            if (saves.Remove(name))
            {
                await _js.InvokeVoidAsync("localStorage.setItem", MANIFEST_KEY, JsonSerializer.Serialize(saves));
            }
        }
    }

    public class PositionDto { public float x { get; set; } public float y { get; set; } public float z { get; set; } }
}
