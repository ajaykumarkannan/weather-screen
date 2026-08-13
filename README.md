# TISC Weather Screen

A static, GitHub Pages-ready sailing weather dashboard for Toronto and customizable locations.

The dashboard defaults to Toronto Inner Harbour at `43.6350, -79.3750`.
Visitors can choose a Toronto sailing area, enter custom coordinates, or switch the
forecast and radar to their browser position. Sailing profiles and custom wind,
gust, and precipitation thresholds are saved locally. A configured setup can also
be shared by URL.

## Run locally

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## Publish on GitHub Pages

1. Push this directory to a GitHub repository.
2. In GitHub, open **Settings > Pages**.
3. Set the source to the repository branch and root folder.

No build step is required. The page uses relative local files and browser-fetches weather data from Open-Meteo.

## Data sources

- Open-Meteo forecast API for modelled current conditions and hourly forecast.
- Windy embedded radar map.
- Direct links to Nav Canada, NOAA CYTZ history, and Windy for manual verification.

Open-Meteo values are gridded model estimates rather than observations from a
harbour instrument. The Open/Watch/Hold assessment is calculated in the browser
using the selected sailing profile; forecast thunderstorms force a Hold result.
Always confirm warnings and local conditions before sailing.
