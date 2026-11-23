const LAT = 39.8367;
const LON = -105.0372;
const TZ = "America/Denver";
const OBS_URL = "https://api.weather.gov/stations/KBJC/observations/latest";
const FORECAST_URL = "https://api.weather.gov/gridpoints/BOU/62,66/forecast";
const HOURLY_URL = "https://api.weather.gov/gridpoints/BOU/62,66/forecast/hourly";
const ALERTS_URL = `https://api.weather.gov/alerts/active?point=${LAT},${LON}`;
const RADAR_LOOP = "https://radar.weather.gov/ridge/standard/KFTG_loop.gif";
const REFRESH_MS = 5 * 60 * 1000;

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

const CLOUD_PATH =
  "M20 46h28a10 10 0 0 0 0-20 14 14 0 0 0-27.2-3.6A10 10 0 0 0 20 46z";

export function degToCompass(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return "";
  return COMPASS[Math.round(Number(deg) / 22.5) % 16];
}

export function toF(qv) {
  if (!qv || qv.value == null) return null;
  const u = qv.unitCode || "";
  if (u.includes("degF")) return qv.value;
  return qv.value * (9 / 5) + 32;
}

export function toMph(qv) {
  if (!qv || qv.value == null) return null;
  const u = qv.unitCode || "";
  if (u.includes("mi_h") || u.includes("mi/h")) return qv.value;
  if (u.includes("km_h") || u.includes("km/h")) return qv.value / 1.609344;
  if (u.includes("m_s-1") || u.includes("m/s")) return qv.value * 2.236936;
  return qv.value;
}

export function formatTemp(f) {
  if (f == null || Number.isNaN(f)) return "—";
  return `${Math.round(f)}°F`;
}

export function precipChance(period) {
  const v = period?.probabilityOfPrecipitation?.value;
  return v == null ? 0 : v;
}

export function forecastTempF(period) {
  if (period == null || period.temperature == null) return null;
  const unit = period.temperatureUnit;
  if (unit === "C" || unit === "degC") return period.temperature * (9 / 5) + 32;
  return period.temperature;
}

export function iconKindFromForecast(forecast, night = false) {
  const t = String(forecast || "").toLowerCase();
  if (/\b(snow|flurries|blizzard|wintry|sleet|freezing)\b/.test(t)) return "snow";
  if (/\b(thunder|rain|shower|drizzle)\b/.test(t)) return "rain";
  const windy = /\b(windy|breezy)\b/.test(t);
  const hasSky = /\b(sunny|clear|cloud|cloudy|overcast|fog|rain|snow|thunder|shower)\b/.test(t);
  if (windy && !hasSky) return "wind";
  const partly =
    /partly cloudy|partly sunny|mostly sunny|mostly clear/.test(t) ||
    (/partly/.test(t) && /\b(cloud|sunny|clear)\b/.test(t));
  const clear = /\b(sunny|clear)\b/.test(t);
  const cloudy = /\b(cloudy|overcast|fog)\b/.test(t);
  if (night) {
    if (partly) return "partly-cloudy-night";
    if (clear) return "moon";
    if (cloudy) return "cloud";
    return "moon";
  }
  if (partly) return "partly-cloudy";
  if (clear) return "sun";
  if (cloudy) return "cloud";
  if (windy) return "wind";
  return "sun";
}

function deg2rad(d) { return (d * Math.PI) / 180; }
function rad2deg(r) { return (r * 180) / Math.PI; }
function norm360(x) { return ((x % 360) + 360) % 360; }
function norm24(x) { return ((x % 24) + 24) % 24; }

