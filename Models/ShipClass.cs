
namespace SpaceBlazor.Models
{
    public class ShipClass
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public int Price { get; set; }
        
        // Stats
        public int MaxHull { get; set; }
        public int MaxFuel { get; set; }
        public int CargoCapacity { get; set; }
        public float SpeedMultiplier { get; set; }
        public int Hardpoints { get; set; }

        // Catalog
        public static List<ShipClass> Catalog = new()
        {
            new ShipClass 
            { 
                Id = "sidewinder", Name = "Sidewinder", Price = 1000, 
                MaxHull = 100, MaxFuel = 50, CargoCapacity = 20, SpeedMultiplier = 1.0f, Hardpoints = 2,
                Description = "Reliable multi-purpose starter ship."
            },
            new ShipClass 
            { 
                Id = "viper", Name = "Viper Mk III", Price = 15000, 
                MaxHull = 150, MaxFuel = 40, CargoCapacity = 10, SpeedMultiplier = 1.5f, Hardpoints = 4,
                Description = "Fast combat fighter. Limited cargo."
            },
            new ShipClass 
            { 
                Id = "hauler", Name = "Type-6 Hauler", Price = 25000, 
                MaxHull = 300, MaxFuel = 100, CargoCapacity = 100, SpeedMultiplier = 0.6f, Hardpoints = 1,
                Description = "Heavy freighter. Slow but profitable."
            },
            new ShipClass 
            { 
                Id = "cobra", Name = "Cobra Mk III", Price = 75000, 
                MaxHull = 200, MaxFuel = 80, CargoCapacity = 40, SpeedMultiplier = 1.2f, Hardpoints = 4,
                Description = "The ultimate privateer vessel."
            }
        };
    }
}
