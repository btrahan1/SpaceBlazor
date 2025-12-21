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

        // Location
        public string CurrentSystem { get; private set; } = "Sol";

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
