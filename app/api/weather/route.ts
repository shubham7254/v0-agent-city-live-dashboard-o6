import { NextResponse } from "next/server"

// Michigan coordinates (Detroit area)
const LAT = 42.33
const LON = -83.05

// Map Open-Meteo WMO weather codes to our sim weather types
function mapWeatherCode(code: number): string {
  if (code <= 1) return "clear"
  if (code <= 3) return "clear" // partly cloudy -> clear
  if (code <= 48) return "fog"
  if (code <= 67) return "rain"
  if (code <= 77) return "rain" // snow -> rain for sim
  if (code <= 82) return "rain" // showers
  if (code <= 86) return "rain" // snow showers
  if (code >= 95) return "storm" // thunderstorm
  return "clear"
}

let cachedWeather: { weather: string; temp: number; description: string; fetchedAt: number } | null = null

export async function GET() {
  // Cache for 10 minutes
  if (cachedWeather && Date.now() - cachedWeather.fetchedAt < 600000) {
    return NextResponse.json(cachedWeather)
  }

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America/Detroit`,
      { next: { revalidate: 600 } }
    )

    if (!res.ok) throw new Error("Weather API error")

    const data = await res.json()
    const code = data.current?.weather_code ?? 0
    const temp = Math.round(data.current?.temperature_2m ?? 50)

    const descriptions: Record<string, string> = {
      clear: "Clear",
      fog: "Foggy",
      rain: "Rain",
      storm: "Thunderstorm",
      heat: "Hot",
    }

    const weather = mapWeatherCode(code)
    cachedWeather = {
      weather,
      temp,
      description: descriptions[weather] ?? "Clear",
      fetchedAt: Date.now(),
    }

    return NextResponse.json(cachedWeather)
  } catch {
    return NextResponse.json({ weather: "clear", temp: 50, description: "Clear", fetchedAt: Date.now() })
  }
}
