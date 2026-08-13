const LOCATIONS = {
  "inner-harbour": { name: "Toronto Inner Harbour", latitude: 43.6350, longitude: -79.3750, timezone: "America/Toronto" },
  "outer-harbour": { name: "Toronto Outer Harbour", latitude: 43.6260, longitude: -79.3350, timezone: "America/Toronto" },
  "humber-bay": { name: "Humber Bay", latitude: 43.6200, longitude: -79.4750, timezone: "America/Toronto" },
  "ashbridges-bay": { name: "Ashbridges Bay", latitude: 43.6580, longitude: -79.3150, timezone: "America/Toronto" },
};

const PROFILES = {
  beginner: { name: "Beginner / dinghy", minimumWind: 4, cautionWind: 11, maximumWind: 15, cautionGust: 15, maximumGust: 20, cautionRain: 35, maximumRain: 65 },
  intermediate: { name: "Intermediate / dinghy", minimumWind: 4, cautionWind: 14, maximumWind: 18, cautionGust: 18, maximumGust: 24, cautionRain: 35, maximumRain: 65 },
  keelboat: { name: "Keelboat", minimumWind: 3, cautionWind: 18, maximumWind: 24, cautionGust: 24, maximumGust: 30, cautionRain: 45, maximumRain: 70 },
};

const FORECAST_MODELS = {
  best_match: { name: "Best Match" },
  gem_seamless: { name: "GEM" },
  ecmwf_ifs025: { name: "ECMWF" },
  gfs_seamless: { name: "GFS" },
};

const CONFIG = {
  defaultLocation: { ...LOCATIONS["inner-harbour"], preset: "inner-harbour", isUserLocation: false },
  defaultProfile: { ...PROFILES.intermediate, preset: "intermediate" },
  refreshMs: 10 * 60 * 1000,
  storageKey: "sailing-weather-setup-v1",
};

const state = {
  location: { ...CONFIG.defaultLocation },
  profile: { ...CONFIG.defaultProfile },
  forecastHours: 12,
  forecastModel: "best_match",
  lastData: null,
  modelData: null,
  observation: null,
  observationStation: null,
  lastUpdated: null,
  requestId: 0,
};

let observationNetworksPromise;
const observationStationCache = new Map();

const el = {
  locationLabel: document.querySelector("#location-label"),
  clock: document.querySelector("#clock"),
  refreshState: document.querySelector("#refresh-state"),
  useLocation: document.querySelector("#use-location"),
  settingsToggle: document.querySelector("#settings-toggle"),
  settingsPanel: document.querySelector("#sailing-settings"),
  settingsForm: document.querySelector("#settings-form"),
  locationPreset: document.querySelector("#location-preset"),
  customLocationName: document.querySelector("#custom-location-name"),
  customLatitude: document.querySelector("#custom-latitude"),
  customLongitude: document.querySelector("#custom-longitude"),
  profilePreset: document.querySelector("#profile-preset"),
  minimumWind: document.querySelector("#minimum-wind"),
  cautionWind: document.querySelector("#caution-wind"),
  maximumWind: document.querySelector("#maximum-wind"),
  cautionGust: document.querySelector("#caution-gust"),
  maximumGust: document.querySelector("#maximum-gust"),
  cautionRain: document.querySelector("#caution-rain"),
  maximumRain: document.querySelector("#maximum-rain"),
  shareSetup: document.querySelector("#share-setup"),
  settingsMessage: document.querySelector("#settings-message"),
  profileLabel: document.querySelector("#profile-label"),
  forecastRange: document.querySelector("#forecast-range"),
  forecastModel: document.querySelector("#forecast-model"),
  forecastPeriodLabel: document.querySelector("#forecast-period-label"),
  conditionLabel: document.querySelector("#condition-label"),
  currentSourceLabel: document.querySelector("#current-source-label"),
  currentStation: document.querySelector("#current-station"),
  observationAge: document.querySelector("#observation-age"),
  observationWarning: document.querySelector("#observation-warning"),
  navCanadaLive: document.querySelector("#navcanada-live"),
  statusPill: document.querySelector("#status-pill"),
  currentWind: document.querySelector("#current-wind"),
  currentGust: document.querySelector("#current-gust"),
  directionArrow: document.querySelector("#direction-arrow"),
  directionLabel: document.querySelector("#direction-label"),
  decisionCopy: document.querySelector("#decision-copy"),
  currentTemp: document.querySelector("#current-temp"),
  currentRain: document.querySelector("#current-rain"),
  peakNext: document.querySelector("#peak-next"),
  gustFactor: document.querySelector("#gust-factor"),
  updatedAt: document.querySelector("#updated-at"),
  detailTime: document.querySelector("#detail-time"),
  detailModel: document.querySelector("#detail-model"),
  detailWind: document.querySelector("#detail-wind"),
  detailGust: document.querySelector("#detail-gust"),
  detailDirection: document.querySelector("#detail-direction"),
  detailRain: document.querySelector("#detail-rain"),
  chart: document.querySelector("#wind-chart"),
  radarFrame: document.querySelector("#radar-frame"),
  sourceList: document.querySelector("#source-list"),
  windyMapLink: document.querySelector("#windy-map-link"),
  errorToast: document.querySelector("#error-toast"),
};

