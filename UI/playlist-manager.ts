interface CreatePlaylistOptions {
  id?: string;
  system?: boolean;
  favorites?: boolean;
}

interface CreatePlaylistResult<TTrack extends Track = Track> {
  ok: boolean;
  playlist?: PlaylistRecord<TTrack>;
  error?: string;
}

interface AddSongsResult<TTrack extends Track = Track> {
  added: TTrack[];
  duplicates: TTrack[];
}

class PlaylistManager<TTrack extends Track = Track> {
  PlaylistClass: new () => DoublyLinkedPlaylist<TTrack>;
  playlists: Map<string, PlaylistRecord<TTrack>>;
  playlistOrder: string[];
  songLibraryById: Map<string, TTrack>;
  songLibraryByPath: Map<string, TTrack>;
  activePlaylistId: string | null;

  constructor(PlaylistClass: new () => DoublyLinkedPlaylist<TTrack>) {
    this.PlaylistClass = PlaylistClass;
    this.playlists = new Map();
    this.playlistOrder = [];
    this.songLibraryById = new Map();
    this.songLibraryByPath = new Map();
    this.activePlaylistId = null;

    this.createPlaylist('Playlist principal', {
      id: 'main',
      system: false,
    });
    this.createPlaylist('Mis favoritos', {
      id: 'favorites',
      system: true,
      favorites: true,
    });
    this.setActivePlaylist('main');
  }

