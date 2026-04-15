const DEFAULT_LYRICS_LIBRARY: Record<string, string> = {};

class LyricsService {
  lyricsLibrary: Map<string, string>;

  constructor() {
    this.lyricsLibrary = new Map();
    this.registerEntries(DEFAULT_LYRICS_LIBRARY);
  }

  registerEntries(entries: Record<string, string>): void {
    Object.entries(entries).forEach(([lookupKey, lyrics]) => {
      this.registerEntry(lookupKey, lyrics);
    });
  }

  registerEntry(lookupKey: string, lyrics: string): void {
    const normalizedLookupKey = window.SongLookupUtils.normalizeText(lookupKey);
    const sanitizedLyrics = String(lyrics || '').trim();

    if (normalizedLookupKey && sanitizedLyrics) {
      this.lyricsLibrary.set(normalizedLookupKey, sanitizedLyrics);
    }
  }

  buildLookupKeys(song: Track | null): string[] {
    return window.SongLookupUtils.buildLookupKeys(song);
  }

  private buildRemoteQuery(song: Track): LyricsLookupQuery | null {
    const title = window.SongLookupUtils.getDisplayTitle(song);
    const artist = window.SongLookupUtils.getDisplayArtist(song);

    if (!title || !artist) {
      return null;
    }

    return {
      title,
      artist,
      album: song.album,
      durationSeconds: song.durationSeconds,
    };
  }

  async getLyrics(song: Track | null): Promise<LyricsResult> {
    if (!song) {
      return {
        status: 'empty',
        lyrics: '',
        message: 'No hay una cancion activa para buscar letra.',
      };
    }

    const lookupKeys = this.buildLookupKeys(song);

    if (lookupKeys.length === 0) {
      return {
        status: 'empty',
        lyrics: '',
        message: 'No se encontro informacion suficiente para buscar la letra.',
      };
    }

    for (const lookupKey of lookupKeys) {
      if (this.lyricsLibrary.has(lookupKey)) {
        return {
          status: 'available',
          lyrics: this.lyricsLibrary.get(lookupKey) || '',
          message: '',
          lookupKey,
        };
      }
    }

    const remoteQuery = this.buildRemoteQuery(song);

    if (!remoteQuery) {
      return {
        status: 'empty',
        lyrics: '',
        message: 'No se encontro informacion suficiente para buscar la letra.',
        lookupKey: lookupKeys[0] || '',
      };
    }

    if (!window.audioAPI) {
      return {
        status: 'error',
        lyrics: '',
        message: 'La integracion de Electron no esta disponible para consultar letras.',
        lookupKey: lookupKeys[0] || '',
      };
    }

    const remoteResult = await window.audioAPI.fetchLyrics(remoteQuery);

    if (remoteResult.status === 'available' && remoteResult.lyrics) {
      this.registerEntry(remoteResult.lookupKey || lookupKeys[0] || '', remoteResult.lyrics);

      lookupKeys.forEach((lookupKey) => {
        this.registerEntry(lookupKey, remoteResult.lyrics);
      });
    }

    return {
      ...remoteResult,
      lookupKey: remoteResult.lookupKey || lookupKeys[0] || '',
    };
  }
}

window.LyricsService = LyricsService;
