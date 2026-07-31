const CONFIG = {
  defaultLocation: {
    name: "Toronto Island / CYTZ",
    latitude: 43.6285,
    longitude: -79.3962,
    timezone: "America/Toronto",
    isUserLocation: false,
  },
  refreshMs: 10 * 60 * 1000,
};

const state = {
  location: { ...CONFIG.defaultLocation },
  lastData: null,
  lastUpdated: null,
  requestId: 0,
};

const el = {
  locationLabel: document.querySelector("#location-label"),
  clock: document.querySelector("#clock"),
  refreshState: document.querySelector("#refresh-state"),
  useLocation: document.querySelector("#use-location"),
  conditionLabel: document.querySelector("#condition-label"),
  statusPill: document.querySelector("#status-pill"),
  currentWind: document.querySelector("#current-wind"),
  currentGust: document.querySelector("#current-gust"),
  directionArrow: document.querySelector("#direction-arrow"),
  directionLabel: document.querySelector("#direction-label"),
  decisionCopy: document.querySelector("#decision-copy"),
  currentTemp: document.querySelector("#current-temp"),
  currentRain: document.querySelector("#current-rain"),
  peakNext: document.querySelector("#peak-next"),
  updatedAt: document.querySelector("#updated-at"),
  forecastStrip: document.querySelector("#forecast-strip"),
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
    ].join(","),
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
    ].join(","),
    wind_speed_unit: "kn",
    timezone: state.location.timezone,
    forecast_days: "2",
  });

  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

function windyEmbedUrl() {
  const params = new URLSearchParams({
    type: "map",
    location: "coordinates",
    metricRain: "mm",
    metricTemp: "°C",
    metricWind: "kt",
    zoom: state.location.isUserLocation ? "8" : "7",
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

function directionName(deg) {
  if (deg === null || deg === undefined || Number.isNaN(Number(deg))) return "---";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(Number(deg) / 22.5) % 16];
}

function classifyConditions(wind, gust, rainProbability) {
  if (gust >= 24 || wind >= 18 || rainProbability >= 65) {
    return {
      className: "is-hold",
      label: "Hold",
      title: "Rough window",
      copy: "Strong gusts or rain risk are high enough that this deserves a conservative check before heading out.",
    };
  }

  if (gust >= 18 || wind >= 14 || wind < 4 || rainProbability >= 35) {
    return {
      className: "is-watch",
      label: "Watch",
      title: "Mixed window",
      copy: "Conditions are usable for some plans, but gusts, light air, or rain risk could change the decision.",
    };
  }

  return {
    className: "is-good",
    label: "Open",
    title: "Manageable window",
    copy: "Wind is in a moderate range and short-term rain risk is low. Confirm locally before making the call.",
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
  }));

  const firstFuture = rows.findIndex((row) => row.date.getTime() >= now - 30 * 60 * 1000);
  return rows.slice(Math.max(0, firstFuture), Math.max(0, firstFuture) + count);
}

function renderCurrent(data) {
  const current = data.current;
  const hours = nextHours(data, 12);
  const nextSix = hours.slice(0, 6);
  const peakGust = Math.max(...nextSix.map((hour) => Number(hour.gust) || 0));
  const peakWind = Math.max(...nextSix.map((hour) => Number(hour.wind) || 0));
  const maxRain = Math.max(...nextSix.map((hour) => Number(hour.rain) || 0));
  const condition = classifyConditions(current.wind_speed_10m, current.wind_gusts_10m, maxRain);

  el.conditionLabel.textContent = condition.title;
  el.statusPill.textContent = condition.label;
  el.statusPill.className = `status-pill ${condition.className}`;
  el.currentWind.textContent = fmtNumber(current.wind_speed_10m);
  el.currentGust.textContent = fmtNumber(current.wind_gusts_10m);
  el.directionLabel.textContent = directionName(current.wind_direction_10m);
  el.directionArrow.style.transform = `rotate(${current.wind_direction_10m || 0}deg)`;
  el.decisionCopy.textContent = condition.copy;
  el.currentTemp.innerHTML = `${fmtNumber(current.temperature_2m, 1)}&deg;C`;
  el.currentRain.textContent = `${fmtNumber(current.precipitation, 1)} mm`;
  el.peakNext.textContent = `${fmtNumber(peakWind)}-${fmtNumber(peakGust)} kt`;
  el.updatedAt.textContent = fmtTime(current.time);
}

function renderForecast(data) {
  const hours = nextHours(data, 12);
  el.forecastStrip.replaceChildren(...hours.map((hour) => {
    const card = document.createElement("div");
    card.className = "hour-card";
    card.innerHTML = `
      <strong>${fmtTime(hour.time)}</strong>
      <div class="hour-wind">${fmtNumber(hour.wind)}<span>kt</span></div>
      <div class="hour-detail">Gust ${fmtNumber(hour.gust)} kt</div>
      <div class="hour-detail">${directionName(hour.direction)} / ${fmtNumber(hour.rain)}% rain</div>
      <div class="mini-arrow" style="--dir: ${hour.direction || 0}deg" aria-hidden="true"></div>
    `;
    return card;
  }));
}

function pathFor(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function renderChart(data) {
  const rows = nextHours(data, 24);
  const width = 900;
  const height = 260;
  const padding = { top: 20, right: 22, bottom: 42, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(24, ...rows.map((row) => Number(row.gust) || 0)) + 4;
  const scaleX = (index) => padding.left + (index / Math.max(1, rows.length - 1)) * chartWidth;
  const scaleY = (value) => padding.top + chartHeight - (Number(value) / maxValue) * chartHeight;
  const windPoints = rows.map((row, index) => ({ x: scaleX(index), y: scaleY(row.wind) }));
  const gustPoints = rows.map((row, index) => ({ x: scaleX(index), y: scaleY(row.gust) }));
  const yTicks = [0, 8, 16, 24, 32].filter((tick) => tick <= maxValue);

  el.chart.replaceChildren();

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
      y: scaleY(24),
      width: chartWidth,
      height: Math.max(0, scaleY(16) - scaleY(24)),
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

  rows.forEach((row, index) => {
    if (index % 3 !== 0) return;
    const label = make("text", {
      class: "axis-label",
      x: scaleX(index) - 18,
      y: height - 13,
    });
    label.textContent = fmtTime(row.time).replace(":00", "");
    el.chart.append(label);
  });

  el.chart.append(
    make("path", { class: "wind-line", d: pathFor(windPoints) }),
    make("path", { class: "gust-line", d: pathFor(gustPoints) })
  );
}

function renderSources(data) {
  const generated = state.lastUpdated ? state.lastUpdated.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  }) : "--";

  el.sourceList.innerHTML = `
    <li><span>Open-Meteo forecast</span><strong>Fetched ${generated}</strong></li>
    <li><span>Location</span><strong>${state.location.name}</strong></li>
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
    const response = await fetch(forecastUrl(), { cache: "no-store" });
    if (!response.ok) throw new Error(`Forecast request failed: ${response.status}`);
    const data = await response.json();
    if (requestId !== state.requestId) return;

    state.lastData = data;
    state.lastUpdated = new Date();

    renderCurrent(data);
    renderForecast(data);
    renderChart(data);
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
    setLocation({
      name: "Your location",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timezone: browserTimezone(),
      isUserLocation: true,
    });
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

tickClock();
setInterval(tickClock, 30 * 1000);
el.useLocation.addEventListener("click", useBrowserLocation);
updateLocationUI();
loadWeather();
useGrantedLocationIfAvailable();
setInterval(loadWeather, CONFIG.refreshMs);