/** Official sunrise/sunset (zenith 90°50') as UTC Date instants. */
export function sunTimesUTC(year, month, day, lat = LAT, lon = LON) {
  const zenith = 90.83333333333333;
  const N1 = Math.floor((275 * month) / 9);
  const N2 = Math.floor((month + 9) / 12);
  const N3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const N = N1 - N2 * N3 + day - 30;
  const lngHour = lon / 15;

  function calc(isSunrise) {
    const t = isSunrise ? N + (6 - lngHour) / 24 : N + (18 - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(deg2rad(M)) + 0.02 * Math.sin(deg2rad(2 * M)) + 282.634;
    L = norm360(L);
    let RA = rad2deg(Math.atan(0.91764 * Math.tan(deg2rad(L))));
    RA = norm360(RA);
    const Lquadrant = Math.floor(L / 90) * 90;
    const RAquadrant = Math.floor(RA / 90) * 90;
    RA = (RA + (Lquadrant - RAquadrant)) / 15;
    const sinDec = 0.39782 * Math.sin(deg2rad(L));
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH =
      (Math.cos(deg2rad(zenith)) - sinDec * Math.sin(deg2rad(lat))) /
      (cosDec * Math.cos(deg2rad(lat)));
    if (cosH > 1 || cosH < -1) return null;
    let H = isSunrise ? 360 - rad2deg(Math.acos(cosH)) : rad2deg(Math.acos(cosH));
    H /= 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = norm24(T - lngHour);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + Math.round(UT * 3600 * 1000));
  }

  return { sunrise: calc(true), sunset: calc(false) };
}

export function denverYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function formatDayLength(sunrise, sunset) {
  if (!sunrise || !sunset) return "—";
  const minutes = Math.round((sunset - sunrise) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  const mins = `${m} minute${m === 1 ? "" : "s"}`;
  return `${hours} ${mins}`;
}

export function formatTimeMT(date, { seconds = false } = {}) {
  if (!date) return "—";
  const opts = {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  if (seconds) opts.second = "2-digit";
  const clock = new Intl.DateTimeFormat("en-US", opts).format(date);
  return `${clock} MT`;
}

export function formatHourLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    hour12: true,
  }).format(date);
}

function sunRays(cx, cy, inner, outer) {
  return [0, 45, 90, 135, 180, 225, 270, 315]
    .map((deg) => {
      const a = ((deg - 90) * Math.PI) / 180;
      const x1 = cx + inner * Math.cos(a);
      const y1 = cy + inner * Math.sin(a);
      const x2 = cx + outer * Math.cos(a);
      const y2 = cy + outer * Math.sin(a);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--sun)" stroke-width="2.4" stroke-linecap="round"/>`;
    })
    .join("");
}

function snowflake(x, y) {
  return `<g stroke="var(--snow)" stroke-width="1.6" stroke-linecap="round">
    <line x1="${x - 3.2}" y1="${y}" x2="${x + 3.2}" y2="${y}"/>
    <line x1="${x}" y1="${y - 3.2}" x2="${x}" y2="${y + 3.2}"/>
    <line x1="${x - 2.3}" y1="${y - 2.3}" x2="${x + 2.3}" y2="${y + 2.3}"/>
    <line x1="${x + 2.3}" y1="${y - 2.3}" x2="${x - 2.3}" y2="${y + 2.3}"/>
  </g>`;
}

const cloud = `<path d="${CLOUD_PATH}" fill="var(--cloud)" stroke="var(--cloud-stroke)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
const cloudRaised = `<path d="${CLOUD_PATH}" transform="translate(0 -8)" fill="var(--cloud)" stroke="var(--cloud-stroke)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

