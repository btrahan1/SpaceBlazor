using SpaceBlazor;
using SpaceBlazor.Layout;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using SpaceBlazor.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddScoped<GameState>();
builder.Services.AddScoped<GalaxyService>();
builder.Services.AddScoped<PersistenceService>();
builder.Services.AddScoped<FirebaseService>();

await builder.Build().RunAsync();
