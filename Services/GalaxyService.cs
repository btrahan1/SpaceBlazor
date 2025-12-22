using System.Numerics;
using SpaceBlazor.Models;

namespace SpaceBlazor.Services
{
    public class GalaxyService
    {
        public List<StarSystem> Systems { get; private set; } = new();
        public StarSystem CurrentSystem { get; private set; }

        public GalaxyService()
        {
            GenerateGalaxy();
        }

        public void GenerateGalaxy()
        {
            // Seeded random for consistent universe
            var rng = new Random(1337); 
            var systemNames = new[] { "Sol", "Alpha Centauri", "Sirius", "Vega", "Procyon", "Betelgeuse", "Rigel", "Deneb", "Altair", "Antares" };
            var prefixes = new[] { "Sigma", "Tau", "Omicron", "Theta", "Zeta" };

            // 1. Create Systems
            for (int i = 0; i < 50; i++)
            {
                var sys = new StarSystem();
                
                if (i < systemNames.Length)
                    sys.Name = systemNames[i];
                else
                    sys.Name = $"{prefixes[rng.Next(prefixes.Length)]}-{rng.Next(10, 99)}";

                sys.Description = "A generic star system in the void.";
                
                // Random 3D Coord for map (Scale 1000)
                sys.Coordinates = new Vec3(rng.Next(-1000, 1000), rng.Next(-100, 100), rng.Next(-1000, 1000));
                
                // Random Skybox Color (Dark Tints)
                var r = rng.Next(0, 50);
                var g = rng.Next(0, 30);
                var b = rng.Next(20, 80);
                sys.SkyboxColor = $"rgb({r},{g},{b})";

                // Planets (1-3 planets)
                int planetCount = rng.Next(1, 4);
                
                // Track where to put the Station (near Planet 0)
                Vec3 stationPos = null;

                for(int p=0; p<planetCount; p++)
                {
                    // Push planets WAY out (Outer System)
                    // Radius: 1000 - 3000
                    double angle = rng.NextDouble() * Math.PI * 2;
                    double radius = rng.Next(1000, 3000);
                    
                    float px = (float)(Math.Cos(angle) * radius);
                    float pz = (float)(Math.Sin(angle) * radius);
                    float py = rng.Next(-200, 200);

                    var planet = new Planet 
                    {
                        Name = $"{sys.Name} {ToRoman(p+1)}",
                        Type = rng.NextDouble() > 0.5 ? "Gas Giant" : "Rocky",
                        Position = new Vec3(px, py, pz),
                        Size = rng.Next(100, 400) // Huge distant worlds
                    };
                    sys.Planets.Add(planet);

                    // Place station near the first planet (offset by 500 units so it's not inside it)
                    if (p == 0)
                    {
                        stationPos = new Vec3(px + 300, py + 50, pz + 300);
                    }
                }

                // Create Station
                if (stationPos == null) stationPos = new Vec3(1000, 0, 1000); // Fallback

                var station = new SpaceStation
                {
                    Name = $"{sys.Name} Outpost",
                    Type = rng.NextDouble() > 0.5 ? "Trading Post" : "Mining Array",
                    Position = stationPos
                };
                GenerateMarket(station, rng); // [NEW] Generate Prices
                sys.Stations.Add(station);

                // [NEW] Spawn Shipyard (distinct location, near last planet or far out)
                var shipyardPos = new Vec3(stationPos.x * -1, stationPos.y + 200, stationPos.z * -1); // Opposite side
                if (planetCount > 1)
                {
                    // If multiple planets, put shipyard near the last one
                    var lastP = sys.Planets.Last();
                    shipyardPos = new Vec3(lastP.Position.x - 300, lastP.Position.y - 50, lastP.Position.z - 300);
                }

                var shipyard = new SpaceStation
                {
                    Name = $"{sys.Name} Shipyards",
                    Type = "Shipyard",
                    Position = shipyardPos
                };
                
                // [FIX] Shipyards do NOT sell commodities.
                // GenerateMarket(shipyard, rng); 
                sys.Stations.Add(shipyard);

                Systems.Add(sys);
            }

            // 2. Link Systems (Linear Chain + Random Loops)
            // This ensures System 0 connects to System 1, 1 to 2, etc. (Guaranteed reachability)
            for (int i = 0; i < Systems.Count - 1; i++)
            {
                ConnectSystems(Systems[i], Systems[i+1], rng);
            }
            
            // FIX: Force Sol's first gate to be visible
            if (Systems[0].JumpGates.Any())
            {
                Systems[0].JumpGates[0].Position = new Vec3(0, 0, 200); // 200 units ahead
            }

            // 3. Add Random Shortcuts (Wormholes)
            for (int i = 0; i < 20; i++)
            {
                var a = Systems[rng.Next(Systems.Count)];
                var b = Systems[rng.Next(Systems.Count)];
                if (a != b) ConnectSystems(a, b, rng);
            }

            // Start at Sol (or first system)
            CurrentSystem = Systems[0];
        }

