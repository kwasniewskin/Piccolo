using System.Data.Common;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Piccolo.Api.Data;
using Piccolo.Api.Services;

namespace Piccolo.Api.Tests.Helpers;

/// <summary>
/// Custom WebApplicationFactory that configures the test environment:
/// - Uses SQLite in-memory database instead of file-based database
/// - Replaces JWT authentication with TestAuthHandler
/// - Replaces OpenFoodFactsService with mock to avoid external API calls
/// </summary>
public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private DbConnection? _connection;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // 1. Remove the existing DbContext configuration
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            
            if (descriptor != null)
            {
                services.Remove(descriptor);
            }

            // 2. Create and keep SQLite connection open for in-memory database
            _connection = new SqliteConnection("DataSource=:memory:");
            _connection.Open();

            // 3. Add SQLite in-memory database for tests with persistent connection
            services.AddDbContext<AppDbContext>(options =>
            {
                options.UseSqlite(_connection);
            });

            // 4. Replace OpenFoodFactsService with mock
            var offServiceDescriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(OpenFoodFactsService));
            if (offServiceDescriptor != null)
            {
                services.Remove(offServiceDescriptor);
            }
            
            // Add mock service that returns empty results
            services.AddScoped<OpenFoodFactsService>(sp => 
            {
                var httpClient = new HttpClient();
                var logger = sp.GetRequiredService<ILogger<OpenFoodFactsService>>();
                return new MockOpenFoodFactsService(httpClient, logger);
            });

            // 5. Replace JWT authentication with TestAuthHandler
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = TestAuthHandler.AuthenticationScheme;
                options.DefaultChallengeScheme = TestAuthHandler.AuthenticationScheme;
            })
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                TestAuthHandler.AuthenticationScheme, options => { });

            // 6. Ensure database is created
            var serviceProvider = services.BuildServiceProvider();
            using var scope = serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.EnsureCreated();
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _connection?.Close();
            _connection?.Dispose();
        }
        base.Dispose(disposing);
    }
}
