interface SongFactoryOptions {
  audioAPI: AudioAPI;
  supportedExtensions: Set<string>;
  artworkPairs: ArtworkPalette[];
  formatDuration: (seconds: number) => string;
  onMetadataResolved: () => void;
}

interface ParsedSongLabel {
  artist: string | null;
  title: string;
}

interface SongCollectionResult {
  songs: Track[];
  ignoredFiles: number;
}

class SongFactory {
  audioAPI: AudioAPI;
  supportedExtensions: Set<string>;
  artworkPairs: ArtworkPalette[];
  formatDuration: (seconds: number) => string;
  onMetadataResolved: () => void;
  songIdCounter: number;

  constructor(options: SongFactoryOptions) {
    this.audioAPI = options.audioAPI;
    this.supportedExtensions = options.supportedExtensions;
    this.artworkPairs = options.artworkPairs;
    this.formatDuration = options.formatDuration;
    this.onMetadataResolved = options.onMetadataResolved;
    this.songIdCounter = 0;
  }

  async createSongsFromPaths(
    filePaths: string[],
    playlistManager: PlaylistManager
  ): Promise<SongCollectionResult> {
    const builtSongs: Array<Track | null> = [];

    for (const filePath of filePaths) {
      builtSongs.push(await this.buildSong(filePath));
    }

    const songs = builtSongs
      .filter((song): song is Track => song !== null)
      .map((song) => playlistManager.getOrCreateSong(song));

    return {
      songs,
      ignoredFiles: filePaths.length - songs.length,
    };
  }

  async buildSong(filePath: string): Promise<Track | null> {
    const extension = this.audioAPI.extname(filePath).toLowerCase();

    if (!this.supportedExtensions.has(extension)) {
      return null;
    }

    const fileName = this.audioAPI.basename(filePath);
    const parsedSong = this.parseSongLabel(fileName, extension);
    const metadata = await this.audioAPI.readAudioMetadata(filePath);
    const title = this.resolveTitle(metadata.title, parsedSong.title, fileName);
    const artist = this.resolveArtist(metadata.artist, parsedSong.artist);
    const artwork = this.createArtworkPalette(`${artist}-${title}-${filePath}`);
    const durationSeconds = metadata.durationSeconds;

    return {
      id: `song-${Date.now()}-${this.songIdCounter++}`,
      name: fileName,
      fileName,
      title,
      artist,
      album: this.sanitizeOptionalText(metadata.album),
      path: filePath,
      filePath,
      url: this.audioAPI.filePathToUrl(filePath),
      extension: extension.replace('.', '').toUpperCase(),
      durationSeconds,
      durationText: durationSeconds ? this.formatDuration(durationSeconds) : '--:--',
      artwork,
      artworkDataUrl: metadata.artworkDataUrl,
      artworkMimeType: metadata.artworkMimeType,
      initials: this.getInitials(title || fileName),
      genre: this.sanitizeOptionalText(metadata.genre),
      trackNumber: metadata.trackNumber,
      sourceLabel: 'Archivo local',
      isFavorite: false,
    };
  }

  parseSongLabel(fileName: string, extension: string): ParsedSongLabel {
    const nameWithoutExtension = this.stripExtension(fileName, extension);
    const cleaned = this.cleanFileLabel(nameWithoutExtension);
    const parts = cleaned.split(' - ').map((part) => part.trim()).filter(Boolean);

    if (parts.length >= 2) {
      return {
        artist: this.sanitizeOptionalText(parts[0]),
        title: parts.slice(1).join(' - '),
      };
    }

    return {
      artist: null,
      title: cleaned || this.stripExtension(fileName),
    };
  }

  cleanFileLabel(value: string): string {
    return String(value || '')
      .replace(/[_]+/g, ' ')
      .replace(/^\s*\d{1,3}[\s\-_.]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  sanitizeOptionalText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned || null;
  }

  stripExtension(fileName: string, extension = ''): string {
    if (extension && fileName.toLowerCase().endsWith(extension.toLowerCase())) {
      return fileName.slice(0, fileName.length - extension.length);
    }

    return fileName.replace(/\.[^.]+$/, '');
  }

  resolveTitle(metadataTitle: string | null, parsedTitle: string, fileName: string): string {
    const preferredTitle = this.sanitizeOptionalText(metadataTitle);

    if (preferredTitle) {
      return preferredTitle;
    }

    const fallbackTitle = this.sanitizeOptionalText(parsedTitle);

    if (fallbackTitle) {
      return fallbackTitle;
    }

    return this.stripExtension(fileName) || fileName;
  }

  resolveArtist(metadataArtist: string | null, parsedArtist: string | null): string {
    const preferredArtist = this.sanitizeOptionalText(metadataArtist);

    if (preferredArtist) {
      return preferredArtist;
    }

    const fallbackArtist = this.sanitizeOptionalText(parsedArtist);

    if (fallbackArtist) {
      return fallbackArtist;
    }

    return 'Artista desconocido';
  }

  createArtworkPalette(seed: string): ArtworkPalette {
    let hash = 0;

    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(index);
      hash |= 0;
    }

    return this.artworkPairs[Math.abs(hash) % this.artworkPairs.length];
  }

  getInitials(title: string): string {
    const words = String(title)
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      return 'LP';
    }

    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  probeSongMetadata(song: Track): void {
    const metadataAudio = new Audio();

    metadataAudio.preload = 'metadata';

    const cleanUp = (): void => {
      metadataAudio.removeAttribute('src');
      metadataAudio.load();
    };

    metadataAudio.addEventListener(
      'loadedmetadata',
      () => {
        if (Number.isFinite(metadataAudio.duration)) {
          song.durationSeconds = metadataAudio.duration;
          song.durationText = this.formatDuration(metadataAudio.duration);
          this.onMetadataResolved();
        }

        cleanUp();
      },
      { once: true }
    );

    metadataAudio.addEventListener(
      'error',
      () => {
        cleanUp();
      },
      { once: true }
    );

    metadataAudio.src = song.url;
  }
}

window.SongFactory = SongFactory;
