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
  songLibraryByKey: Map<string, TTrack>;
  activePlaylistId: string | null;

  constructor(PlaylistClass: new () => DoublyLinkedPlaylist<TTrack>) {
    this.PlaylistClass = PlaylistClass;
    this.playlists = new Map();
    this.playlistOrder = [];
    this.songLibraryById = new Map();
    this.songLibraryByKey = new Map();
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

  resetState(): void {
    this.playlists.clear();
    this.playlistOrder = [];
    this.songLibraryById.clear();
    this.songLibraryByKey.clear();
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

  getSongLibraryKey(songData: Pick<Track, 'source' | 'path' | 'youtubeVideoId' | 'id'>): string {
    if (songData.source === 'youtube' && songData.youtubeVideoId) {
      return `youtube:${songData.youtubeVideoId}`;
    }

    return `local:${songData.path || songData.id}`;
  }

  getOrCreateSong(songData: TTrack): TTrack {
    const songKey = this.getSongLibraryKey(songData);
    const existingSong = this.songLibraryByKey.get(songKey);

    if (existingSong) {
      existingSong.source = songData.source || existingSong.source;
      existingSong.name = songData.name || existingSong.name;
      existingSong.fileName = songData.fileName || existingSong.fileName;
      existingSong.path = songData.path || existingSong.path;
      existingSong.filePath = songData.filePath || existingSong.filePath;
      existingSong.url = songData.url || existingSong.url;
      existingSong.title = songData.title || existingSong.title;
      existingSong.artist = songData.artist || existingSong.artist;
      existingSong.album = songData.album ?? existingSong.album;
      existingSong.sourceLabel = songData.sourceLabel || existingSong.sourceLabel;
      existingSong.extension = songData.extension || existingSong.extension;
      existingSong.initials = songData.initials || existingSong.initials;
      existingSong.artwork = songData.artwork || existingSong.artwork;
      existingSong.artworkDataUrl = songData.artworkDataUrl || existingSong.artworkDataUrl;
      existingSong.artworkMimeType = songData.artworkMimeType || existingSong.artworkMimeType;
      existingSong.genre = songData.genre ?? existingSong.genre;
      existingSong.trackNumber = songData.trackNumber ?? existingSong.trackNumber;
      existingSong.youtubeVideoId = songData.youtubeVideoId || existingSong.youtubeVideoId;
      existingSong.youtubeUrl = songData.youtubeUrl || existingSong.youtubeUrl;
      existingSong.channelTitle = songData.channelTitle || existingSong.channelTitle;
      existingSong.publishedAt = songData.publishedAt || existingSong.publishedAt;

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
    this.songLibraryByKey.set(songKey, canonicalSong);

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

  reorderSongInPlaylist(playlistId: string, fromIndex: number, toIndex: number): boolean {
    const playlist = this.getPlaylist(playlistId);

    if (!playlist) {
      return false;
    }

    try {
      playlist.list.moveAt(fromIndex, toIndex);
      return true;
    } catch (_error) {
      return false;
    }
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

  exportState(): PersistedPlaylistState<TTrack> {
    return {
      songs: Array.from(this.songLibraryById.values()).map((song) => ({ ...song })),
      playlists: this.getPlaylists().map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        isSystem: playlist.isSystem,
        isFavorites: playlist.isFavorites,
        songIds: playlist.list.toArray().map((song) => song.id),
        currentSongId: playlist.list.getCurrentSong()?.id || null,
      })),
      activePlaylistId: this.activePlaylistId,
    };
  }

  hydrateState(state: PersistedPlaylistState<TTrack>): boolean {
    if (
      !state ||
      !Array.isArray(state.songs) ||
      !Array.isArray(state.playlists)
    ) {
      return false;
    }

    this.resetState();

    const songMap = new Map<string, TTrack>();

    state.songs.forEach((songData) => {
      if (!songData?.id) {
        return;
      }

      const canonicalSong = this.getOrCreateSong(songData);
      songMap.set(canonicalSong.id, canonicalSong);
    });

    this.playlists.clear();
    this.playlistOrder = [];

    state.playlists.forEach((playlistState) => {
      if (!playlistState?.id || !playlistState?.name) {
        return;
      }

      this.createPlaylist(playlistState.name, {
        id: playlistState.id,
        system: playlistState.isSystem,
        favorites: playlistState.isFavorites,
      });
    });

    const hasMainPlaylist = this.playlists.has('main');
    const hasFavoritesPlaylist = this.playlists.has('favorites');

    if (!hasMainPlaylist) {
      this.createPlaylist('Playlist principal', {
        id: 'main',
        system: false,
      });
    }

    if (!hasFavoritesPlaylist) {
      this.createPlaylist('Mis favoritos', {
        id: 'favorites',
        system: true,
        favorites: true,
      });
    }

    state.playlists.forEach((playlistState) => {
      const playlist = this.getPlaylist(playlistState.id);

      if (!playlist) {
        return;
      }

      (playlistState.songIds || []).forEach((songId) => {
        const song = songMap.get(songId);

        if (song) {
          this.addSongToPlaylist(playlist.id, song);
        }
      });

      if (playlistState.currentSongId) {
        this.setCurrentSongById(playlist.id, playlistState.currentSongId);
      } else if (!playlist.list.getCurrentSong() && !playlist.list.isEmpty()) {
        playlist.list.setCurrentByPosition(0);
      }
    });

    Array.from(songMap.values()).forEach((song) => {
      if (song.isFavorite) {
        this.syncFavoritesMembership(song);
      }
    });

    if (!this.setActivePlaylist(state.activePlaylistId || 'main')) {
      this.setActivePlaylist('main');
    }

    return true;
  }
}

window.PlaylistManager = PlaylistManager;
