import { assertEnum, assertFiniteNumber, assertString, deepFreeze } from '../core/validation';

const LOCALES = Object.freeze({
  'en-US': {
    locale: 'en-US',
    language: 'English',
    direction: 'ltr',
    unitSystem: 'imperial',
    firstDayOfWeek: 0,
    hourCycle: 'h12',
    dateStyle: 'medium',
    messages: {
      clear: 'Clear',
      cloudy: 'Cloudy',
      rain: 'Rain',
      snow: 'Snow',
      thunderstorm: 'Thunderstorm',
      fog: 'Fog',
      temperature: 'Temperature',
      feelsLike: 'Feels like',
      humidity: 'Humidity',
      wind: 'Wind',
      pressure: 'Pressure',
      visibility: 'Visibility',
      precipitation: 'Precipitation',
      sunrise: 'Sunrise',
      sunset: 'Sunset',
      today: 'Today',
      tomorrow: 'Tomorrow',
      updated: 'Updated',
      unavailable: 'Unavailable',
      loading: 'Loading weather',
      offline: 'You are offline',
    },
  },
  'en-GB': {
    locale: 'en-GB',
    language: 'English',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 1,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: 'Clear',
      cloudy: 'Cloudy',
      rain: 'Rain',
      snow: 'Snow',
      thunderstorm: 'Thunderstorm',
      fog: 'Fog',
      temperature: 'Temperature',
      feelsLike: 'Feels like',
      humidity: 'Humidity',
      wind: 'Wind',
      pressure: 'Pressure',
      visibility: 'Visibility',
      precipitation: 'Precipitation',
      sunrise: 'Sunrise',
      sunset: 'Sunset',
      today: 'Today',
      tomorrow: 'Tomorrow',
      updated: 'Updated',
      unavailable: 'Unavailable',
      loading: 'Loading weather',
      offline: 'You are offline',
    },
  },
  'es-ES': {
    locale: 'es-ES',
    language: 'Español',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 1,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: 'Despejado',
      cloudy: 'Nublado',
      rain: 'Lluvia',
      snow: 'Nieve',
      thunderstorm: 'Tormenta',
      fog: 'Niebla',
      temperature: 'Temperatura',
      feelsLike: 'Sensación térmica',
      humidity: 'Humedad',
      wind: 'Viento',
      pressure: 'Presión',
      visibility: 'Visibilidad',
      precipitation: 'Precipitación',
      sunrise: 'Amanecer',
      sunset: 'Atardecer',
      today: 'Hoy',
      tomorrow: 'Mañana',
      updated: 'Actualizado',
      unavailable: 'No disponible',
      loading: 'Cargando el tiempo',
      offline: 'Estás sin conexión',
    },
  },
  'fr-FR': {
    locale: 'fr-FR',
    language: 'Français',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 1,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: 'Dégagé',
      cloudy: 'Nuageux',
      rain: 'Pluie',
      snow: 'Neige',
      thunderstorm: 'Orage',
      fog: 'Brouillard',
      temperature: 'Température',
      feelsLike: 'Ressenti',
      humidity: 'Humidité',
      wind: 'Vent',
      pressure: 'Pression',
      visibility: 'Visibilité',
      precipitation: 'Précipitations',
      sunrise: 'Lever du soleil',
      sunset: 'Coucher du soleil',
      today: "Aujourd'hui",
      tomorrow: 'Demain',
      updated: 'Actualisé',
      unavailable: 'Indisponible',
      loading: 'Chargement de la météo',
      offline: 'Vous êtes hors ligne',
    },
  },
  'de-DE': {
    locale: 'de-DE',
    language: 'Deutsch',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 1,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: 'Klar',
      cloudy: 'Bewölkt',
      rain: 'Regen',
      snow: 'Schnee',
      thunderstorm: 'Gewitter',
      fog: 'Nebel',
      temperature: 'Temperatur',
      feelsLike: 'Gefühlt',
      humidity: 'Luftfeuchtigkeit',
      wind: 'Wind',
      pressure: 'Luftdruck',
      visibility: 'Sichtweite',
      precipitation: 'Niederschlag',
      sunrise: 'Sonnenaufgang',
      sunset: 'Sonnenuntergang',
      today: 'Heute',
      tomorrow: 'Morgen',
      updated: 'Aktualisiert',
      unavailable: 'Nicht verfügbar',
      loading: 'Wetter wird geladen',
      offline: 'Sie sind offline',
    },
  },
  'it-IT': {
    locale: 'it-IT',
    language: 'Italiano',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 1,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: 'Sereno',
      cloudy: 'Nuvoloso',
      rain: 'Pioggia',
      snow: 'Neve',
      thunderstorm: 'Temporale',
      fog: 'Nebbia',
      temperature: 'Temperatura',
      feelsLike: 'Percepita',
      humidity: 'Umidità',
      wind: 'Vento',
      pressure: 'Pressione',
      visibility: 'Visibilità',
      precipitation: 'Precipitazioni',
      sunrise: 'Alba',
      sunset: 'Tramonto',
      today: 'Oggi',
      tomorrow: 'Domani',
      updated: 'Aggiornato',
      unavailable: 'Non disponibile',
      loading: 'Caricamento meteo',
      offline: 'Sei offline',
    },
  },
  'pt-BR': {
    locale: 'pt-BR',
    language: 'Português',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 0,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: 'Céu limpo',
      cloudy: 'Nublado',
      rain: 'Chuva',
      snow: 'Neve',
      thunderstorm: 'Tempestade',
      fog: 'Neblina',
      temperature: 'Temperatura',
      feelsLike: 'Sensação',
      humidity: 'Umidade',
      wind: 'Vento',
      pressure: 'Pressão',
      visibility: 'Visibilidade',
      precipitation: 'Precipitação',
      sunrise: 'Nascer do sol',
      sunset: 'Pôr do sol',
      today: 'Hoje',
      tomorrow: 'Amanhã',
      updated: 'Atualizado',
      unavailable: 'Indisponível',
      loading: 'Carregando previsão',
      offline: 'Você está offline',
    },
  },
  'ja-JP': {
    locale: 'ja-JP',
    language: '日本語',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 0,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: '晴れ',
      cloudy: '曇り',
      rain: '雨',
      snow: '雪',
      thunderstorm: '雷雨',
      fog: '霧',
      temperature: '気温',
      feelsLike: '体感温度',
      humidity: '湿度',
      wind: '風',
      pressure: '気圧',
      visibility: '視程',
      precipitation: '降水',
      sunrise: '日の出',
      sunset: '日の入り',
      today: '今日',
      tomorrow: '明日',
      updated: '更新',
      unavailable: '利用できません',
      loading: '天気を読み込み中',
      offline: 'オフラインです',
    },
  },
  'ko-KR': {
    locale: 'ko-KR',
    language: '한국어',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 0,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: '맑음',
      cloudy: '흐림',
      rain: '비',
      snow: '눈',
      thunderstorm: '뇌우',
      fog: '안개',
      temperature: '기온',
      feelsLike: '체감 온도',
      humidity: '습도',
      wind: '바람',
      pressure: '기압',
      visibility: '가시거리',
      precipitation: '강수',
      sunrise: '일출',
      sunset: '일몰',
      today: '오늘',
      tomorrow: '내일',
      updated: '업데이트',
      unavailable: '사용할 수 없음',
      loading: '날씨 불러오는 중',
      offline: '오프라인 상태입니다',
    },
  },
  'hi-IN': {
    locale: 'hi-IN',
    language: 'हिन्दी',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 0,
    hourCycle: 'h12',
    dateStyle: 'medium',
    messages: {
      clear: 'साफ़',
      cloudy: 'बादल',
      rain: 'बारिश',
      snow: 'बर्फ़',
      thunderstorm: 'आंधी-तूफ़ान',
      fog: 'कोहरा',
      temperature: 'तापमान',
      feelsLike: 'महसूस तापमान',
      humidity: 'नमी',
      wind: 'हवा',
      pressure: 'दबाव',
      visibility: 'दृश्यता',
      precipitation: 'वर्षा',
      sunrise: 'सूर्योदय',
      sunset: 'सूर्यास्त',
      today: 'आज',
      tomorrow: 'कल',
      updated: 'अपडेट किया गया',
      unavailable: 'उपलब्ध नहीं',
      loading: 'मौसम लोड हो रहा है',
      offline: 'आप ऑफ़लाइन हैं',
    },
  },
  'ar-SA': {
    locale: 'ar-SA',
    language: 'العربية',
    direction: 'rtl',
    unitSystem: 'metric',
    firstDayOfWeek: 0,
    hourCycle: 'h12',
    dateStyle: 'medium',
    messages: {
      clear: 'صافٍ',
      cloudy: 'غائم',
      rain: 'مطر',
      snow: 'ثلج',
      thunderstorm: 'عاصفة رعدية',
      fog: 'ضباب',
      temperature: 'درجة الحرارة',
      feelsLike: 'المحسوسة',
      humidity: 'الرطوبة',
      wind: 'الرياح',
      pressure: 'الضغط',
      visibility: 'مدى الرؤية',
      precipitation: 'الهطول',
      sunrise: 'الشروق',
      sunset: 'الغروب',
      today: 'اليوم',
      tomorrow: 'غداً',
      updated: 'تم التحديث',
      unavailable: 'غير متاح',
      loading: 'جارٍ تحميل الطقس',
      offline: 'أنت غير متصل',
    },
  },
  'zh-CN': {
    locale: 'zh-CN',
    language: '简体中文',
    direction: 'ltr',
    unitSystem: 'metric',
    firstDayOfWeek: 1,
    hourCycle: 'h23',
    dateStyle: 'medium',
    messages: {
      clear: '晴',
      cloudy: '多云',
      rain: '雨',
      snow: '雪',
      thunderstorm: '雷暴',
      fog: '雾',
      temperature: '温度',
      feelsLike: '体感温度',
      humidity: '湿度',
      wind: '风',
      pressure: '气压',
      visibility: '能见度',
      precipitation: '降水',
      sunrise: '日出',
      sunset: '日落',
      today: '今天',
      tomorrow: '明天',
      updated: '已更新',
      unavailable: '不可用',
      loading: '正在加载天气',
      offline: '当前离线',
    },
  },
});

