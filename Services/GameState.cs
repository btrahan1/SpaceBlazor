using System;

namespace SpaceBlazor.Services
{
    public class GameState
    {
        // Connectivity
        public event Action OnChange;

        // Player Stats
        public int Credits { get; private set; } = 1000;
        public int Hull { get; private set; } = 100;
        // Ship Data
        public string CurrentShipClassId { get; private set; } = "sidewinder";
        public Models.ShipClass CurrentShip => Models.ShipClass.Catalog.FirstOrDefault(s => s.Id == CurrentShipClassId);

        public int MaxHull { get; private set; } = 100;
        public int MaxFuel { get; private set; } = 50;
        public int CargoCapacity { get; private set; } = 20;
        public float SpeedMultiplier { get; private set; } = 1.0f;

        // Missing Members (Restoring)
        public int Shield { get; private set; } = 50;
        public int MaxShield { get; private set; } = 50;
        public int Fuel { get; private set; } = 50; // [FIX] Initial Fuel = MaxFuel (50)
        
        // Navigation
        public Queue<string> NavigationRoute { get; set; } = new();
        public bool IsAutoNavigating { get; set; } = false;

        // Location
        public string CurrentSystem { get; private set; } = "Sol";

        // Cargo
        public Dictionary<string, int> Cargo { get; private set; } = new();
        
        public void AddCargo(string item, int qty)
        {
            if (!Cargo.ContainsKey(item)) Cargo[item] = 0;
            Cargo[item] += qty;
            NotifyStateChanged();
        }

        public void RemoveCargo(string item, int qty)
        {
             if (Cargo.ContainsKey(item))
             {
                 Cargo[item] -= qty;
                 if (Cargo[item] <= 0) Cargo.Remove(item);
                 NotifyStateChanged();
             }
        }
        
        public int GetCargoCount() => Cargo.Values.Sum();

        public void Refuel(int amount)
        {
            Fuel += amount;
            if (Fuel > MaxFuel) Fuel = MaxFuel;
            NotifyStateChanged();
        }

        public void BuyShip(Models.ShipClass newShip)
        {
            CurrentShipClassId = newShip.Id;
            MaxHull = newShip.MaxHull;
            Hull = MaxHull; // Full Repair
            MaxFuel = newShip.MaxFuel;
            Fuel = MaxFuel; // Full Tank
            CargoCapacity = newShip.CargoCapacity;
            SpeedMultiplier = newShip.SpeedMultiplier;
            
            // Cargo Overflow Logic
            while (GetCargoCount() > CargoCapacity)
            {
                // Jettison random items until fit
                var item = Cargo.Keys.First();
                RemoveCargo(item, 1);
            }
            NotifyStateChanged();
        }

        public void Repair(int amount)
        {
            Hull += amount;
            if (Hull > MaxHull) Hull = MaxHull;
            NotifyStateChanged();
        }

        public void LoadState(SaveData data)
        {
            this.Credits = data.Credits;
            this.Hull = data.Hull;
            this.Fuel = data.Fuel;
            this.Cargo = new Dictionary<string, int>(data.Cargo);
            this.CurrentSystem = data.CurrentSystemId;

            // [FIX] Convert legacy saves or clamp values
            if (this.Hull > this.MaxHull) this.Hull = this.MaxHull;
            if (this.Fuel > this.MaxFuel) this.Fuel = this.MaxFuel;

            NotifyStateChanged();
        }

        public void ModifyCredits(int amount)
        {
            Credits += amount;
            NotifyStateChanged();
        }

        public void TakeDamage(int amount)
        {
            // Shield absorbs first
            if (Shield > 0)
            {
                Shield -= amount;
                if (Shield < 0)
                {
                    // Bleed through to hull
                    Hull += Shield; // Shield is negative here
                    Shield = 0;
                }
            }
            else
            {
                Hull -= amount;
            }

            if (Hull < 0) Hull = 0;
            NotifyStateChanged();
        }

        public void RechargeShield(int amount)
        {
            Shield += amount;
            if (Shield > MaxShield) Shield = MaxShield;
            NotifyStateChanged();
        }

        public void HasChanged() => NotifyStateChanged();

        private void NotifyStateChanged() => OnChange?.Invoke();
    }
}