        private void ConnectSystems(StarSystem a, StarSystem b, Random rng)
        {
            // Avoid duplicates
            if (a.JumpGates.Any(g => g.TargetSystemId == b.Id)) return;

            // Gate Position (Inner System: 200 - 600)
            // Ensure they don't spawn on top of the Sun (0-100)
            var dist = rng.Next(200, 600);
            var angle = rng.NextDouble() * Math.PI * 2;
            var gx = (float)(Math.Cos(angle) * dist);
            var gz = (float)(Math.Sin(angle) * dist);
            var gy = rng.Next(-50, 50);

            a.JumpGates.Add(new JumpGate { TargetSystemId = b.Id, Name = $"Gate to {b.Name}", Position = new Vec3(gx, gy, gz) });
            
            // Generate distinct position for return gate
            dist = rng.Next(200, 600);
            angle = rng.NextDouble() * Math.PI * 2;
            gx = (float)(Math.Cos(angle) * dist);
            gz = (float)(Math.Sin(angle) * dist);
            gy = rng.Next(-50, 50);

            b.JumpGates.Add(new JumpGate { TargetSystemId = a.Id, Name = $"Gate to {a.Name}", Position = new Vec3(gx, gy, gz) });
        }

        private string ToRoman(int number)
        {
            if (number == 1) return "I";
            if (number == 2) return "II";
            if (number == 3) return "III";
            return "IV";
        }

        public void JumpTo(string systemId)
        {
            var target = Systems.FirstOrDefault(s => s.Id == systemId);
            if (target != null)
            {
                CurrentSystem = target;
            }
        }

        private void GenerateMarket(SpaceStation station, Random rng)
        {
            foreach (var com in Commodities)
            {
                // Base Price +/- 50%
                var variance = rng.NextDouble() * 0.5 - 0.25; // -25% to +25%
                var price = (int)(com.BasePrice * (1 + variance));
                if (price < 1) price = 1;

                // Type Modifiers
                if (station.Type == "Mining Array")
                {
                    if (com.Category == "Ore") price = (int)(price * 0.5); // Supply: Cheap
                    if (com.Category == "Tech" || com.Category == "Fuel") price = (int)(price * 1.5); // Demand: High
                }
                
                if (station.Type == "Trading Post")
                {
                    if (com.Category == "Tech") price = (int)(price * 0.6); // Supply: Cheap
                    if (com.Category == "Ore") price = (int)(price * 1.5); // Demand: High
                }

                station.MarketData[com.Name] = price;
            }
        }

        public static List<Commodity> Commodities = new()
        {
            new Commodity { Name = "Iron Ore", BasePrice = 20, Category = "Ore" },
            new Commodity { Name = "Gold", BasePrice = 200, Category = "Ore" },
            new Commodity { Name = "Hydrogen Fuel", BasePrice = 10, Category = "Fuel" },
            new Commodity { Name = "Water", BasePrice = 5, Category = "Essentials" },
            new Commodity { Name = "Electronics", BasePrice = 150, Category = "Tech" },
            new Commodity { Name = "Medical Supplies", BasePrice = 300, Category = "Tech" }
        };

        public List<string> GetRoute(string startId, string endId)
        {
            if (startId == endId) return new List<string>();

            // BFS
            var queue = new Queue<List<string>>();
            queue.Enqueue(new List<string> { startId });
            var visited = new HashSet<string> { startId };

            while (queue.Count > 0)
            {
                var path = queue.Dequeue();
                var currentId = path.Last();

                if (currentId == endId) return path;

                var sys = Systems.FirstOrDefault(s => s.Id == currentId);
                if (sys == null) continue;

                foreach (var gate in sys.JumpGates)
                {
                    if (!visited.Contains(gate.TargetSystemId))
                    {
                        visited.Add(gate.TargetSystemId);
                        var newPath = new List<string>(path) { gate.TargetSystemId };
                        queue.Enqueue(newPath);
                    }
                }
            }

            return new List<string>(); // No path found
        }
    }
}