export function weatherIconSvg(kind, label, sizeClass) {
  let marks = "";
  if (kind === "sun") {
    marks = `<g>${sunRays(32, 32, 16, 24)}<circle cx="32" cy="32" r="10" fill="var(--sun)"/></g>`;
  } else if (kind === "partly-cloudy") {
    marks = `<g>${sunRays(42, 20, 11, 17)}<circle cx="42" cy="20" r="7" fill="var(--sun)"/>${cloud}</g>`;
  } else if (kind === "cloud") {
    marks = `<g transform="translate(0 -4)">${cloud}</g>`;
  } else if (kind === "rain") {
    marks = `<g>${cloudRaised}<g fill="var(--rain)">
      <path d="M24 46c0 0-3.2 5.5 0 8 3.2-2.5 0-8 0-8z"/>
      <path d="M33 48c0 0-3.2 5.5 0 8 3.2-2.5 0-8 0-8z"/>
      <path d="M42 46c0 0-3.2 5.5 0 8 3.2-2.5 0-8 0-8z"/>
    </g></g>`;
  } else if (kind === "snow") {
    marks = `<g>${cloudRaised}${snowflake(24, 51)}${snowflake(33, 54)}${snowflake(43, 51)}</g>`;
  } else if (kind === "wind") {
    marks = `<g fill="none" stroke="var(--wind)" stroke-width="2.5" stroke-linecap="round">
      <path d="M10 24c8-6 16-6 24 0s16 6 22 0"/>
      <path d="M8 34c9-6 18-6 26 0s18 6 24 0"/>
      <path d="M14 44c7-5 14-5 22 0s14 5 18 0"/>
    </g>`;
  } else if (kind === "moon") {
    marks = `<path d="M38 12A20 20 0 1 0 38 52 15 15 0 1 1 38 12z" fill="var(--moon)"/>`;
  } else {
    marks = `<g><path d="M40 8A14 14 0 1 0 40 36 11 11 0 1 1 40 8z" fill="var(--moon)"/>${cloud}</g>`;
  }
  const cls = sizeClass ? ` class="${sizeClass}"` : "";
  return `<svg viewBox="0 0 64 64" width="100%" role="img" aria-label="${escapeHtml(label)}"${cls}>${marks}</svg>`;
}

export function groupDailyForecast(periods) {
  const days = [];
  let current = null;
  for (const p of periods || []) {
    const precip = precipChance(p);
    const temp = forecastTempF(p);
    if (p.isDaytime || !current) {
      current = {
        name: p.isDaytime ? p.name : p.name || "Tonight",
        high: p.isDaytime ? temp : null,
        low: p.isDaytime ? null : temp,
        conditions: p.shortForecast || "",
        precip,
      };
      days.push(current);
      if (!p.isDaytime) current = null;
    } else {
      current.low = temp;
      current.precip = Math.max(current.precip, precip);
      current = null;
    }
  }
  return days.slice(0, 7);
}

export function nextHourly(periods, now = new Date(), count = 24) {
  const upcoming = (periods || []).filter((p) => {
    const end = p.endTime ? new Date(p.endTime) : null;
    return !end || end > now;
  });
  return upcoming.slice(0, count).map((p) => ({
    start: new Date(p.startTime),
    temp: forecastTempF(p),
    precip: precipChance(p),
    conditions: p.shortForecast || "",
    wind: [p.windSpeed, p.windDirection].filter(Boolean).join(" "),
    night: p.isDaytime === false,
  }));
}

export function parseObservation(obs) {
  const p = obs?.properties || {};
  const temp = toF(p.temperature);
  const windChill = toF(p.windChill);
  const heatIndex = toF(p.heatIndex);
  const feels = windChill ?? heatIndex ?? temp;
  const windMph = toMph(p.windSpeed);
  const dir = degToCompass(p.windDirection?.value);
  let wind = "—";
  if (windMph == null && !dir) wind = "—";
  else if (windMph != null && windMph < 1) wind = "Calm";
  else if (windMph != null) wind = `${Math.round(windMph)} mph${dir ? ` ${dir}` : ""}`;
  else if (dir) wind = dir;
  const humidity = p.relativeHumidity?.value;
  return {
    timestamp: p.timestamp ? new Date(p.timestamp) : null,
    temperature: temp,
    feelsLike: feels,
    wind,
    humidity: humidity == null ? null : Math.round(humidity),
    sky: skyFromObservation(p),
  };
}

const CLOUD_COVER = {
  CLR: "Clear",
  SKC: "Clear",
  FEW: "A Few Clouds",
  SCT: "Scattered Clouds",
  BKN: "Broken Clouds",
  OVC: "Overcast",
  VV: "Obscured",
};

