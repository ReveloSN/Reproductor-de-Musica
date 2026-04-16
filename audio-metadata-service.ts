type MusicMetadataModule = typeof import('music-metadata');
type IAudioMetadata = Awaited<ReturnType<MusicMetadataModule['parseFile']>>;

const DEFAULT_MIME_TYPE = 'image/jpeg';
let musicMetadataModulePromise: Promise<MusicMetadataModule> | null = null;

function getMusicMetadataModule(): Promise<MusicMetadataModule> {
  if (!musicMetadataModulePromise) {
    musicMetadataModulePromise = import('music-metadata');
  }

  return musicMetadataModulePromise;
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function normalizeDuration(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeTrackNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeGenre(value: string[] | string | null | undefined): string | null {
  if (Array.isArray(value)) {
    return normalizeText(value.filter(Boolean).join(', '));
  }

  return normalizeText(value);
}

function normalizeMimeType(value: string | null | undefined): string {
  const normalized = normalizeText(value);

  if (!normalized) {
    return DEFAULT_MIME_TYPE;
  }

  if (normalized.includes('/')) {
    return normalized.toLowerCase();
  }

  if (normalized === 'jpg' || normalized === 'jpeg') {
    return 'image/jpeg';
  }

  if (normalized === 'png') {
    return 'image/png';
  }

  if (normalized === 'webp') {
    return 'image/webp';
  }

  if (normalized === 'gif') {
    return 'image/gif';
  }

  return DEFAULT_MIME_TYPE;
}

function extractArtwork(metadata: IAudioMetadata): Pick<AudioFileMetadata, 'artworkDataUrl' | 'artworkMimeType'> {
  const pictures = metadata.common.picture || [];

  for (const picture of pictures) {
    if (!picture || !picture.data || picture.data.length === 0) {
      continue;
    }

    const mimeType = normalizeMimeType(picture.format);
    const base64 = Buffer.from(picture.data).toString('base64');

    return {
      artworkDataUrl: `data:${mimeType};base64,${base64}`,
      artworkMimeType: mimeType,
    };
  }

  return {
    artworkDataUrl: null,
    artworkMimeType: null,
  };
}

function createEmptyMetadata(): AudioFileMetadata {
  return {
    title: null,
    artist: null,
    album: null,
    durationSeconds: null,
    genre: null,
    trackNumber: null,
    artworkDataUrl: null,
    artworkMimeType: null,
  };
}

function mapAudioMetadata(metadata: IAudioMetadata): AudioFileMetadata {
  const artwork = extractArtwork(metadata);

  return {
    title: normalizeText(metadata.common.title),
    artist: normalizeText(metadata.common.artist || metadata.common.artists?.join(', ')),
    album: normalizeText(metadata.common.album),
    durationSeconds: normalizeDuration(metadata.format.duration),
    genre: normalizeGenre(metadata.common.genre),
    trackNumber: normalizeTrackNumber(metadata.common.track?.no),
    artworkDataUrl: artwork.artworkDataUrl,
    artworkMimeType: artwork.artworkMimeType,
  };
}

export async function readAudioMetadataFromBuffer(
  uint8Array: Uint8Array,
  fileInfo?: { mimeType?: string; path?: string; size?: number | null }
): Promise<AudioFileMetadata> {
  try {
    const musicMetadata = await getMusicMetadataModule();
    const metadata = await musicMetadata.parseBuffer(
      uint8Array,
      {
        mimeType: normalizeText(fileInfo?.mimeType) || undefined,
        path: normalizeText(fileInfo?.path) || undefined,
        size:
          typeof fileInfo?.size === 'number' && Number.isFinite(fileInfo.size) && fileInfo.size > 0
            ? fileInfo.size
            : undefined,
      },
      {
        duration: true,
        skipCovers: false,
      }
    );

    return mapAudioMetadata(metadata as IAudioMetadata);
  } catch (_error) {
    return createEmptyMetadata();
  }
}

export async function readAudioMetadata(filePath: string): Promise<AudioFileMetadata> {
  try {
    const musicMetadata = await getMusicMetadataModule();
    const metadata = await musicMetadata.parseFile(filePath, {
      duration: true,
      skipCovers: false,
    });
    return mapAudioMetadata(metadata);
  } catch (_error) {
    return createEmptyMetadata();
  }
}
