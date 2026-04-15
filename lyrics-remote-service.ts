const LRCLIB_BASE_URL = 'https://lrclib.net/api';
const LRCLIB_PROVIDER = 'LRCLIB';
const REQUEST_TIMEOUT_MS = 8000;

interface LrclibLyricsRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function normalizeLookupValue(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sanitizeText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildLookupKey(query: LyricsLookupQuery): string {
  return normalizeLookupValue(`${query.artist} ${query.title}`);
}

function stripSyncedTimestamps(value: string): string {
  return value
    .replace(/^\[[0-9]{1,2}:[0-9]{2}(?:\.[0-9]{1,2})?\]\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLyrics(record: LrclibLyricsRecord | null): string {
  if (!record) {
    return '';
  }

  const plainLyrics = String(record.plainLyrics || '').trim();

  if (plainLyrics) {
    return plainLyrics;
  }

  const syncedLyrics = String(record.syncedLyrics || '').trim();

  if (!syncedLyrics) {
    return '';
  }

  return stripSyncedTimestamps(syncedLyrics);
}

function isValidQuery(query: LyricsLookupQuery): boolean {
  return Boolean(normalizeLookupValue(query.title) && normalizeLookupValue(query.artist));
}

function createTimeoutSignal(): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  return controller.signal;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LocalAudioPlayer/1.0',
    },
    signal: createTimeoutSignal(),
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

function buildParams(query: LyricsLookupQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('track_name', sanitizeText(query.title));
  params.set('artist_name', sanitizeText(query.artist));

  if (sanitizeText(query.album)) {
    params.set('album_name', sanitizeText(query.album));
  }

  if (typeof query.durationSeconds === 'number' && Number.isFinite(query.durationSeconds) && query.durationSeconds > 0) {
    params.set('duration', String(Math.round(query.durationSeconds)));
  }

  return params;
}

function scoreRecord(record: LrclibLyricsRecord, query: LyricsLookupQuery): number {
  const normalizedTrack = normalizeLookupValue(record.trackName);
  const normalizedArtist = normalizeLookupValue(record.artistName);
  const normalizedAlbum = normalizeLookupValue(record.albumName);
  const normalizedQueryTitle = normalizeLookupValue(query.title);
  const normalizedQueryArtist = normalizeLookupValue(query.artist);
  const normalizedQueryAlbum = normalizeLookupValue(query.album);
  let score = 0;

  if (record.instrumental) {
    score -= 100;
  }

  if (normalizedTrack === normalizedQueryTitle) {
    score += 50;
  } else if (normalizedTrack.includes(normalizedQueryTitle) || normalizedQueryTitle.includes(normalizedTrack)) {
    score += 25;
  }

  if (normalizedArtist === normalizedQueryArtist) {
    score += 40;
  } else if (normalizedArtist.includes(normalizedQueryArtist) || normalizedQueryArtist.includes(normalizedArtist)) {
    score += 20;
  }

  if (normalizedAlbum && normalizedQueryAlbum && normalizedAlbum === normalizedQueryAlbum) {
    score += 10;
  }

  if (typeof record.duration === 'number' && typeof query.durationSeconds === 'number') {
    const difference = Math.abs(record.duration - query.durationSeconds);

    if (difference <= 2) {
      score += 12;
    } else if (difference <= 8) {
      score += 6;
    }
  }

  return score;
}

async function fetchDirectMatch(query: LyricsLookupQuery): Promise<LrclibLyricsRecord | null> {
  const params = buildParams(query);

  try {
    return await fetchJson<LrclibLyricsRecord>(`${LRCLIB_BASE_URL}/get?${params.toString()}`);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;

    if (status === 404) {
      return null;
    }

    throw error;
  }
}

async function fetchSearchMatch(query: LyricsLookupQuery): Promise<LrclibLyricsRecord | null> {
  const params = buildParams(query);
  const records = await fetchJson<LrclibLyricsRecord[]>(`${LRCLIB_BASE_URL}/search?${params.toString()}`);

  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }

  return [...records]
    .sort((left, right) => scoreRecord(right, query) - scoreRecord(left, query))[0] || null;
}

export async function fetchLyricsFromRemote(query: LyricsLookupQuery): Promise<LyricsResult> {
  if (!isValidQuery(query)) {
    return {
      status: 'empty',
      lyrics: '',
      message: 'No hay informacion suficiente para consultar una API de letras.',
      lookupKey: buildLookupKey(query),
      provider: LRCLIB_PROVIDER,
    };
  }

  try {
    const directMatch = await fetchDirectMatch(query);
    const resolvedRecord = directMatch || (await fetchSearchMatch(query));
    const lyrics = extractLyrics(resolvedRecord);

    if (!lyrics) {
      return {
        status: 'empty',
        lyrics: '',
        message: 'No se encontro letra para esta cancion',
        lookupKey: buildLookupKey(query),
        provider: LRCLIB_PROVIDER,
      };
    }

    return {
      status: 'available',
      lyrics,
      message: '',
      lookupKey: buildLookupKey(query),
      provider: LRCLIB_PROVIDER,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      status: 'error',
      lyrics: '',
      message: `No fue posible consultar ${LRCLIB_PROVIDER}: ${message}`,
      lookupKey: buildLookupKey(query),
      provider: LRCLIB_PROVIDER,
    };
  }
}
