using System;

namespace SpaceBlazor.Services
{
    public class GameState
    {
        // Connectivity
        public event Action OnChange;

        // Multiplayer State
        private bool _isMultiplayerEnabled = false;
        public bool IsMultiplayerEnabled 
        { 
            get => _isMultiplayerEnabled; 
            set { _isMultiplayerEnabled = value; NotifyStateChanged(); } 
        }

        private string _universeId = "offline";
        public string UniverseId 
        { 
            get => _universeId; 
            set { _universeId = value; NotifyStateChanged(); } 
        }
        
        // Player Stats
        private string _callsign = "Pilot_" + new Random().Next(100, 999);
        public string Callsign 
        { 
            get => _callsign; 
            set { _callsign = value; NotifyStateChanged(); } 
        }
        public string SessionId { get; set; } = Guid.NewGuid().ToString().Substring(0, 8);
        public int Credits { get; private set; } = 50000;
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

        // [NEW] Sector Chat
        public List<ChatMessage> RecentMessages { get; set; } = new();

        public void AddMessage(ChatMessage msg)
        {
            if (!RecentMessages.Any(m => m.Timestamp == msg.Timestamp && m.Sender == msg.Sender))
            {
                RecentMessages.Add(msg);
                if (RecentMessages.Count > 50) RecentMessages.RemoveAt(0);
                NotifyStateChanged();
            }
        }

        public void LoadFromSaveData(SaveData data)
        {
            Credits = data.Credits;
            Fuel = data.Fuel;
            Hull = data.Hull;
            Cargo = new Dictionary<string, int>(data.Cargo);
            
            if (!string.IsNullOrEmpty(data.ShipClassId))
            {
                var ship = Models.ShipClass.Catalog.FirstOrDefault(s => s.Id == data.ShipClassId);
                if (ship != null)
                {
                    // Use BuyShip to re-calc max values but restore current values from save
                    BuyShip(ship);
                    Credits = data.Credits;
                    Fuel = data.Fuel;
                    Hull = data.Hull;
                }
            }
            
            if (!string.IsNullOrEmpty(data.ShipClassId))
            {
                var ship = Models.ShipClass.Catalog.FirstOrDefault(s => s.Id == data.ShipClassId);
                if (ship != null)
                {
                    // Use BuyShip to re-calc max values but restore current values from save
                    BuyShip(ship);
                    Credits = data.Credits;
                    Fuel = data.Fuel;
                    Hull = data.Hull;
                }
            }
            
            // [NEW] Restore Supporter Status
            IsSupporter = data.IsSupporter;
            
            NotifyStateChanged();
        }

        // [NEW] Supporter Status (Active Session)
        public bool IsSupporter { get; set; }

        // [NEW] Universe Directory
        public List<GlobalPilotProfile> UniversePlayers { get; set; } = new();

        public void HasChanged() => NotifyStateChanged();

        private void NotifyStateChanged() => OnChange?.Invoke();
    }

    public class GlobalPilotProfile
    {
        public string Callsign { get; set; } = "";
        public string ShipClassId { get; set; } = "";
        public string CurrentSystemId { get; set; } = "";
        public DateTime LastSeen { get; set; }
        public bool IsActive => (DateTime.UtcNow - LastSeen).TotalMinutes < 5;
        public bool IsSupporter { get; set; }
    }

    public class ChatMessage
    {
        public string Sender { get; set; }
        public string Text { get; set; }
        public long Timestamp { get; set; }
        public string SystemId { get; set; }
    }
}