function forecastUrl() {
  const params = new URLSearchParams({
    latitude: state.location.latitude,
    longitude: state.location.longitude,
    current: [
      "temperature_2m",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "precipitation",
      "weather_code",
    ].join(","),
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "weather_code",
    ].join(","),
    wind_speed_unit: "kn",
    timezone: state.location.timezone,
    forecast_days: "8",
  });

  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

function modelForecastUrl() {
  const params = new URLSearchParams({
    latitude: state.location.latitude,
    longitude: state.location.longitude,
    hourly: ["wind_speed_10m", "wind_gusts_10m", "wind_direction_10m"].join(","),
    models: Object.keys(FORECAST_MODELS).filter((model) => model !== "best_match").join(","),
    wind_speed_unit: "kn",
    timezone: state.location.timezone,
    forecast_days: "8",
  });

  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

function selectedForecastData() {
  if (state.forecastModel === "best_match" || !state.modelData) return state.lastData;
  const model = state.forecastModel;
  const bestHourly = state.lastData.hourly;
  return {
    ...state.lastData,
    hourly: {
      ...bestHourly,
      time: state.modelData.hourly.time,
      wind_speed_10m: state.modelData.hourly[`wind_speed_10m_${model}`],
      wind_gusts_10m: state.modelData.hourly[`wind_gusts_10m_${model}`],
      wind_direction_10m: state.modelData.hourly[`wind_direction_10m_${model}`],
    },
  };
}

function distanceKm(a, b) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.longitude - a.longitude);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function geometryBounds(feature) {
  const points = feature.geometry?.coordinates?.flat(2) || [];
  const longitudes = [];
  const latitudes = [];
  for (let index = 0; index < points.length; index += 2) {
    longitudes.push(Number(points[index]));
    latitudes.push(Number(points[index + 1]));
  }
  if (!longitudes.length) return null;
  return {
    west: Math.min(...longitudes), east: Math.max(...longitudes),
    south: Math.min(...latitudes), north: Math.max(...latitudes),
  };
}

async function nearestObservationStation() {
  const cacheKey = `${state.location.latitude.toFixed(2)},${state.location.longitude.toFixed(2)}`;
  if (observationStationCache.has(cacheKey)) return observationStationCache.get(cacheKey);

  const cytz = { id: "CYTZ", network: "CA_ON_ASOS", name: "Toronto City Centre / CYTZ", latitude: 43.62861, longitude: -79.395 };
  if (distanceKm(state.location, cytz) <= 20) {
    const station = { ...cytz, distance: distanceKm(state.location, cytz) };
    observationStationCache.set(cacheKey, station);
    return station;
  }

  observationNetworksPromise ||= fetch("https://mesonet.agron.iastate.edu/geojson/networks.py")
    .then((response) => {
      if (!response.ok) throw new Error(`Station network request failed: ${response.status}`);
      return response.json();
    });
  const networks = await observationNetworksPromise;
  const candidates = networks.features
    .filter((feature) => feature.id.endsWith("_ASOS"))
    .map((feature) => ({ feature, bounds: geometryBounds(feature) }))
    .filter(({ bounds }) => bounds
      && state.location.longitude >= bounds.west && state.location.longitude <= bounds.east
      && state.location.latitude >= bounds.south && state.location.latitude <= bounds.north)
    .sort((a, b) => ((a.bounds.east - a.bounds.west) * (a.bounds.north - a.bounds.south))
      - ((b.bounds.east - b.bounds.west) * (b.bounds.north - b.bounds.south)));
  if (!candidates.length) return null;

  const network = candidates[0].feature.id;
  const response = await fetch(`https://mesonet.agron.iastate.edu/geojson/network.py?network=${encodeURIComponent(network)}`);
  if (!response.ok) throw new Error(`Station list request failed: ${response.status}`);
  const stations = await response.json();
  const nearest = stations.features
    .filter((feature) => feature.properties?.online !== false && feature.geometry?.coordinates)
    .map((feature) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      return {
        id: feature.id,
        network,
        name: feature.properties.sname || feature.id,
        latitude,
        longitude,
        distance: distanceKm(state.location, { latitude, longitude }),
      };
    })
    .sort((a, b) => a.distance - b.distance)[0];
  const station = nearest?.distance <= 200 ? nearest : null;
  observationStationCache.set(cacheKey, station);
  return station;
}

