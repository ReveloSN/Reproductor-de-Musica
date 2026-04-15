class TranslationService {
  constructor() {
    this.translationLibrary = new Map();
  }

  normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  buildLookupKeys(song) {
    if (!song) {
      return [];
    }

    const keys = [
      this.normalizeText(`${song.artist} ${song.title}`),
      this.normalizeText(song.title),
      this.normalizeText(song.name),
    ].filter(Boolean);

    return Array.from(new Set(keys));
  }

  async getTranslation(song, lyricsResult) {
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

    for (const lookupKey of lookupKeys) {
      if (this.translationLibrary.has(lookupKey)) {
        return {
          status: 'available',
          translation: this.translationLibrary.get(lookupKey),
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
