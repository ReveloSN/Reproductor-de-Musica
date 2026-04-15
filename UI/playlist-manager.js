class PlaylistManager {
  constructor(PlaylistClass) {
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

  normalizeName(name) {
    return String(name || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  generatePlaylistId(name) {
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

  nameExists(name) {
    const normalized = this.normalizeName(name).toLowerCase();

    return this.getPlaylists().some((playlist) => playlist.name.toLowerCase() === normalized);
  }

  createPlaylist(name, options = {}) {
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
    const playlistRecord = {
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

  getPlaylists() {
    return this.playlistOrder
      .map((playlistId) => this.playlists.get(playlistId))
      .filter((playlist) => Boolean(playlist));
  }

  getPlaylist(playlistId) {
    return this.playlists.get(playlistId) || null;
  }

  getFavoritesPlaylist() {
    return this.getPlaylist('favorites');
  }

  getActivePlaylist() {
    return this.getPlaylist(this.activePlaylistId);
  }

  setActivePlaylist(playlistId) {
    if (!this.playlists.has(playlistId)) {
      return false;
    }

    this.activePlaylistId = playlistId;
    return true;
  }

  getSongById(songId) {
    return this.songLibraryById.get(songId) || null;
  }

  getOrCreateSong(songData) {
    const existingSong = this.songLibraryByPath.get(songData.path);

    if (existingSong) {
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

  findSongIndex(playlistId, songId) {
    const playlist = this.getPlaylist(playlistId);

    if (!playlist) {
      return -1;
    }

    return playlist.list.toArray().findIndex((song) => song.id === songId);
  }

  hasSong(playlistId, songId) {
    return this.findSongIndex(playlistId, songId) !== -1;
  }

  addSongToPlaylist(playlistId, song, position = null) {
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

  addSongsToPlaylist(playlistId, songs, { mode = 'end', position = null } = {}) {
    const added = [];
    const duplicates = [];

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
      let nextPosition = Number.isInteger(position) ? position : 0;

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

  removeSongFromPlaylist(playlistId, songId) {
    const playlist = this.getPlaylist(playlistId);
    const songIndex = this.findSongIndex(playlistId, songId);

    if (!playlist || songIndex === -1) {
      return null;
    }

    return playlist.list.removeAt(songIndex);
  }

  setCurrentSongById(playlistId, songId) {
    const playlist = this.getPlaylist(playlistId);
    const songIndex = this.findSongIndex(playlistId, songId);

    if (!playlist || songIndex === -1) {
      return null;
    }

    return playlist.list.setCurrentByPosition(songIndex);
  }

  toggleFavorite(songId) {
    const song = this.getSongById(songId);

    if (!song) {
      return null;
    }

    song.isFavorite = !song.isFavorite;
    this.syncFavoritesMembership(song);
    return song;
  }

  setFavorite(songId, value) {
    const song = this.getSongById(songId);

    if (!song) {
      return null;
    }

    song.isFavorite = Boolean(value);
    this.syncFavoritesMembership(song);
    return song;
  }

  syncFavoritesMembership(song) {
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