async function fetchObservedWind() {
  try {
    const station = await nearestObservationStation();
    if (!station) return null;
    const params = new URLSearchParams({ station: station.id, network: station.network });
    const response = await fetch(`https://mesonet.agron.iastate.edu/api/1/currents.json?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Observation request failed: ${response.status}`);
    const result = await response.json();
    const row = result.data?.[0];
    if (!row || row.sknt === null || row.drct === null || !row.utc_valid) return null;
    return {
      station,
      time: row.utc_valid,
      wind: Number(row.sknt),
      gust: row.gust === null ? Number(row.sknt) : Number(row.gust),
      direction: Number(row.drct),
      temperature: row.tmpf === null ? null : (Number(row.tmpf) - 32) * 5 / 9,
      raw: row.raw,
    };
  } catch (error) {
    console.info("Observed wind is unavailable; using the model estimate.", error);
    return null;
  }
}

function windyEmbedUrl() {
  const params = new URLSearchParams({
    type: "map",
    location: "coordinates",
    metricRain: "mm",
    metricTemp: "°C",
    metricWind: "kt",
    zoom: state.location.isUserLocation ? "9" : "10",
    overlay: "radar",
    product: "radar",
    level: "surface",
    lat: state.location.latitude.toFixed(3),
    lon: state.location.longitude.toFixed(3),
    message: "true",
  });

  return `https://embed.windy.com/embed.html?${params}`;
}

function windyMapUrl() {
  return `https://www.windy.com/?${state.location.latitude.toFixed(3)},${state.location.longitude.toFixed(3)},8`;
}

function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || CONFIG.defaultLocation.timezone;
}

