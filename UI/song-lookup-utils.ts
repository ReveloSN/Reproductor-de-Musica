class SongLookupUtils {
  static genericArtistLabels = new Set([
    'archivo local',
    'local file',
    'unknown artist',
    'desconocido',
    'sin artista',
  ]);

  static normalizeText(value: string): string {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  static stripExtension(fileName: string): string {
    return String(fileName || '').replace(/\.[^.]+$/, '').trim();
  }

  static stripNoise(value: string): string {
    return String(value || '')
      .replace(/[_]+/g, ' ')
      .replace(/^\s*\d{1,3}[\s\-_.]+/, '')
      .replace(
        /[\[(](official video|official audio|lyric video|lyrics?|audio oficial|video oficial|remaster(?:ed)?(?: \d{4})?|live|hd|4k|explicit|clean)[\])]/gi,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  static getDisplayFileName(song: Track | null): string {
    if (!song) {
      return '';
    }

    return this.stripNoise(this.stripExtension(song.name || song.title || ''));
  }

  static getDisplayTitle(song: Track | null): string {
    if (!song) {
      return 'Sin cancion activa';
    }

    const cleanedTitle = this.stripNoise(song.title || '');

    if (cleanedTitle) {
      return cleanedTitle;
    }

    const fileName = this.getDisplayFileName(song);

    return fileName || song.name || 'Sin titulo';
  }

  static hasMeaningfulArtist(song: Track | null): boolean {
    if (!song) {
      return false;
    }

    const normalizedArtist = this.normalizeText(this.stripNoise(song.artist || ''));
    return Boolean(normalizedArtist && !this.genericArtistLabels.has(normalizedArtist));
  }

  static getDisplayArtist(song: Track | null): string | null {
    if (!song || !this.hasMeaningfulArtist(song)) {
      return null;
    }

    return this.stripNoise(song.artist);
  }

  static buildLookupKeys(song: Track | null): string[] {
    if (!song) {
      return [];
    }

    const artist = this.getDisplayArtist(song);
    const title = this.getDisplayTitle(song);
    const fileName = this.getDisplayFileName(song);
    const candidates = [
      artist ? `${artist} ${title}` : '',
      artist ? `${artist} ${fileName}` : '',
      title,
      fileName,
      this.stripNoise(song.name),
      this.stripNoise(song.title),
      artist || '',
    ]
      .map((candidate) => this.normalizeText(candidate))
      .filter(Boolean);

    return Array.from(new Set(candidates));
  }
}

window.SongLookupUtils = SongLookupUtils;