export function skyFromMetar(raw) {
  if (!raw) return "";
  const wx = [];
  const patterns = [
    [/\bTSRA\b/, "Thunderstorms and Rain"],
    [/\bTS\b/, "Thunderstorms"],
    [/\bFZRA\b/, "Freezing Rain"],
    [/\bSHSN\b|\bSN\b/, "Snow"],
    [/\bSHRA\b|\bRA\b/, "Rain"],
    [/\bPL\b/, "Ice Pellets"],
    [/\bDZ\b/, "Drizzle"],
    [/\bFG\b/, "Fog"],
    [/\bBR\b/, "Mist"],
    [/\bHZ\b/, "Haze"],
    [/\bFU\b/, "Smoke"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(raw) && !wx.includes(label)) wx.push(label);
  }
  const covers = [];
  const coverRe = /\b(FEW|SCT|BKN|OVC|VV)\d{0,3}\b/g;
  let m;
  while ((m = coverRe.exec(raw))) covers.push(m[1]);
  let cover = "";
  if (covers.includes("OVC") || covers.includes("VV")) cover = "Overcast";
  else if (covers.includes("BKN")) cover = "Cloudy";
  else if (covers.includes("SCT")) cover = "Partly Cloudy";
  else if (covers.includes("FEW")) cover = "A Few Clouds";
  else if (/\b(?:CLR|SKC|CAVOK)\b/.test(raw)) cover = "Clear";
  if (wx.length && cover && cover !== "Clear") return `${wx[0]} and ${cover}`;
  if (wx.length) return wx[0];
  return cover;
}

export function skyFromObservation(p) {
  if (p?.textDescription) return p.textDescription;
  const layers = p?.cloudLayers || [];
  const amounts = layers.map((l) => l?.amount).filter(Boolean);
  const rank = ["VV", "OVC", "BKN", "SCT", "FEW", "CLR", "SKC"];
  const best = rank.find((code) => amounts.includes(code));
  if (best && CLOUD_COVER[best]) return CLOUD_COVER[best];
  return skyFromMetar(p?.rawMessage) || "—";
}