function tickClock() {
  const now = new Date();
  el.clock.textContent = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function fmtTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtCoords(location) {
  return `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function directionName(deg) {
  if (deg === null || deg === undefined || Number.isNaN(Number(deg))) return "---";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(Number(deg) / 22.5) % 16];
}

function classifyConditions(wind, gust, rainProbability, thunderRisk = false) {
  const p = state.profile;
  const holdReasons = [];
  const watchReasons = [];

  if (thunderRisk) holdReasons.push("thunderstorms are forecast");
  if (gust >= p.maximumGust) holdReasons.push(`gusts reach ${fmtNumber(gust)} kt (limit ${p.maximumGust})`);
  if (wind >= p.maximumWind) holdReasons.push(`wind reaches ${fmtNumber(wind)} kt (limit ${p.maximumWind})`);
  if (rainProbability >= p.maximumRain) holdReasons.push(`precipitation chance reaches ${fmtNumber(rainProbability)}%`);

  if (holdReasons.length) {
    return {
      className: "is-hold",
      label: "Hold",
      title: "Outside your limits",
      copy: `Hold: ${holdReasons.join("; ")}. This is model guidance—confirm warnings and local conditions.`,
    };
  }

  if (gust >= p.cautionGust) watchReasons.push(`gusts reach ${fmtNumber(gust)} kt`);
  if (wind >= p.cautionWind) watchReasons.push(`wind reaches ${fmtNumber(wind)} kt`);
  if (wind < p.minimumWind) watchReasons.push(`wind is below your ${p.minimumWind} kt minimum`);
  if (rainProbability >= p.cautionRain) watchReasons.push(`precipitation chance reaches ${fmtNumber(rainProbability)}%`);

  if (watchReasons.length) {
    return {
      className: "is-watch",
      label: "Watch",
      title: "Near your limits",
      copy: `Watch: ${watchReasons.join("; ")}. Confirm conditions locally before launching.`,
    };
  }

  return {
    className: "is-good",
    label: "Open",
    title: "Within your limits",
    copy: `The next six hours remain inside the ${p.name} profile. Confirm conditions locally before launching.`,
  };
}

function nextHours(data, count) {
  const now = Date.now();
  const rows = data.hourly.time.map((time, index) => ({
    time,
    date: new Date(time),
    temp: data.hourly.temperature_2m[index],
    rain: data.hourly.precipitation_probability[index],
    wind: data.hourly.wind_speed_10m[index],
    gust: data.hourly.wind_gusts_10m[index],
    direction: data.hourly.wind_direction_10m[index],
    weatherCode: data.hourly.weather_code[index],
  }));

  const firstFuture = rows.findIndex((row) => row.date.getTime() >= now - 30 * 60 * 1000);
  return rows.slice(Math.max(0, firstFuture), Math.max(0, firstFuture) + count);
}

function renderCurrent(data) {
  const current = data.current;
  const observation = state.observation;
  const observationAgeMinutes = observation ? Math.max(0, (Date.now() - new Date(observation.time).getTime()) / 60000) : Infinity;
  const hasFreshObservation = observation && observationAgeMinutes <= 90;
  const displayed = hasFreshObservation ? {
    wind: observation.wind,
    gust: observation.gust,
    direction: observation.direction,
    temperature: observation.temperature ?? current.temperature_2m,
    time: observation.time,
  } : {
    wind: current.wind_speed_10m,
    gust: current.wind_gusts_10m,
    direction: current.wind_direction_10m,
    temperature: current.temperature_2m,
    time: current.time,
  };
  const hours = nextHours(data, 12);
  const nextSix = hours.slice(0, 6);
  const peakGust = Math.max(displayed.gust, ...nextSix.map((hour) => Number(hour.gust) || 0));
  const peakWind = Math.max(displayed.wind, ...nextSix.map((hour) => Number(hour.wind) || 0));
  const maxRain = Math.max(...nextSix.map((hour) => Number(hour.rain) || 0));
  const thunderRisk = nextSix.some((hour) => Number(hour.weatherCode) >= 95);
  const condition = classifyConditions(peakWind, peakGust, maxRain, thunderRisk);

  el.conditionLabel.textContent = condition.title;
  el.statusPill.textContent = condition.label;
  el.statusPill.className = `status-pill ${condition.className}`;
  el.currentWind.textContent = fmtNumber(displayed.wind);
  el.currentGust.textContent = fmtNumber(displayed.gust);
  el.directionLabel.textContent = directionName(displayed.direction);
  el.directionArrow.style.transform = `rotate(${(Number(displayed.direction) + 180) % 360}deg)`;
  el.decisionCopy.textContent = condition.copy;
  el.currentTemp.innerHTML = `${fmtNumber(displayed.temperature, 1)}&deg;C`;
  el.currentRain.textContent = `${fmtNumber(current.precipitation, 1)} mm`;
  el.peakNext.textContent = `${fmtNumber(peakWind)}-${fmtNumber(peakGust)} kt`;
  el.gustFactor.textContent = Number(displayed.wind) > 0 ? `${(Number(displayed.gust) / Number(displayed.wind)).toFixed(1)}×` : "--";
  el.updatedAt.textContent = fmtTime(displayed.time);
  el.profileLabel.textContent = state.profile.name;

  if (hasFreshObservation) {
    el.currentSourceLabel.textContent = "Latest station observation";
    el.currentStation.textContent = `${observation.station.id} · ${observation.station.distance.toFixed(1)} km`;
    el.observationAge.textContent = observationAgeMinutes < 1 ? "Just now" : `${Math.round(observationAgeMinutes)} min`;
  } else {
    el.currentSourceLabel.textContent = "Modelled current wind";
    el.currentStation.textContent = observation ? `${observation.station.id} · stale` : "No station observation";
    el.observationAge.textContent = observation ? `${Math.round(observationAgeMinutes)} min · stale` : "Unavailable";
  }

  const station = observation?.station;
  const supportsNavCanada = station?.network?.startsWith("CA_") && /^C[A-Z0-9]{3}$/.test(station.id);
  el.navCanadaLive.hidden = !supportsNavCanada;
  if (supportsNavCanada) {
    const navCanadaUrl = `https://spaces.navcanada.ca/workspace/aeroview/${encodeURIComponent(station.id)}`;
    el.navCanadaLive.href = navCanadaUrl;
    el.navCanadaLive.textContent = `Check live ${station.id} ↗`;
    const shouldWarn = observationAgeMinutes >= 30;
    el.observationWarning.hidden = !shouldWarn;
    if (shouldWarn) {
      const link = document.createElement("a");
      link.href = navCanadaUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `Check ${station.id} on Nav Canada ↗`;
      el.observationWarning.replaceChildren(
        `The public ${station.id} report is ${Math.round(observationAgeMinutes)} minutes old and Nav Canada may have a newer observation. `,
        link
      );
    }
  } else {
    el.observationWarning.hidden = true;
    el.observationWarning.replaceChildren();
  }
}

function forecastRangeLabel() {
  if (state.forecastHours === 72) return "Next 3 days";
  if (state.forecastHours === 168) return "Next 7 days";
  return `Next ${state.forecastHours} hours`;
}

function fmtForecastTime(value) {
  const options = state.forecastHours > 24
    ? { weekday: "short", hour: "numeric" }
    : { hour: "numeric", minute: "2-digit" };
  return new Date(value).toLocaleString([], options);
}

