const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function getDefaultOpenAIModel(): string {
  return (
    String(process.env.OPENAI_PLAYLIST_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim() ||
    'gpt-4.1-mini'
  );
}

interface OpenAIErrorPayload {
  error?: {
    message?: string;
  };
}

function getOpenAIApiKey(): string {
  return String(process.env.OPENAI_API_KEY || '').trim();
}

function createTrackLabel(track: AIPlaylistCandidate): string {
  const parts = [track.title];

  if (track.artist) {
    parts.push(track.artist);
  }

  if (track.album) {
    parts.push(track.album);
  }

  return parts.join(' - ');
}

function buildPromptPayload(request: AIPlaylistGenerateRequest): string {
  const compactTracks = request.tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: track.genre,
    durationText: track.durationText,
    source: track.source,
    isFavorite: track.isFavorite,
    label: createTrackLabel(track),
  }));

  return JSON.stringify(
    {
      request: request.prompt,
      librarySize: compactTracks.length,
      tracks: compactTracks,
    },
    null,
    2
  );
}

function buildSystemInstructions(): string {
  return [
    'Eres un asistente musical para una app de escritorio.',
    'Debes crear una playlist usando solamente canciones de la biblioteca enviada.',
    'No inventes tracks, ids ni artistas que no aparezcan en la lista.',
    'Selecciona canciones que encajen bien con la peticion del usuario.',
    'Salvo que el usuario pida otra cosa, elige entre 6 y 18 canciones.',
    'Devuelve un nombre de playlist corto, claro y usable en espanol.',
    'La respuesta debe ser JSON valido y seguir exactamente el esquema solicitado.',
  ].join(' ');
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const payloadRecord = payload as Record<string, unknown>;
  const directOutputText = payloadRecord.output_text;

  if (typeof directOutputText === 'string' && directOutputText.trim()) {
    return directOutputText.trim();
  }

  const output = Array.isArray(payloadRecord.output) ? payloadRecord.output : [];

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];

    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      const partRecord = part as Record<string, unknown>;
      const candidateText = partRecord.text;

      if (typeof candidateText === 'string' && candidateText.trim()) {
        return candidateText.trim();
      }
    }
  }

  return '';
}

function parseGeneratedPlaylist(rawText: string): {
  playlistName: string;
  summary: string;
  selectedTrackIds: string[];
} | null {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const playlistName = String(parsed.playlistName || '').trim();
    const summary = String(parsed.summary || '').trim();
    const selectedTrackIds = Array.isArray(parsed.selectedTrackIds)
      ? parsed.selectedTrackIds
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [];

    if (!playlistName || !summary) {
      return null;
    }

    return {
      playlistName,
      summary,
      selectedTrackIds,
    };
  } catch (_error) {
    return null;
  }
}

function normalizeSelectedTrackIds(
  selectedTrackIds: string[],
  tracks: AIPlaylistCandidate[]
): string[] {
  const trackIds = new Set(tracks.map((track) => track.id));
  const uniqueIds: string[] = [];

  selectedTrackIds.forEach((trackId) => {
    if (!trackIds.has(trackId) || uniqueIds.includes(trackId)) {
      return;
    }

    uniqueIds.push(trackId);
  });

  return uniqueIds;
}

export function getAIPlaylistConfig(): AIPlaylistConfig {
  const apiKey = getOpenAIApiKey();
  const model = getDefaultOpenAIModel();

  if (!apiKey) {
    return {
      isConfigured: false,
      model,
      message:
        'Configura OPENAI_API_KEY en Railway o en las variables del servidor para habilitar playlists con IA.',
    };
  }

  return {
    isConfigured: true,
    model,
    message: `La generacion con IA esta disponible desde la configuracion del servidor (${model}).`,
  };
}

export async function generateAIPlaylist(
  request: AIPlaylistGenerateRequest
): Promise<AIPlaylistResult> {
  const apiKey = getOpenAIApiKey();
  const model = getDefaultOpenAIModel();
  const prompt = String(request.prompt || '').trim();
  const tracks = Array.isArray(request.tracks) ? request.tracks.filter(Boolean) : [];

  if (!apiKey) {
    return {
      status: 'error',
      playlistName: '',
      summary: '',
      trackIds: [],
      message: 'La IA no esta configurada en el servidor.',
    };
  }

  if (!prompt) {
    return {
      status: 'error',
      playlistName: '',
      summary: '',
      trackIds: [],
      message: 'Escribe una descripcion para generar la playlist.',
    };
  }

  if (tracks.length === 0) {
    return {
      status: 'error',
      playlistName: '',
      summary: '',
      trackIds: [],
      message: 'No hay canciones cargadas en la biblioteca para que la IA pueda elegir.',
    };
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: buildSystemInstructions(),
        },
        {
          role: 'user',
          content: [
            'Genera una playlist para la siguiente peticion.',
            'Devuelve JSON con las claves playlistName, summary y selectedTrackIds.',
            'selectedTrackIds debe incluir solamente ids existentes en la biblioteca.',
            buildPromptPayload({ prompt, tracks }),
          ].join('\n\n'),
        },
      ],
      max_output_tokens: 1200,
      text: {
        format: {
          type: 'json_schema',
          name: 'playlist_selection',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              playlistName: {
                type: 'string',
              },
              summary: {
                type: 'string',
              },
              selectedTrackIds: {
                type: 'array',
                items: {
                  type: 'string',
                },
                maxItems: 24,
              },
            },
            required: ['playlistName', 'summary', 'selectedTrackIds'],
          },
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAIErrorPayload & Record<string, unknown>;

  if (!response.ok) {
    const errorMessage =
      payload.error?.message ||
      `OpenAI devolvio un error HTTP ${response.status}.`;

    return {
      status: 'error',
      playlistName: '',
      summary: '',
      trackIds: [],
      message: errorMessage,
    };
  }

  const rawText = extractResponseText(payload);
  const parsed = parseGeneratedPlaylist(rawText);

  if (!parsed) {
    return {
      status: 'error',
      playlistName: '',
      summary: '',
      trackIds: [],
      message: 'La IA respondio en un formato no valido para crear la playlist.',
    };
  }

  const normalizedTrackIds = normalizeSelectedTrackIds(parsed.selectedTrackIds, tracks);

  if (normalizedTrackIds.length === 0) {
    return {
      status: 'empty',
      playlistName: parsed.playlistName,
      summary: parsed.summary,
      trackIds: [],
      message: 'La IA no encontro canciones adecuadas dentro de tu biblioteca actual.',
    };
  }

  return {
    status: 'available',
    playlistName: parsed.playlistName,
    summary: parsed.summary,
    trackIds: normalizedTrackIds,
    message: `La IA selecciono ${normalizedTrackIds.length} cancion(es) para tu playlist.`,
  };
}
