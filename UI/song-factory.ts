interface SongFactoryOptions {
  audioAPI: AudioAPI;
  supportedExtensions: Set<string>;
  artworkPairs: ArtworkPalette[];
  formatDuration: (seconds: number) => string;
  onMetadataResolved: () => void;
}

interface ParsedSongLabel {
  artist: string;
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

  createSongsFromPaths(
    filePaths: string[],
    playlistManager: PlaylistManager
  ): SongCollectionResult {
    const songs = filePaths
      .map((filePath) => this.buildSong(filePath))
      .filter((song): song is Track => song !== null)
      .map((song) => playlistManager.getOrCreateSong(song));

    return {
      songs,
      ignoredFiles: filePaths.length - songs.length,
    };
  }

  buildSong(filePath: string): Track | null {
    const extension = this.audioAPI.extname(filePath).toLowerCase();

    if (!this.supportedExtensions.has(extension)) {
      return null;
    }

    const fileName = this.audioAPI.basename(filePath);
    const parsedSong = this.parseSongLabel(fileName, extension);
    const artwork = this.createArtworkPalette(`${parsedSong.title}-${filePath}`);

    return {
      id: `song-${Date.now()}-${this.songIdCounter++}`,
      name: fileName,
      title: parsedSong.title,
      artist: parsedSong.artist,
      path: filePath,
      url: this.audioAPI.filePathToUrl(filePath),
      extension: extension.replace('.', '').toUpperCase(),
      durationSeconds: null,
      durationText: '--:--',
      artwork,
      initials: this.getInitials(parsedSong.title),
      sourceLabel: 'Archivo local',
      isFavorite: false,
    };
  }

  parseSongLabel(fileName: string, extension: string): ParsedSongLabel {
    const nameWithoutExtension = fileName.slice(0, fileName.length - extension.length);
    const cleaned = nameWithoutExtension.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(' - ').map((part) => part.trim()).filter(Boolean);

    if (parts.length >= 2) {
      return {
        artist: parts[0],
        title: parts.slice(1).join(' - '),
      };
    }

    return {
      artist: 'Archivo local',
      title: cleaned || fileName,
    };
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
