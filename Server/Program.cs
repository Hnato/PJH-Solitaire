using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(5330);
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowClient", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddRouting();

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var app = builder.Build();

var logger = app.Logger;

var exeDir = AppContext.BaseDirectory;
var clientPath = Path.Combine(exeDir, "Client");
var clientProvider = new PhysicalFileProvider(clientPath);

app.UseCors("AllowClient");

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        if (feature != null)
        {
            logger.LogError(feature.Error, "Unhandled exception");
        }

        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        var payload = new { message = "Błąd serwera" };
        await context.Response.WriteAsJsonAsync(payload);
    });
});

app.Use(async (context, next) =>
{
    var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    var host = context.Request.Host.Value;
    logger.LogInformation("Request {Method} {Path} from {RemoteIp} Host:{Host}", context.Request.Method, context.Request.Path, remoteIp, host);
    await next();
});

var defaultFiles = new DefaultFilesOptions
{
    FileProvider = clientProvider,
    RequestPath = ""
};
defaultFiles.DefaultFileNames.Clear();
defaultFiles.DefaultFileNames.Add("index.html");

app.UseDefaultFiles(defaultFiles);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = clientProvider,
    RequestPath = "",
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0";
        ctx.Context.Response.Headers.Pragma = "no-cache";
        ctx.Context.Response.Headers.Expires = "0";
    }
});

app.MapGet("/api/status", () =>
{
    var now = DateTime.UtcNow;
    return Results.Json(new
    {
        ok = true,
        timeUtc = now,
        message = "Serwer działa"
    });
});

app.MapGet("/api/random", () =>
{
    var value = Random.Shared.Next(1, 101);
    return Results.Json(new { value });
});

app.MapPost("/api/echo", async (Microsoft.AspNetCore.Http.HttpContext context) =>
{
    using var reader = new StreamReader(context.Request.Body);
    var body = await reader.ReadToEndAsync();
    Dictionary<string, object>? data = null;
    try
    {
        if (!string.IsNullOrWhiteSpace(body))
        {
            data = JsonSerializer.Deserialize<Dictionary<string, object>>(body);
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Nie udało się zdeserializować treści żądania");
    }

    return Results.Json(new
    {
        received = data,
        raw = body
    });
});

app.Run();
