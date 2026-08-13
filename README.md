# TISC Weather Screen

A static, GitHub Pages-ready sailing weather dashboard for Toronto and customizable locations.

The dashboard defaults to Toronto Inner Harbour at `43.6350, -79.3750`.
Visitors can choose a Toronto sailing area, enter custom coordinates, or switch the
forecast and radar to their browser position. Sailing profiles and custom wind,
gust, and precipitation thresholds are saved locally. A configured setup can also
be shared by URL. Forecasts can be viewed over 6-hour, 12-hour, 24-hour, 3-day,
or 7-day ranges in one unified forecast chart. Hovering or tapping updates the
exact base wind, gust, direction, and precipitation values; direction arrows are
shown beneath every plotted forecast point. Open-Meteo Best Match remains the
default, with optional GEM, ECMWF, and GFS wind forecast views for comparison.

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

- Iowa Environmental Mesonet METAR/ASOS feeds for the nearest current wind observation.
- Open-Meteo forecast API for model fallback and hourly forecasts.
- Windy embedded radar map.
- Direct links to Nav Canada, NOAA CYTZ history, IEM, and Windy for manual verification.

A station observation is used for current wind when it is no more than 90 minutes
old; otherwise the dashboard clearly falls back to Open-Meteo's gridded model
estimate. CYTZ is preferred within 20 km of Toronto, while other locations search
for the nearest online METAR/ASOS station within 200 km. Airport winds may still
differ from harbour conditions. For Canadian stations, the dashboard offers a prominent
Nav Canada link and warns when the public station report is at least 30 minutes old.
The Open/Watch/Hold assessment is calculated in the browser using the selected sailing
profile; forecast thunderstorms force a Hold result.
Always confirm warnings and local conditions before sailing.
