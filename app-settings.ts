import { promises as fs } from 'node:fs';
import path from 'node:path';

type YouTubeEnvKeyName = 'YOUTUBE_API_KEY' | 'YOUTUBE_DATA_API_KEY' | 'GOOGLE_API_KEY';

interface PersistedAppSettings {
  youtubeApiKey?: string;
}

interface YouTubeEnvSnapshot {
  sourceKey: YouTubeEnvKeyName | null;
  value: string;
}

const YOUTUBE_ENV_KEYS: YouTubeEnvKeyName[] = [
  'YOUTUBE_API_KEY',
  'YOUTUBE_DATA_API_KEY',
  'GOOGLE_API_KEY',
];

let settingsFilePath = '';
let storedYouTubeApiKey = '';
let initialYouTubeEnvSnapshot: YouTubeEnvSnapshot = {
  sourceKey: null,
  value: '',
};
let activeYouTubeApiKeySource: YouTubeApiKeyState['source'] = 'none';

function sanitizeApiKey(value: string | null | undefined): string {
  return String(value || '').trim();
}

function maskApiKey(value: string): string {
  if (value.length <= 8) {
    return '*'.repeat(Math.max(value.length, 4));
  }

  return `${value.slice(0, 4)}${'*'.repeat(Math.max(value.length - 8, 4))}${value.slice(-4)}`;
}

function readCurrentYouTubeEnvSnapshot(): YouTubeEnvSnapshot {
  for (const key of YOUTUBE_ENV_KEYS) {
    const value = sanitizeApiKey(process.env[key]);

    if (value) {
      return {
        sourceKey: key,
        value,
      };
    }
  }

  return {
    sourceKey: null,
    value: '',
  };
}

async function readPersistedAppSettings(): Promise<PersistedAppSettings> {
  if (!settingsFilePath) {
    return {};
  }

  try {
    const rawContent = await fs.readFile(settingsFilePath, 'utf8');
    const parsed = JSON.parse(rawContent) as PersistedAppSettings;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

async function writePersistedAppSettings(settings: PersistedAppSettings): Promise<void> {
  if (!settingsFilePath) {
    throw new Error('La ruta de configuracion local aun no fue inicializada.');
  }

  await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
  await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
}

function restoreInitialYouTubeApiKey(): void {
  if (initialYouTubeEnvSnapshot.sourceKey === 'YOUTUBE_API_KEY') {
    process.env.YOUTUBE_API_KEY = initialYouTubeEnvSnapshot.value;
    return;
  }

  delete process.env.YOUTUBE_API_KEY;
}

function buildYouTubeApiKeyState(): YouTubeApiKeyState {
  const currentSnapshot = readCurrentYouTubeEnvSnapshot();
  const hasConfiguredKey = Boolean(currentSnapshot.value);
  const source = hasConfiguredKey ? activeYouTubeApiKeySource : 'none';
  const maskedValue = hasConfiguredKey ? maskApiKey(currentSnapshot.value) : '';

  if (source === 'stored') {
    return {
      hasConfiguredKey: true,
      hasStoredApiKey: true,
      source,
      message: `La API key de YouTube esta guardada localmente en este equipo (${maskedValue}).`,
    };
  }

  if (source === 'env') {
    return {
      hasConfiguredKey: true,
      hasStoredApiKey: Boolean(storedYouTubeApiKey),
      source,
      message: `La API key de YouTube se esta leyendo desde .env o variables de entorno (${maskedValue}).`,
    };
  }

  return {
    hasConfiguredKey: false,
    hasStoredApiKey: Boolean(storedYouTubeApiKey),
    source: 'none',
    message: 'Pega aqui la API key de YouTube y guardala solo en este equipo para habilitar la busqueda oficial.',
  };
}

export async function initializeAppSettings(userDataDir: string): Promise<void> {
  settingsFilePath = path.join(userDataDir, 'app-settings.json');
  initialYouTubeEnvSnapshot = readCurrentYouTubeEnvSnapshot();
  activeYouTubeApiKeySource = initialYouTubeEnvSnapshot.value ? 'env' : 'none';

  const persistedSettings = await readPersistedAppSettings();
  storedYouTubeApiKey = sanitizeApiKey(persistedSettings.youtubeApiKey);

  if (storedYouTubeApiKey) {
    process.env.YOUTUBE_API_KEY = storedYouTubeApiKey;
    activeYouTubeApiKeySource = 'stored';
  }
}

export function getYouTubeApiKeyState(): YouTubeApiKeyState {
  return buildYouTubeApiKeyState();
}

export async function saveStoredYouTubeApiKey(apiKey: string): Promise<YouTubeApiKeyState> {
  const sanitizedApiKey = sanitizeApiKey(apiKey);

  if (!sanitizedApiKey) {
    throw new Error('Pega una API key de YouTube antes de guardarla.');
  }

  const persistedSettings = await readPersistedAppSettings();
  persistedSettings.youtubeApiKey = sanitizedApiKey;
  await writePersistedAppSettings(persistedSettings);

  storedYouTubeApiKey = sanitizedApiKey;
  process.env.YOUTUBE_API_KEY = sanitizedApiKey;
  activeYouTubeApiKeySource = 'stored';

  return buildYouTubeApiKeyState();
}

export async function clearStoredYouTubeApiKey(): Promise<YouTubeApiKeyState> {
  const persistedSettings = await readPersistedAppSettings();

  delete persistedSettings.youtubeApiKey;
  await writePersistedAppSettings(persistedSettings);

  storedYouTubeApiKey = '';
  restoreInitialYouTubeApiKey();
  activeYouTubeApiKeySource = initialYouTubeEnvSnapshot.value ? 'env' : 'none';

  return buildYouTubeApiKeyState();
}
