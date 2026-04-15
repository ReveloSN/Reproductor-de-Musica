const DEFAULT_TRANSLATION_LIBRARY: Record<string, string> = {};

class TranslationService {
  translationLibrary: Map<string, string>;

  constructor() {
    this.translationLibrary = new Map();
    this.registerEntries(DEFAULT_TRANSLATION_LIBRARY);
  }

  registerEntries(entries: Record<string, string>): void {
    Object.entries(entries).forEach(([lookupKey, translation]) => {
      this.registerEntry(lookupKey, translation);
    });
  }

  registerEntry(lookupKey: string, translation: string): void {
    const normalizedLookupKey = window.SongLookupUtils.normalizeText(lookupKey);
    const sanitizedTranslation = String(translation || '').trim();

    if (normalizedLookupKey && sanitizedTranslation) {
      this.translationLibrary.set(normalizedLookupKey, sanitizedTranslation);
    }
  }

  buildLookupKeys(song: Track | null): string[] {
    return window.SongLookupUtils.buildLookupKeys(song);
  }

  async getTranslation(song: Track | null, lyricsResult: LyricsResult): Promise<TranslationResult> {
    if (!song) {
      return {
        status: 'empty',
        translation: '',
        message: 'No hay una cancion activa para traducir.',
      };
    }

    if (!lyricsResult || lyricsResult.status !== 'available') {
      return {
        status: 'empty',
        translation: '',
        message: 'No hay traduccion disponible para esta cancion',
      };
    }

    const lookupKeys = this.buildLookupKeys(song);

    if (lookupKeys.length === 0) {
      return {
        status: 'empty',
        translation: '',
        message: 'No hay datos suficientes para buscar una traduccion.',
      };
    }

    for (const lookupKey of lookupKeys) {
      if (this.translationLibrary.has(lookupKey)) {
        return {
          status: 'available',
          translation: this.translationLibrary.get(lookupKey) || '',
          message: '',
          lookupKey,
        };
      }
    }

    return {
      status: 'empty',
      translation: '',
      message: 'No hay traduccion disponible para esta cancion',
      lookupKey: lookupKeys[0] || '',
    };
  }
}

window.TranslationService = TranslationService;