  normalizeName(name: string): string {
    return String(name || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  generatePlaylistId(name: string): string {
    const normalized = this.normalizeName(name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const baseId = normalized || 'playlist';
    let nextId = baseId;
    let suffix = 2;

    while (this.playlists.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    return nextId;
  }

  nameExists(name: string): boolean {
    const normalized = this.normalizeName(name).toLowerCase();

    return this.getPlaylists().some((playlist) => playlist.name.toLowerCase() === normalized);
  }

  createPlaylist(name: string, options: CreatePlaylistOptions = {}): CreatePlaylistResult<TTrack> {
    const normalizedName = this.normalizeName(name);

    if (!normalizedName) {
      return {
        ok: false,
        error: 'Escribe un nombre valido para la playlist.',
      };
    }

    if (!options.id && this.nameExists(normalizedName)) {
      return {
        ok: false,
        error: `Ya existe una playlist llamada "${normalizedName}".`,
      };
    }

    const playlistId = options.id || this.generatePlaylistId(normalizedName);
    const playlistRecord: PlaylistRecord<TTrack> = {
      id: playlistId,
      name: normalizedName,
      list: new this.PlaylistClass(),
      isSystem: Boolean(options.system),
      isFavorites: Boolean(options.favorites),
    };

    this.playlists.set(playlistId, playlistRecord);
    this.playlistOrder.push(playlistId);

    return {
      ok: true,
      playlist: playlistRecord,
    };
  }

  getPlaylists(): PlaylistRecord<TTrack>[] {
    return this.playlistOrder
      .map((playlistId) => this.playlists.get(playlistId) || null)
      .filter((playlist): playlist is PlaylistRecord<TTrack> => Boolean(playlist));
  }

  getPlaylist(playlistId: string): PlaylistRecord<TTrack> | null {
    return this.playlists.get(playlistId) || null;
  }

  getFavoritesPlaylist(): PlaylistRecord<TTrack> | null {
    return this.getPlaylist('favorites');
  }

  getActivePlaylist(): PlaylistRecord<TTrack> | null {
    return this.activePlaylistId ? this.getPlaylist(this.activePlaylistId) : null;
  }

  setActivePlaylist(playlistId: string): boolean {
    if (!this.playlists.has(playlistId)) {
      return false;
    }

    this.activePlaylistId = playlistId;
    return true;
  }

  getSongById(songId: string): TTrack | null {
    return this.songLibraryById.get(songId) || null;
  }

  getOrCreateSong(songData: TTrack): TTrack {
    const existingSong = this.songLibraryByPath.get(songData.path);

    if (existingSong) {
      existingSong.name = songData.name || existingSong.name;
      existingSong.fileName = songData.fileName || existingSong.fileName;
      existingSong.path = songData.path || existingSong.path;
      existingSong.filePath = songData.filePath || existingSong.filePath;
      existingSong.url = songData.url || existingSong.url;
      existingSong.title = songData.title || existingSong.title;
      existingSong.artist = songData.artist || existingSong.artist;
      existingSong.album = songData.album || existingSong.album;
      existingSong.sourceLabel = songData.sourceLabel || existingSong.sourceLabel;
      existingSong.extension = songData.extension || existingSong.extension;
      existingSong.initials = songData.initials || existingSong.initials;
      existingSong.artwork = songData.artwork || existingSong.artwork;
      existingSong.artworkDataUrl = songData.artworkDataUrl || existingSong.artworkDataUrl;
      existingSong.artworkMimeType = songData.artworkMimeType || existingSong.artworkMimeType;
      existingSong.genre = songData.genre || existingSong.genre;
      existingSong.trackNumber = songData.trackNumber || existingSong.trackNumber;

      if (Number.isFinite(songData.durationSeconds)) {
        existingSong.durationSeconds = songData.durationSeconds;
        existingSong.durationText = songData.durationText;
      }

      return existingSong;
    }

    const canonicalSong = {
      ...songData,
      isFavorite: Boolean(songData.isFavorite),
    };

    this.songLibraryById.set(canonicalSong.id, canonicalSong);
    this.songLibraryByPath.set(canonicalSong.path, canonicalSong);

    return canonicalSong;
  }

  findSongIndex(playlistId: string, songId: string): number {
    const playlist = this.getPlaylist(playlistId);

    if (!playlist) {
      return -1;
    }

    return playlist.list.toArray().findIndex((song) => song.id === songId);
  }

  hasSong(playlistId: string, songId: string): boolean {
    return this.findSongIndex(playlistId, songId) !== -1;
  }

  addSongToPlaylist(playlistId: string, song: TTrack | null, position: number | null = null): boolean {
    const playlist = this.getPlaylist(playlistId);

    if (!playlist || !song || this.hasSong(playlistId, song.id)) {
      return false;
    }

    if (position === null || position >= playlist.list.length) {
      playlist.list.addLast(song);
      return true;
    }

    if (position <= 0) {
      playlist.list.addFirst(song);
      return true;
    }

    playlist.list.addAt(song, position);
    return true;
  }

  addSongsToPlaylist(
    playlistId: string,
    songs: TTrack[],
    { mode = 'end', position = null }: { mode?: 'start' | 'end' | 'position'; position?: number | null } = {}
  ): AddSongsResult<TTrack> {
    const added: TTrack[] = [];
    const duplicates: TTrack[] = [];

    if (mode === 'start') {
      for (let index = songs.length - 1; index >= 0; index -= 1) {
        const song = songs[index];

        if (this.addSongToPlaylist(playlistId, song, 0)) {
          added.unshift(song);
        } else {
          duplicates.unshift(song);
        }
      }

      return { added, duplicates };
    }

    if (mode === 'position') {
      let nextPosition = Number.isInteger(position) ? (position as number) : 0;

      songs.forEach((song) => {
        if (this.addSongToPlaylist(playlistId, song, nextPosition)) {
          added.push(song);
          nextPosition += 1;
        } else {
          duplicates.push(song);
        }
      });

      return { added, duplicates };
    }

    songs.forEach((song) => {
      if (this.addSongToPlaylist(playlistId, song)) {
        added.push(song);
      } else {
        duplicates.push(song);
      }
    });

    return { added, duplicates };
  }

  removeSongFromPlaylist(playlistId: string, songId: string): TTrack | null {
    const playlist = this.getPlaylist(playlistId);
    const songIndex = this.findSongIndex(playlistId, songId);

    if (!playlist || songIndex === -1) {
      return null;
    }

    return playlist.list.removeAt(songIndex);
  }

  setCurrentSongById(playlistId: string, songId: string): TTrack | null {
    const playlist = this.getPlaylist(playlistId);
    const songIndex = this.findSongIndex(playlistId, songId);

    if (!playlist || songIndex === -1) {
      return null;
    }

    return playlist.list.setCurrentByPosition(songIndex);
  }

  toggleFavorite(songId: string): TTrack | null {
    const song = this.getSongById(songId);

    if (!song) {
      return null;
    }

    song.isFavorite = !song.isFavorite;
    this.syncFavoritesMembership(song);
    return song;
  }

  setFavorite(songId: string, value: boolean): TTrack | null {
    const song = this.getSongById(songId);

    if (!song) {
      return null;
    }

    song.isFavorite = Boolean(value);
    this.syncFavoritesMembership(song);
    return song;
  }

  syncFavoritesMembership(song: TTrack): void {
    const favoritesPlaylist = this.getFavoritesPlaylist();

    if (!favoritesPlaylist) {
      return;
    }

    const favoritesIndex = this.findSongIndex(favoritesPlaylist.id, song.id);

    if (song.isFavorite && favoritesIndex === -1) {
      favoritesPlaylist.list.addLast(song);
      return;
    }

    if (!song.isFavorite && favoritesIndex !== -1) {
      favoritesPlaylist.list.removeAt(favoritesIndex);
    }
  }
}

window.PlaylistManager = PlaylistManager;
