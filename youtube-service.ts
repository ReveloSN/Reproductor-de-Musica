const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_WATCH_URL = 'https://www.youtube.com/watch?v=';
const YOUTUBE_SEARCH_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RESULTS = 10;

interface GoogleApiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      message?: string;
      reason?: string;
    }>;
  };
}

interface YouTubeSearchListResponse {
  items?: Array<{
    id?: {
      videoId?: string;
    };
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
  }>;
}

interface YouTubeVideosListResponse {
  items?: Array<{
    id?: string;
    contentDetails?: {
      duration?: string;
    };
    status?: {
      embeddable?: boolean;
    };
  }>;
}

interface YouTubeServiceError extends Error {
  reason?: string;
  status?: number;
}

function getYouTubeApiKey(): string {
  const candidates = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_DATA_API_KEY,
    process.env.GOOGLE_API_KEY,
  ];

  for (const candidate of candidates) {
    const key = String(candidate || '').trim();

    if (key) {
      return key;
    }
  }

  return '';
}

function sanitizeText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatDuration(seconds: number | null): string {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) {
    return '--:--';
  }

  const roundedSeconds = Math.floor(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function parseIsoDurationToSeconds(value: string | null | undefined): number | null {
  const match = String(value || '').match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i
  );

  if (!match) {
    return null;
  }

  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;

  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return controller.signal;
}

function createYouTubeServiceError(
  fallbackMessage: string,
  status?: number,
  payload?: GoogleApiErrorPayload | null
): YouTubeServiceError {
  const reason = payload?.error?.errors?.[0]?.reason || '';
  const message = payload?.error?.message || payload?.error?.errors?.[0]?.message || fallbackMessage;
  const error = new Error(message) as YouTubeServiceError;
  error.reason = reason;
  error.status = status;
  return error;
}

async function fetchYouTubeJson<T>(url: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: createTimeoutSignal(YOUTUBE_SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createYouTubeServiceError(`No fue posible conectar con YouTube: ${message}`);
  }

  const payload = (await response.json().catch(() => null)) as GoogleApiErrorPayload | null;

  if (!response.ok) {
    throw createYouTubeServiceError(`HTTP ${response.status}`, response.status, payload);
  }

  return payload as T;
}

function mapErrorMessage(error: unknown): string {
  const serviceError = error as YouTubeServiceError;
  const reason = String(serviceError?.reason || '').toLowerCase();

  if (
    reason === 'quotaexceeded' ||
    reason === 'dailylimitexceeded' ||
    reason === 'dailylimitexceededunreg' ||
    reason === 'rateLimitExceeded'.toLowerCase()
  ) {
    return 'La cuota de YouTube Data API se agotó. Intenta más tarde o revisa tu proyecto de Google Cloud.';
  }

  if (
    reason === 'keyinvalid' ||
    reason === 'apikeyinvalid' ||
    reason === 'ipreferernotallowed'
  ) {
    return 'La API key de YouTube no es válida para esta app. Revisa YOUTUBE_API_KEY y los permisos del proyecto.';
  }

  if (reason === 'accessnotconfigured' || reason === 'forbidden') {
    return 'La YouTube Data API no está habilitada para este proyecto de Google Cloud.';
  }

  if (serviceError?.message) {
    return `No fue posible consultar YouTube: ${serviceError.message}`;
  }

  return 'No fue posible consultar YouTube en este momento.';
}

function buildSearchUrl(query: string, maxResults: number): string {
  const params = new URLSearchParams();
  params.set('part', 'snippet');
  params.set('type', 'video');
  params.set('videoEmbeddable', 'true');
  params.set('videoSyndicated', 'true');
  params.set('videoCategoryId', '10');
  params.set('maxResults', String(Math.min(Math.max(maxResults, 1), 25)));
  params.set('q', query);
  params.set('key', getYouTubeApiKey());

  return `${YOUTUBE_API_BASE_URL}/search?${params.toString()}`;
}

