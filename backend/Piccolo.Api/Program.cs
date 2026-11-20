using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Piccolo.Api.Data;
using Piccolo.Api.Import;
using Piccolo.Api.Services;

if (args.Length >= 1 && args[0] == "import-catalog")
{
    return await CatalogImporter.RunAsync(args[1..]);
}

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Configure Entity Framework Core with SQLite
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=piccolo.db"));

// Register application services
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<PartnerService>();

// Register typed HttpClient for OpenFoodFactsService
builder.Services.AddHttpClient<OpenFoodFactsService>();

// Configure Clerk JWT authentication
var clerkAuthority = new[]
{
    builder.Configuration["Clerk:Authority"],
    Environment.GetEnvironmentVariable("CLERK_AUTHORITY"),
}.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        if (!string.IsNullOrWhiteSpace(clerkAuthority))
        {
            options.Authority = clerkAuthority;
        }
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = !string.IsNullOrWhiteSpace(clerkAuthority),
            ValidIssuer = clerkAuthority,
            ValidateAudience = false, // Clerk does not set an audience claim by default
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            // Clerk automatically exposes public signing keys via JWKS
        };
    });

builder.Services.AddAuthorization();

// Configure JSON serialization
builder.Services.ConfigureHttpJsonOptions(options =>
{
    // Serialize enums as kebab-case (e.g. SecondBreakfast -> "second-breakfast")
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower));
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
if (allowedOrigins == null || allowedOrigins.Length == 0)
{
    allowedOrigins = new[] { "http://localhost:3000", "http://localhost:3001" };
}

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials(); // Allow credentials (Clerk sessions)
    });
});

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// Register MVC controllers with cycle handling and kebab-case enum serialization
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower));
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Enable CORS
app.UseCors();

app.UseHttpsRedirection();

// Authentication and authorization must run before MapControllers
app.UseAuthentication();
app.UseAuthorization();

// Map API controllers
app.MapControllers();

app.Run();

return 0;

// Make the implicit Program class public so test projects can access it
public partial class Program { }