function renderForecast() {
  el.forecastPeriodLabel.textContent = forecastRangeLabel();
}

function updateForecastDetail(row) {
  if (!row) return;
  el.detailTime.textContent = fmtForecastTime(row.time);
  el.detailModel.textContent = FORECAST_MODELS[state.forecastModel].name;
  el.detailWind.textContent = `${fmtNumber(row.wind)} kt`;
  el.detailGust.textContent = `${fmtNumber(row.gust)} kt`;
  el.detailDirection.textContent = `${directionName(row.direction)} · ${fmtNumber(row.direction)}°`;
  el.detailRain.textContent = `${fmtNumber(row.rain)}%`;
}

function pathFor(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function renderChart(data) {
  const allRows = nextHours(data, state.forecastHours);
  const sampleEvery = state.forecastHours <= 24 ? 1 : state.forecastHours <= 72 ? 3 : 6;
  const rows = allRows.filter((row, index) => index % sampleEvery === 0 || index === allRows.length - 1);
  const width = 900;
  const height = 275;
  const padding = { top: 16, right: 22, bottom: 60, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(state.profile.cautionGust + 3, ...rows.map((row) => (Number(row.gust) || 0) + 3));
  const scaleX = (index) => padding.left + (index / Math.max(1, rows.length - 1)) * chartWidth;
  const scaleY = (value) => padding.top + chartHeight - (Number(value) / maxValue) * chartHeight;
  const windPoints = rows.map((row, index) => ({ x: scaleX(index), y: scaleY(row.wind) }));
  const gustPoints = rows.map((row, index) => ({ x: scaleX(index), y: scaleY(row.gust) }));
  const yTicks = [0, 4, 8, 12, 16, 20, 24, 28, 32].filter((tick) => tick <= maxValue);

  el.chart.replaceChildren();
  updateForecastDetail(rows[0]);

  const ns = "http://www.w3.org/2000/svg";
  const make = (tag, attrs = {}) => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  el.chart.append(
    make("rect", {
      class: "caution-band",
      x: padding.left,
      y: padding.top,
      width: chartWidth,
      height: Math.max(0, scaleY(state.profile.cautionGust) - padding.top),
      rx: 6,
    })
  );

  yTicks.forEach((tick) => {
    const y = scaleY(tick);
    el.chart.append(make("line", {
      class: "grid-line",
      x1: padding.left,
      x2: width - padding.right,
      y1: y,
      y2: y,
    }));
    const label = make("text", {
      class: "axis-label",
      x: 12,
      y: y + 4,
    });
    label.textContent = `${tick}`;
    el.chart.append(label);
  });

  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
  rows.forEach((row, index) => {
    if (index % labelEvery !== 0) return;
    const label = make("text", {
      class: "axis-label chart-time-label",
      x: scaleX(index),
      y: height - 13,
      "text-anchor": "middle",
    });
    label.textContent = fmtForecastTime(row.time).replace(":00", "");
    el.chart.append(label);
  });

  rows.forEach((row, index) => {
    const x = scaleX(index);
    const directionY = padding.top + chartHeight + 27;
    const arrow = make("text", {
      class: "chart-direction-arrow",
      x,
      y: directionY,
      "text-anchor": "middle",
      transform: `rotate(${((Number(row.direction) || 0) + 180) % 360} ${x} ${directionY - 5})`,
    });
    arrow.textContent = "↑";
    const title = make("title");
    title.textContent = `${fmtForecastTime(row.time)}: wind from ${directionName(row.direction)} (${fmtNumber(row.direction)}°); arrow shows where it is blowing`;
    arrow.append(title);
    el.chart.append(arrow);
  });

  el.chart.append(
    make("path", { class: "wind-line", d: pathFor(windPoints) }),
    make("path", { class: "gust-line", d: pathFor(gustPoints) })
  );
  windPoints.forEach((point) => el.chart.append(make("circle", { class: "chart-point wind-point", cx: point.x, cy: point.y, r: 3 })));
  gustPoints.forEach((point) => el.chart.append(make("circle", { class: "chart-point gust-point", cx: point.x, cy: point.y, r: 3 })));

  const hoverGroup = make("g");
  hoverGroup.style.display = "none";
  const hoverLine = make("line", { class: "chart-hover-line", y1: padding.top, y2: padding.top + chartHeight });
  const windDot = make("circle", { class: "chart-hover-dot wind-dot", r: 6 });
  const gustDot = make("circle", { class: "chart-hover-dot gust-dot", r: 6 });
  hoverGroup.append(hoverLine, windDot, gustDot);

  const hitArea = make("rect", {
    class: "chart-hit-area",
    x: padding.left,
    y: padding.top,
    width: chartWidth,
    height: chartHeight,
  });

  hitArea.addEventListener("pointermove", (event) => {
    const bounds = el.chart.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(((pointerX - padding.left) / chartWidth) * (rows.length - 1))));
    const row = rows[index];
    const x = scaleX(index);
    const windY = scaleY(row.wind);
    const gustY = scaleY(row.gust);
    hoverLine.setAttribute("x1", x);
    hoverLine.setAttribute("x2", x);
    windDot.setAttribute("cx", x);
    windDot.setAttribute("cy", windY);
    gustDot.setAttribute("cx", x);
    gustDot.setAttribute("cy", gustY);
    updateForecastDetail(row);
    hoverGroup.style.display = "block";
  });
  hitArea.addEventListener("pointerleave", () => { hoverGroup.style.display = "none"; });
  el.chart.append(hoverGroup, hitArea);
}

