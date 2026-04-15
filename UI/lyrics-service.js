class LyricsService {
  constructor() {
    this.lyricsLibrary = new Map();
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

  async getLyrics(song) {
    if (!song) {
      return {
        status: 'empty',
        lyrics: '',
        message: 'No hay una cancion activa para buscar letra.',
      };
    }

    const lookupKeys = this.buildLookupKeys(song);

    for (const lookupKey of lookupKeys) {
      if (this.lyricsLibrary.has(lookupKey)) {
        return {
          status: 'available',
          lyrics: this.lyricsLibrary.get(lookupKey),
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
