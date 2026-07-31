# TISC Weather Screen

A static, GitHub Pages-ready weather dashboard for Toronto Island / CYTZ.

The dashboard defaults to Toronto Island Airport weather at `43.6285, -79.3962`.
Visitors can switch the forecast and radar to their own position with the browser
location button.

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

- Open-Meteo forecast API for current conditions and hourly forecast.
- Windy embedded radar map.
- Direct links to Nav Canada, NOAA CYTZ history, and Windy for manual verification.