function renderSources(data) {
  const generated = state.lastUpdated ? state.lastUpdated.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  }) : "--";
  const observation = state.observation;
  const observationAge = observation ? Math.max(0, Math.round((Date.now() - new Date(observation.time).getTime()) / 60000)) : null;
  const observationSummary = observation
    ? `${escapeHtml(observation.station.id)} · ${observation.station.distance.toFixed(1)} km · ${observationAge} min old`
    : "Unavailable · model fallback";

  el.sourceList.innerHTML = `
    <li><span>Latest station observation</span><strong>${observationSummary}</strong></li>
    <li><span>Observation provider</span><strong>Iowa Environmental Mesonet / METAR</strong></li>
    <li><span>Open-Meteo model forecast</span><strong>Fetched ${generated}</strong></li>
    <li><span>Displayed model</span><strong>${FORECAST_MODELS[state.forecastModel].name}</strong></li>
    <li><span>Sailing profile</span><strong>${escapeHtml(state.profile.name)}</strong></li>
    <li><span>Location</span><strong>${escapeHtml(state.location.name)}</strong></li>
    <li><span>Coordinates</span><strong>${fmtCoords(state.location)}</strong></li>
    <li><span>Model current time</span><strong>${fmtTime(data.current.time)}</strong></li>
    <li><span>Windy radar</span><strong>Embedded live map</strong></li>
    <li><span>Auto refresh</span><strong>Every 10 min</strong></li>
  `;
}

function updateLocationUI() {
  el.locationLabel.textContent = state.location.name;
  el.useLocation.textContent = state.location.isUserLocation ? "Using your location" : "Use my location";
  el.radarFrame.src = windyEmbedUrl();
  el.radarFrame.title = `Windy radar near ${state.location.name}`;
  el.windyMapLink.href = windyMapUrl();
}

function showError(message) {
  el.errorToast.hidden = false;
  el.errorToast.textContent = message;
  el.refreshState.textContent = "Weather unavailable";
  el.statusPill.textContent = "Error";
  el.statusPill.className = "status-pill is-error";
}

function clearError() {
  el.errorToast.hidden = true;
  el.errorToast.textContent = "";
}