export function localeProfile(localeInput = 'en-US') {
  const locale = LOCALES[localeInput] ? localeInput : 'en-US';
  return LOCALES[locale];
}

export function translateWeather(key, locale = 'en-US', replacements = {}) {
  const profile = localeProfile(locale);
  const messageKey = String(key).startsWith('weather.') ? String(key).slice(8) : key;
  const fallback = LOCALES['en-US'].messages[messageKey] ?? key;
  const message = profile.messages[messageKey] ?? fallback;
  const translated = message.replace(/\{([^}]+)\}/g, (_, name) => replacements[name] ?? `{${name}}`);
  if (messageKey === 'updated' && replacements.time && !message.includes('{time}')) {
    return `${translated} ${replacements.time}`;
  }
  return translated;
}

export function formatLocalizedNumber(value, locale = 'en-US', options = {}) {
  const number = assertFiniteNumber(value, 'Localized number');
  return new Intl.NumberFormat(localeProfile(locale).locale, options).format(number);
}

export function formatLocalizedDate(value, locale = 'en-US', options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return localeProfile(locale).messages.unavailable;
  const profile = localeProfile(locale);
  return new Intl.DateTimeFormat(profile.locale, {
    dateStyle: options.dateStyle ?? profile.dateStyle,
    timeZone: options.timeZone,
  }).format(date);
}

