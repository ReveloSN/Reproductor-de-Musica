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

    return {
      status: 'empty',
      lyrics: '',
      message: 'No se encontro letra para esta cancion',
      lookupKey: lookupKeys[0] || '',
    };
  }
}

window.LyricsService = LyricsService;