async function loadWeather() {
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  el.refreshState.textContent = "Refreshing";

  try {
    const [response, modelResult, observation] = await Promise.all([
      fetch(forecastUrl(), { cache: "no-store" }),
      fetch(modelForecastUrl(), { cache: "no-store" })
        .then(async (modelResponse) => {
          if (!modelResponse.ok) throw new Error(`Model comparison request failed: ${modelResponse.status}`);
          return modelResponse.json();
        })
        .catch((error) => {
          console.info("Optional model comparison is unavailable.", error);
          return null;
        }),
      fetchObservedWind(),
    ]);
    if (!response.ok) throw new Error(`Forecast request failed: ${response.status}`);
    const data = await response.json();
    if (requestId !== state.requestId) return;

    state.lastData = data;
    state.modelData = modelResult;
    state.observation = observation;
    state.observationStation = observation?.station || null;
    if (!modelResult && state.forecastModel !== "best_match") state.forecastModel = "best_match";
    el.forecastModel.value = state.forecastModel;
    [...el.forecastModel.options].forEach((option) => {
      option.disabled = option.value !== "best_match" && !modelResult;
    });
    state.lastUpdated = new Date();

    renderCurrent(data);
    renderForecast(data);
    renderChart(selectedForecastData());
    renderSources(data);
    clearError();

    el.refreshState.textContent = `Updated ${state.lastUpdated.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  } catch (error) {
    if (requestId !== state.requestId) return;
    console.error(error);
    showError("Could not load weather data. Radar and source links are still available.");
  }
}

function setLocation(nextLocation) {
  state.location = nextLocation;
  updateLocationUI();
  loadWeather();
}

const PROFILE_FIELDS = {
  minimumWind: el.minimumWind,
  cautionWind: el.cautionWind,
  maximumWind: el.maximumWind,
  cautionGust: el.cautionGust,
  maximumGust: el.maximumGust,
  cautionRain: el.cautionRain,
  maximumRain: el.maximumRain,
};

function validCoordinate(value, minimum, maximum) {
  return Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
}

function syncSettingsForm() {
  el.locationPreset.value = LOCATIONS[state.location.preset] ? state.location.preset : "custom";
  el.customLocationName.value = state.location.name;
  el.customLatitude.value = Number(state.location.latitude).toFixed(4);
  el.customLongitude.value = Number(state.location.longitude).toFixed(4);
  el.profilePreset.value = PROFILES[state.profile.preset] ? state.profile.preset : "custom";
  Object.entries(PROFILE_FIELDS).forEach(([key, input]) => { input.value = state.profile[key]; });
}

function saveSetup() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      location: state.location,
      profile: state.profile,
      forecastHours: state.forecastHours,
      forecastModel: state.forecastModel,
    }));
  } catch (error) {
    console.info("Could not save sailing setup.", error);
  }
}

function restoreSetup() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(CONFIG.storageKey));
  } catch (error) {
    console.info("Could not read saved sailing setup.", error);
  }

  if (saved?.location && validCoordinate(saved.location.latitude, -90, 90) && validCoordinate(saved.location.longitude, -180, 180)) {
    state.location = { ...CONFIG.defaultLocation, ...saved.location };
  }
  if (saved?.profile) {
    const valuesAreValid = Object.keys(PROFILE_FIELDS).every((key) => Number.isFinite(Number(saved.profile[key])));
    if (valuesAreValid) state.profile = { ...CONFIG.defaultProfile, ...saved.profile };
  }
  if ([6, 12, 24, 72, 168].includes(Number(saved?.forecastHours))) {
    state.forecastHours = Number(saved.forecastHours);
  }
  if (FORECAST_MODELS[saved?.forecastModel]) {
    state.forecastModel = saved.forecastModel;
  }

  const params = new URLSearchParams(location.search);
  if (params.has("lat") && params.has("lon") && validCoordinate(params.get("lat"), -90, 90) && validCoordinate(params.get("lon"), -180, 180)) {
    state.location = {
      name: (params.get("name") || "Shared sailing location").slice(0, 60),
      latitude: Number(params.get("lat")),
      longitude: Number(params.get("lon")),
      timezone: params.get("tz") || browserTimezone(),
      preset: "custom",
      isUserLocation: false,
    };
  }

  const profileKey = params.get("profile");
  if (PROFILES[profileKey]) state.profile = { ...PROFILES[profileKey], preset: profileKey };
  const urlFields = { min: "minimumWind", cw: "cautionWind", mw: "maximumWind", cg: "cautionGust", mg: "maximumGust", cr: "cautionRain", mr: "maximumRain" };
  let hasCustomLimit = false;
  Object.entries(urlFields).forEach(([param, key]) => {
    if (params.has(param) && Number.isFinite(Number(params.get(param)))) {
      state.profile[key] = Number(params.get(param));
      hasCustomLimit = true;
    }
  });
  if (hasCustomLimit) state.profile = { ...state.profile, name: "Custom limits", preset: "custom" };
}

function applyLocationPreset() {
  const preset = LOCATIONS[el.locationPreset.value];
  if (!preset) return;
  el.customLocationName.value = preset.name;
  el.customLatitude.value = preset.latitude.toFixed(4);
  el.customLongitude.value = preset.longitude.toFixed(4);
}

function applyProfilePreset() {
  const profile = PROFILES[el.profilePreset.value];
  if (!profile) return;
  Object.entries(PROFILE_FIELDS).forEach(([key, input]) => { input.value = profile[key]; });
}

function applySettings(event) {
  event.preventDefault();
  const latitude = Number(el.customLatitude.value);
  const longitude = Number(el.customLongitude.value);
  const profile = Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key, input]) => [key, Number(input.value)]));

  if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) {
    el.settingsMessage.textContent = "Enter valid latitude and longitude values.";
    return;
  }
  if (profile.maximumWind <= profile.cautionWind || profile.maximumGust <= profile.cautionGust || profile.maximumRain < profile.cautionRain) {
    el.settingsMessage.textContent = "Maximum limits must be higher than caution limits.";
    return;
  }

  const selectedLocation = LOCATIONS[el.locationPreset.value];
  const isUnchangedLocation = selectedLocation
    && Math.abs(latitude - selectedLocation.latitude) < 0.00001
    && Math.abs(longitude - selectedLocation.longitude) < 0.00001
    && el.customLocationName.value.trim() === selectedLocation.name;
  const locationPreset = isUnchangedLocation ? el.locationPreset.value : "custom";
  const selectedProfile = PROFILES[el.profilePreset.value];
  const isUnchangedProfile = selectedProfile
    && Object.keys(PROFILE_FIELDS).every((key) => profile[key] === selectedProfile[key]);
  const profilePreset = isUnchangedProfile ? el.profilePreset.value : "custom";
  state.location = {
    name: el.customLocationName.value.trim() || "Custom sailing location",
    latitude,
    longitude,
    timezone: locationPreset === "custom" ? browserTimezone() : selectedLocation.timezone,
    preset: locationPreset,
    isUserLocation: false,
  };
  state.profile = {
    ...profile,
    name: profilePreset === "custom" ? "Custom limits" : selectedProfile.name,
    preset: profilePreset,
  };
  saveSetup();
  syncSettingsForm();
  updateLocationUI();
  el.settingsMessage.textContent = "Setup saved.";
  loadWeather();
}

function setupShareUrl() {
  const url = new URL(location.href);
  url.search = "";
  const params = url.searchParams;
  params.set("lat", state.location.latitude.toFixed(4));
  params.set("lon", state.location.longitude.toFixed(4));
  params.set("name", state.location.name);
  params.set("tz", state.location.timezone);
  params.set("profile", state.profile.preset);
  if (state.profile.preset === "custom") {
    const fields = { min: "minimumWind", cw: "cautionWind", mw: "maximumWind", cg: "cautionGust", mg: "maximumGust", cr: "cautionRain", mr: "maximumRain" };
    Object.entries(fields).forEach(([param, key]) => params.set(param, state.profile[key]));
  }
  return url.toString();
}

async function shareSetup() {
  const url = setupShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    el.settingsMessage.textContent = "Share link copied.";
  } catch (error) {
    window.prompt("Copy this sailing setup link:", url);
  }
}

function requestBrowserPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 10000,
    });
  });
}

async function useBrowserLocation() {
  if (!navigator.geolocation) {
    showError("This browser does not support location access.");
    return;
  }

  el.useLocation.disabled = true;
  el.useLocation.textContent = "Finding location";

  try {
    const position = await requestBrowserPosition();
    state.location = {
      name: "Your location",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timezone: browserTimezone(),
      preset: "custom",
      isUserLocation: true,
    };
    saveSetup();
    syncSettingsForm();
    updateLocationUI();
    loadWeather();
  } catch (error) {
    console.error(error);
    showError("Location was not available. Showing Toronto Island / CYTZ.");
  } finally {
    el.useLocation.disabled = false;
    updateLocationUI();
  }
}

async function useGrantedLocationIfAvailable() {
  if (!navigator.permissions || !navigator.geolocation) return;

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    if (permission.state === "granted") {
      useBrowserLocation();
    }
  } catch (error) {
    console.info("Geolocation permission state is unavailable.", error);
  }
}

restoreSetup();
syncSettingsForm();
el.forecastRange.value = String(state.forecastHours);
el.forecastModel.value = state.forecastModel;
tickClock();
setInterval(tickClock, 30 * 1000);
el.useLocation.addEventListener("click", useBrowserLocation);
el.settingsToggle.addEventListener("click", () => {
  el.settingsPanel.hidden = !el.settingsPanel.hidden;
  el.settingsToggle.setAttribute("aria-expanded", String(!el.settingsPanel.hidden));
});
el.locationPreset.addEventListener("change", applyLocationPreset);
el.profilePreset.addEventListener("change", applyProfilePreset);
function applyForecastRange(value) {
  const hours = Number(value);
  if (![6, 12, 24, 72, 168].includes(hours)) return;
  state.forecastHours = hours;
  el.forecastRange.value = String(hours);
  saveSetup();
  if (state.lastData) {
    renderForecast(state.lastData);
    renderChart(selectedForecastData());
  }
}

el.forecastRange.addEventListener("change", () => applyForecastRange(el.forecastRange.value));
el.forecastModel.addEventListener("change", () => {
  if (!FORECAST_MODELS[el.forecastModel.value]) return;
  state.forecastModel = el.forecastModel.value;
  saveSetup();
  if (state.lastData) {
    renderChart(selectedForecastData());
    renderSources(state.lastData);
  }
});
window.addEventListener("pageshow", () => {
  if (Number(el.forecastRange.value) !== state.forecastHours) {
    applyForecastRange(el.forecastRange.value);
  }
});
el.settingsForm.addEventListener("submit", applySettings);
el.shareSetup.addEventListener("click", shareSetup);
updateLocationUI();
loadWeather();
setInterval(loadWeather, CONFIG.refreshMs);