export function formatWindForecast(period) {
  return [period.windSpeed, period.windDirection].filter(Boolean).join(" ") || "—";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, { tries = 3, timeoutMs = 12000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: { Accept: "application/geo+json, application/json" },
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}

export async function loadWeather() {
  const results = await Promise.allSettled([
    fetchJson(OBS_URL),
    fetchJson(FORECAST_URL),
    fetchJson(HOURLY_URL),
    fetchJson(ALERTS_URL),
  ]);
  const [obs, forecast, hourly, alerts] = results;
  const errors = [];
  const label = ["current conditions", "7-day forecast", "hourly forecast", "alerts"];
  results.forEach((r, i) => {
    if (r.status === "rejected") errors.push(`${label[i]} (${r.reason?.message || r.reason})`);
  });
  return {
    observation: obs.status === "fulfilled" ? parseObservation(obs.value) : null,
    days: forecast.status === "fulfilled" ? groupDailyForecast(forecast.value?.properties?.periods) : [],
    hours: hourly.status === "fulfilled" ? nextHourly(hourly.value?.properties?.periods) : [],
    alerts: alerts.status === "fulfilled" ? (alerts.value?.features || []) : [],
    errors,
    fetchedAt: new Date(),
  };
}

function renderCurrent(obs) {
  const el = document.getElementById("current");
  if (!obs) {
    el.innerHTML = `<p class="placeholder">Current conditions are unavailable.</p>`;
    return;
  }
  const { year, month, day } = denverYmd();
  const { sunrise, sunset } = sunTimesUTC(year, month, day);
  const kind = iconKindFromForecast(obs.sky, isNightNow(sunrise, sunset));
  el.innerHTML = `
    <div class="current-icon">${weatherIconSvg(kind, obs.sky, "current-svg")}</div>
    <dl class="facts">
      <div><dt>Temperature</dt><dd class="temp-big">${escapeHtml(formatTemp(obs.temperature))}</dd></div>
      <div><dt>Feels like</dt><dd>${escapeHtml(formatTemp(obs.feelsLike))}</dd></div>
      <div><dt>Wind</dt><dd>${escapeHtml(obs.wind)}</dd></div>
      <div><dt>Humidity</dt><dd>${obs.humidity == null ? "—" : `${obs.humidity}%`}</dd></div>
      <div><dt>Sky</dt><dd>${escapeHtml(obs.sky)}</dd></div>
      <div><dt>Sunrise</dt><dd>${escapeHtml(formatTimeMT(sunrise))}</dd></div>
      <div><dt>Sunset</dt><dd>${escapeHtml(formatTimeMT(sunset))}</dd></div>
      <div><dt>Day length</dt><dd>${escapeHtml(formatDayLength(sunrise, sunset))}</dd></div>
    </dl>`;
}

function isNightNow(sunrise, sunset, now = new Date()) {
  if (!sunrise || !sunset) return false;
  return now < sunrise || now >= sunset;
}

function renderDaily(days) {
  const el = document.getElementById("daily");
  if (!days.length) {
    el.innerHTML = `<p class="placeholder">The 7-day forecast is unavailable.</p>`;
    return;
  }
  el.innerHTML = days
    .map((day) => {
      const kind = iconKindFromForecast(day.conditions);
      const temps = [formatTemp(day.high), formatTemp(day.low)].join(" / ");
      return `<article class="day">
        <div class="icon-wrap">${weatherIconSvg(kind, day.conditions)}</div>
        <p class="name">${escapeHtml(day.name)}</p>
        <p class="temps">${escapeHtml(temps)}</p>
        <p class="sky">${escapeHtml(day.conditions)}</p>
        <p class="precip">${day.precip}% chance</p>
      </article>`;
    })
    .join("");
}

function renderHourly(hours) {
  const el = document.getElementById("hourly");
  if (!hours.length) {
    el.innerHTML = `<p class="placeholder">The hourly forecast is unavailable.</p>`;
    return;
  }
  const rows = hours
    .map((h) => {
      const kind = iconKindFromForecast(h.conditions, h.night);
      return `<tr>
        <td>${escapeHtml(formatHourLabel(h.start))}</td>
        <td>${weatherIconSvg(kind, h.conditions, "hour-icon")}</td>
        <td class="num">${escapeHtml(formatTemp(h.temp))}</td>
        <td>${escapeHtml(h.conditions)}</td>
        <td class="num">${h.precip}%</td>
        <td class="num">${escapeHtml(h.wind || "—")}</td>
      </tr>`;
    })
    .join("");
  el.innerHTML = `<table>
    <thead>
      <tr>
        <th>Time</th>
        <th><span class="visually-hidden">Sky icon</span></th>
        <th class="num">Temp</th>
        <th>Sky</th>
        <th class="num">Precip</th>
        <th class="num">Wind</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderAlerts(features) {
  const el = document.getElementById("alerts");
  if (!features.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = features
    .map((f) => {
      const p = f.properties || {};
      const event = p.event || "Weather alert";
      const headline = p.headline || p.description || "";
      const sev = String(p.severity || "").toLowerCase();
      const severe = sev === "severe" || sev === "extreme";
      return `<article class="alert${severe ? " severe" : ""}">
        <h3>${escapeHtml(event)}</h3>
        <p>${escapeHtml(headline)}</p>
      </article>`;
    })
    .join("");
}

function renderStatus(errors) {
  const el = document.getElementById("status");
  if (!errors.length) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = `Could not load ${errors.join("; ")}. Retrying automatically, or tap Refresh.`;
}

function refreshRadar() {
  const img = document.getElementById("radar");
  img.src = `${RADAR_LOOP}?t=${Date.now()}`;
}

async function refresh() {
  const btn = document.getElementById("refresh");
  const updated = document.getElementById("updated");
  btn.disabled = true;
  btn.classList.add("busy");
  try {
    const data = await loadWeather();
    renderCurrent(data.observation);
    renderDaily(data.days);
    renderHourly(data.hours);
    renderAlerts(data.alerts);
    renderStatus(data.errors);
    refreshRadar();
    if (data.errors.length && !data.observation && !data.days.length && !data.hours.length) {
      updated.textContent = "Update failed";
    } else {
      updated.textContent = `Updated ${formatTimeMT(data.fetchedAt)}`;
    }
  } catch (err) {
    renderStatus([err.message || String(err)]);
    updated.textContent = "Update failed";
  } finally {
    btn.disabled = false;
    btn.classList.remove("busy");
  }
}

function boot() {
  document.getElementById("refresh").addEventListener("click", () => {
    refresh();
  });
  refresh();
  setInterval(refresh, REFRESH_MS);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
