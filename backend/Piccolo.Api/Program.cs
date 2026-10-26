using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Piccolo.Api.Data;
using Piccolo.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Konfiguracja Entity Framework Core z SQLite
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=piccolo.db"));

// Rejestracja serwisów
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<UserService>();

// Rejestracja HttpClient dla OpenFoodFactsService
builder.Services.AddHttpClient<OpenFoodFactsService>();

// Konfiguracja Clerk JWT Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://precious-perch-8876.clerk.accounts.dev";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "https://precious-perch-8876.clerk.accounts.dev",
            ValidateAudience = false, // Clerk nie używa audience claim
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            // Clerk automatycznie pobiera klucze publiczne z JWKS endpoint
        };
    });

builder.Services.AddAuthorization();

// Konfiguracja JSON serialization
builder.Services.ConfigureHttpJsonOptions(options =>
{
    // Konwersja enum do kebab-case (np. SecondBreakfast -> "second-breakfast")
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower));
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

// Konfiguracja CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",
                "http://localhost:3001",
                "http://192.168.100.5:3000",
                "http://192.168.100.5:3001"
            )
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();  // Umożliwia wysyłanie credentials (sesje Clerk)
    });
});

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// Rejestracja kontrolerów z obsługą cyklicznych referencji i enum w kebab-case
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

// Włączenie CORS
app.UseCors();

app.UseHttpsRedirection();

// WAŻNE: Autentykacja i autoryzacja muszą być przed MapControllers
app.UseAuthentication();
app.UseAuthorization();

// Mapowanie kontrolerów
app.MapControllers();

app.Run();
