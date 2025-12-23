using System.Net.Http.Json;
using System.Text.Json;

namespace SpaceBlazor.Services
{
    public class FirebaseService
    {
        private readonly HttpClient _http;
        private readonly GameState _state;
        private readonly string _baseUrl = "https://spaceblazor-default-rtdb.firebaseio.com/"; // Production URL for 'spaceblazor'

        public FirebaseService(HttpClient http, GameState state)
        {
            _http = http;
            _state = state;
        }

        public async Task<T?> GetNodeAsync<T>(string path)
        {
            if (!_state.IsMultiplayerEnabled) return default;
            try
            {
                return await _http.GetFromJsonAsync<T>($"{_baseUrl}universes/{_state.UniverseId}/{path}.json");
            }
            catch (Exception)
            {
                throw;
            }
        }

        public async Task UpdateNodeAsync<T>(string path, T data)
        {
            if (!_state.IsMultiplayerEnabled) return;
            try
            {
                var response = await _http.PatchAsJsonAsync($"{_baseUrl}universes/{_state.UniverseId}/{path}.json", data);
                response.EnsureSuccessStatusCode();
            }
            catch (Exception)
            {
                throw;
            }
        }

        public async Task PushNodeAsync<T>(string path, T data)
        {
            if (!_state.IsMultiplayerEnabled) return;
            try
            {
                var response = await _http.PostAsJsonAsync($"{_baseUrl}universes/{_state.UniverseId}/{path}.json", data);
                response.EnsureSuccessStatusCode();
            }
            catch (Exception)
            {
                throw;
            }
        }

        // [NEW] Method to list universes (scans the root list)
        public async Task<Dictionary<string, UniverseMeta>?> GetUniversesAsync()
        {
            try
            {
                return await _http.GetFromJsonAsync<Dictionary<string, UniverseMeta>>($"{_baseUrl}universe_list.json");
            }
            catch { return null; }
        }

        public async Task RegisterUniverseAsync(string id, string name, string creator)
        {
            try
            {
                var meta = new UniverseMeta { Name = name, Creator = creator, CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds() };
                var response = await _http.PatchAsJsonAsync($"{_baseUrl}universe_list.json", new Dictionary<string, UniverseMeta> { { id, meta } });
                response.EnsureSuccessStatusCode();
            }
            catch { }
        }

        // [NEW] Player Persistence
        public async Task SavePlayerStateAsync(string callsign, SaveData data)
        {
            await UpdateNodeAsync($"players/{callsign}", data);
        }

        public async Task<SaveData?> GetPlayerStateAsync(string callsign)
        {
            return await GetNodeAsync<SaveData>($"players/{callsign}");
        }

        public async Task<Dictionary<string, SaveData>?> GetAllPlayersAsync()
        {
            return await GetNodeAsync<Dictionary<string, SaveData>>("players");
        }
    }

    public class UniverseMeta {
        public string? Name { get; set; }
        public string? Creator { get; set; }
        public long CreatedAt { get; set; }
    }
}
