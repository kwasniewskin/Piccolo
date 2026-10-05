using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Konfiguracja Entity Framework Core z SQLite
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=piccolo.db"));

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
                "http://192.168.100.5:3000"
            )
            .AllowAnyMethod()
            .AllowAnyHeader();
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

// Mapowanie kontrolerów
app.MapControllers();

app.Run();