function buildVideosUrl(videoIds: string[]): string {
  const params = new URLSearchParams();
  params.set('part', 'contentDetails,status');
  params.set('id', videoIds.join(','));
  params.set('key', getYouTubeApiKey());

  return `${YOUTUBE_API_BASE_URL}/videos?${params.toString()}`;
}

export function getYouTubeConfig(): YouTubeConfig {
  const apiKey = getYouTubeApiKey();

  if (!apiKey) {
    return {
      isConfigured: false,
      message:
        'Configura YOUTUBE_API_KEY, YOUTUBE_DATA_API_KEY o GOOGLE_API_KEY antes de usar la búsqueda de YouTube.',
    };
  }

  return {
    isConfigured: true,
    message: 'La búsqueda de YouTube está disponible con la API oficial.',
  };
}

export async function searchYouTubeVideos(
  rawQuery: string,
  maxResults = DEFAULT_MAX_RESULTS
): Promise<YouTubeSearchResponse> {
  const query = sanitizeText(rawQuery);
  const config = getYouTubeConfig();

  if (!config.isConfigured) {
    return {
      status: 'error',
      results: [],
      message: config.message,
      query,
    };
  }

  if (!query) {
    return {
      status: 'empty',
      results: [],
      message: 'Escribe una búsqueda para consultar YouTube.',
      query,
    };
  }

  try {
    const searchResponse = await fetchYouTubeJson<YouTubeSearchListResponse>(
      buildSearchUrl(query, maxResults)
    );
    const baseItems = Array.isArray(searchResponse.items) ? searchResponse.items : [];
    const videoIds = baseItems
      .map((item) => sanitizeText(item.id?.videoId))
      .filter(Boolean);

    if (videoIds.length === 0) {
      return {
        status: 'empty',
        results: [],
        message: 'No se encontraron videos embebibles para esa búsqueda.',
        query,
      };
    }

    const detailsResponse = await fetchYouTubeJson<YouTubeVideosListResponse>(buildVideosUrl(videoIds));
    const detailById = new Map(
      (Array.isArray(detailsResponse.items) ? detailsResponse.items : [])
        .filter((item) => sanitizeText(item.id))
        .map((item) => [sanitizeText(item.id), item])
    );

    const results = baseItems
      .map((item) => {
        const videoId = sanitizeText(item.id?.videoId);

        if (!videoId) {
          return null;
        }

        const detail = detailById.get(videoId);

        if (detail?.status?.embeddable === false) {
          return null;
        }

        const durationSeconds = parseIsoDurationToSeconds(detail?.contentDetails?.duration);
        const snippet = item.snippet;
        const thumbnailUrl =
          snippet?.thumbnails?.high?.url ||
          snippet?.thumbnails?.medium?.url ||
          snippet?.thumbnails?.default?.url ||
          null;

        return {
          videoId,
          title: sanitizeText(snippet?.title) || 'Video sin título',
          channelTitle: sanitizeText(snippet?.channelTitle) || 'Canal desconocido',
          description: sanitizeText(snippet?.description),
          publishedAt: sanitizeText(snippet?.publishedAt) || null,
          thumbnailUrl,
          durationSeconds,
          durationText: formatDuration(durationSeconds),
          youtubeUrl: `${YOUTUBE_WATCH_URL}${videoId}`,
        } satisfies YouTubeVideoSummary;
      })
      .filter((item): item is YouTubeVideoSummary => item !== null);

    if (results.length === 0) {
      return {
        status: 'empty',
        results: [],
        message: 'No se encontraron videos embebibles para esa búsqueda.',
        query,
      };
    }

    return {
      status: 'available',
      results,
      message: `${results.length} resultado(s) de YouTube listos para reproducir o agregar a playlists.`,
      query,
    };
  } catch (error) {
    return {
      status: 'error',
      results: [],
      message: mapErrorMessage(error),
      query,
    };
  }
}