export function formatLocalizedTime(value, locale = 'en-US', options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return localeProfile(locale).messages.unavailable;
  const profile = localeProfile(locale);
  return new Intl.DateTimeFormat(profile.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: options.hourCycle ?? profile.hourCycle,
    timeZone: options.timeZone,
  }).format(date);
}

export function formatMeasurement(value, measurement, locale = 'en-US', unitSystem) {
  const profile = localeProfile(locale);
  const system = unitSystem ?? profile.unitSystem;
  const number = assertFiniteNumber(value, 'Measurement');
  if (measurement === 'temperature') {
    const display = system === 'imperial' ? number * 9 / 5 + 32 : number;
    return `${formatLocalizedNumber(display, locale, { maximumFractionDigits: 1 })} °${system === 'imperial' ? 'F' : 'C'}`;
  }
  if (measurement === 'wind') {
    const display = system === 'imperial' ? number * 2.23694 : number;
    return `${formatLocalizedNumber(display, locale, { maximumFractionDigits: 1 })} ${system === 'imperial' ? 'mph' : 'm/s'}`;
  }
  if (measurement === 'distance') {
    const display = system === 'imperial' ? number / 1609.344 : number / 1000;
    return `${formatLocalizedNumber(display, locale, { maximumFractionDigits: 1 })} ${system === 'imperial' ? 'mi' : 'km'}`;
  }
  if (measurement === 'pressure') {
    const display = system === 'imperial' ? number * 0.0295299830714 : number;
    return `${formatLocalizedNumber(display, locale, { maximumFractionDigits: 2 })} ${system === 'imperial' ? 'inHg' : 'hPa'}`;
  }
  if (measurement === 'precipitation') {
    const display = system === 'imperial' ? number / 25.4 : number;
    return `${formatLocalizedNumber(display, locale, { maximumFractionDigits: 2 })} ${system === 'imperial' ? 'in' : 'mm'}`;
  }
  throw new TypeError(`Unsupported measurement: ${measurement}`);
}

export function supportedLocales() {
  return Object.values(LOCALES).map((profile) => ({
    locale: profile.locale,
    language: profile.language,
    direction: profile.direction,
    defaultUnitSystem: profile.unitSystem,
  }));
}

export function resolveLocale(candidates = []) {
  for (const candidate of candidates) {
    if (LOCALES[candidate]) return candidate;
    const language = String(candidate).split('-')[0];
    const match = Object.keys(LOCALES).find((locale) => locale.startsWith(`${language}-`));
    if (match) return match;
  }
  return 'en-US';
}

export function localizedWorkspaceSettings(input = {}) {
  const locale = resolveLocale([input.locale, ...(input.browserLocales ?? [])].filter(Boolean));
  const profile = localeProfile(locale);
  const unitSystem = input.unitSystem
    ? assertEnum(input.unitSystem, ['metric', 'imperial'], 'Unit system')
    : profile.unitSystem;
  return deepFreeze({
    locale,
    direction: profile.direction,
    unitSystem,
    firstDayOfWeek: Number.isInteger(input.firstDayOfWeek) ? input.firstDayOfWeek : profile.firstDayOfWeek,
    hourCycle: input.hourCycle ?? profile.hourCycle,
  });
}

export { LOCALES as WEATHER_LOCALES };
