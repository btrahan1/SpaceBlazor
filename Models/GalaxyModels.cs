using System.Numerics;

namespace SpaceBlazor.Models
{
    // Simple serializable vector
    public class Vec3 
    {
        public float x { get; set; }
        public float y { get; set; }
        public float z { get; set; }

        public Vec3() {}
        public Vec3(float _x, float _y, float _z) { x = _x; y = _y; z = _z; }
    }

    public class StarSystem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; }
        public string Description { get; set; }
        public string SkyboxColor { get; set; } 
        public string SunColor { get; set; }
        
        public List<JumpGate> JumpGates { get; set; } = new();
        public List<Planet> Planets { get; set; } = new();
        public List<SpaceStation> Stations { get; set; } = new();

        public Vec3 Coordinates { get; set; }
    }

    public class JumpGate
    {
        public string TargetSystemId { get; set; }
        public string Name { get; set; }
        public Vec3 Position { get; set; }
    }

    public class Planet
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public Vec3 Position { get; set; }
        public float Size { get; set; }
    }

    public class SpaceStation
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; }
        public Vec3 Position { get; set; }
        public string Type { get; set; } // Outpost, Starbase, Mining Platform
        
        // Commodity Name -> Price
        public Dictionary<string, int> MarketData { get; set; } = new();

        // [NEW] Commodity Name -> Quantity
        public Dictionary<string, int> MarketQuantities { get; set; } = new();
    }

    public class Commodity
    {
        public string Name { get; set; }
        public int BasePrice { get; set; }
        public string Category { get; set; } // Ore, Tech, Fuel
    }
}
