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
        public int MaxHull { get; private set; } = 100;
        public int Shield { get; private set; } = 50;
        public int MaxShield { get; private set; } = 50;
        public int Fuel { get; private set; } = 500;
        public int MaxFuel { get; private set; } = 500;

        // Navigation
        public Queue<string> NavigationRoute { get; set; } = new();
        public bool IsAutoNavigating { get; set; } = false;

        // Location
        public string CurrentSystem { get; private set; } = "Sol";

        // Cargo
        public Dictionary<string, int> Cargo { get; private set; } = new();
        public int CargoCapacity { get; private set; } = 50;

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

        public void Repair(int amount)
        {
            Hull += amount;
            if (Hull > MaxHull) Hull = MaxHull;
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
