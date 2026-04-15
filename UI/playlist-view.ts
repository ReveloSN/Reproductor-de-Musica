interface PlaylistCollectionRenderArgs {
  playlists: PlaylistRecord[];
  activePlaylistId: string | null;
}

interface PlaylistSongsRenderArgs {
  activePlaylist: PlaylistRecord | null;
  visibleSongs: PlaylistTrackView[];
  allSongs: PlaylistTrackView[];
  playingSongId: string | null;
  searchTerm: string;
  openMenuSongId: string | null;
  playlistManager: PlaylistManager;
  summarizePath: (filePath: string) => string;
}

class PlaylistView {
  documentRef: Document;
  elements: RendererElements;

  constructor(documentRef: Document, elements: RendererElements) {
    this.documentRef = documentRef;
    this.elements = elements;
  }

  renderPlaylists({ playlists, activePlaylistId }: PlaylistCollectionRenderArgs): void {
    this.elements.playlistList.replaceChildren();

    const fragment = this.documentRef.createDocumentFragment();

    playlists.forEach((playlistRecord) => {
      const button = this.documentRef.createElement('button');
      const badge = this.documentRef.createElement('span');
      const copy = this.documentRef.createElement('div');
      const title = this.documentRef.createElement('strong');
      const subtitle = this.documentRef.createElement('span');
      const count = this.documentRef.createElement('span');

      button.type = 'button';
      button.className = `playlist-switcher${playlistRecord.id === activePlaylistId ? ' is-active' : ''}${playlistRecord.isFavorites ? ' is-favorites' : ''}`;
      button.dataset.playlistId = playlistRecord.id;

      badge.className = 'playlist-switcher-icon';
      badge.textContent = this.getPlaylistBadgeLabel(playlistRecord);

      copy.className = 'playlist-switcher-copy';
      title.textContent = playlistRecord.name;
      subtitle.textContent = playlistRecord.isFavorites
        ? 'Playlist automatica de favoritas'
        : playlistRecord.id === 'main'
          ? 'Playlist base de tu biblioteca local'
          : 'Playlist creada manualmente';

      count.className = 'playlist-switcher-count';
      count.textContent = `${playlistRecord.list.length}`;

      copy.appendChild(title);
      copy.appendChild(subtitle);

      button.appendChild(badge);
      button.appendChild(copy);
      button.appendChild(count);
      fragment.appendChild(button);
    });

    this.elements.playlistList.appendChild(fragment);
  }

  renderSongs({
    activePlaylist,
    visibleSongs,
    allSongs,
    playingSongId,
    searchTerm,
    openMenuSongId,
    playlistManager,
    summarizePath,
  }: PlaylistSongsRenderArgs): void {
    this.elements.playlist.replaceChildren();

    this.elements.playlistResultsLabel.textContent = searchTerm
      ? `Mostrando ${visibleSongs.length} de ${allSongs.length} canciones`
      : `Mostrando ${allSongs.length} canciones`;

    if (!activePlaylist || allSongs.length === 0) {
      const emptyItem = this.documentRef.createElement('li');
      emptyItem.className = 'playlist-empty';
      emptyItem.textContent = activePlaylist && activePlaylist.isFavorites
        ? 'Todavia no hay favoritas. Marca canciones con el corazon para verlas aqui.'
        : 'La playlist activa esta vacia. Agrega canciones para empezar.';
      this.elements.playlist.appendChild(emptyItem);
      return;
    }

    if (visibleSongs.length === 0) {
      const emptyItem = this.documentRef.createElement('li');
      emptyItem.className = 'playlist-empty';
      emptyItem.textContent = 'No hay resultados para la busqueda actual.';
      this.elements.playlist.appendChild(emptyItem);
      return;
    }

    const fragment = this.documentRef.createDocumentFragment();

    visibleSongs.forEach((song) => {
      const row = this.documentRef.createElement('li');
      const songButton = this.documentRef.createElement('button');
      const actions = this.documentRef.createElement('div');
      const favoriteButton = this.documentRef.createElement('button');
      const menuButton = this.documentRef.createElement('button');
      const indexCell = this.documentRef.createElement('div');
      const number = this.documentRef.createElement('span');
      const art = this.documentRef.createElement('div');
      const titleCell = this.documentRef.createElement('div');
      const titleRow = this.documentRef.createElement('div');
      const title = this.documentRef.createElement('strong');
      const favoritePill = this.documentRef.createElement('span');
      const path = this.documentRef.createElement('div');
      const metaCell = this.documentRef.createElement('div');
      const meta = this.documentRef.createElement('div');
      const status = this.documentRef.createElement('div');
      const duration = this.documentRef.createElement('div');
      const isPlayingSong = Boolean(playingSongId && song.id === playingSongId);
      const isHighlighted = isPlayingSong || song.isCurrent;

      row.className = 'playlist-row';

      songButton.type = 'button';
      songButton.className = `playlist-item${isHighlighted ? ' is-current' : ''}`;
      songButton.dataset.index = String(song.index);

      indexCell.className = 'playlist-index';
      number.className = 'playlist-number';
      number.textContent = String(song.index + 1);

      art.className = 'artwork playlist-mini-art';
      art.textContent = song.initials;
      art.style.setProperty('--art-start', song.artwork.start);
      art.style.setProperty('--art-end', song.artwork.end);
      art.style.setProperty('--art-image', song.artworkDataUrl ? `url("${song.artworkDataUrl}")` : 'none');
      art.classList.toggle('has-artwork-image', Boolean(song.artworkDataUrl));

      titleCell.className = 'playlist-title';
      titleRow.className = 'playlist-title-row';
      title.textContent = song.title;

      if (song.isFavorite) {
        favoritePill.className = 'playlist-favorite-pill';
        favoritePill.textContent = 'Favorita';
        titleRow.appendChild(favoritePill);
      }

      path.className = 'playlist-path';
      path.textContent = song.album ? `${song.artist} • ${song.album}` : song.artist;
      path.title = path.textContent;

      metaCell.className = 'playlist-meta';
      meta.className = 'playlist-detail-text';
      meta.textContent = song.genre
        ? `${summarizePath(song.path)} • ${song.genre}`
        : `${summarizePath(song.path)} • ${song.extension}`;
      meta.title = song.path;
      status.className = 'playlist-status';
      status.textContent = isPlayingSong
        ? 'Sonando'
        : song.isFavorite
          ? 'Favorita'
          : song.trackNumber
            ? `Pista ${song.trackNumber}`
            : song.extension;

      duration.className = 'playlist-duration';
      duration.textContent = song.durationText;

      actions.className = 'playlist-actions';

      favoriteButton.type = 'button';
      favoriteButton.className = `playlist-favorite-button${song.isFavorite ? ' is-active' : ''}`;
      favoriteButton.dataset.favoriteToggle = song.id;
      favoriteButton.setAttribute('aria-pressed', String(song.isFavorite));
      favoriteButton.setAttribute(
        'aria-label',
        song.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorita'
      );
      favoriteButton.title = song.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorita';

      menuButton.type = 'button';
      menuButton.className = 'playlist-menu-button';
      menuButton.dataset.menuTrigger = song.id;
      menuButton.setAttribute('aria-expanded', String(openMenuSongId === song.id));
      menuButton.setAttribute('aria-label', 'Mas acciones');
      menuButton.textContent = '...';

      indexCell.appendChild(number);
      indexCell.appendChild(art);

      titleRow.prepend(title);
      titleCell.appendChild(titleRow);
      titleCell.appendChild(path);

      metaCell.appendChild(meta);
      metaCell.appendChild(status);

      songButton.appendChild(indexCell);
      songButton.appendChild(titleCell);
      songButton.appendChild(metaCell);
      songButton.appendChild(duration);

      actions.appendChild(favoriteButton);
      actions.appendChild(menuButton);

      if (openMenuSongId === song.id) {
        const menu = this.documentRef.createElement('div');
        menu.className = 'playlist-menu';
        menu.appendChild(this.createSongMenuButton('Reproducir ahora', 'play-now', song.index));
        menu.appendChild(
          this.createSongMenuButton(
            song.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorita',
            'toggle-favorite',
            song.index
          )
        );
        menu.appendChild(
          this.createSongMenuButton(
            activePlaylist.isFavorites ? 'Quitar de Mis favoritos' : 'Eliminar de esta playlist',
            'remove-song',
            song.index
          )
        );
        this.appendAddPlaylistTargets(menu, song, song.index, playlistManager);
        actions.appendChild(menu);
      }

      row.appendChild(songButton);
      row.appendChild(actions);
      fragment.appendChild(row);
    });

    this.elements.playlist.appendChild(fragment);
  }

  private appendAddPlaylistTargets(
    menu: HTMLDivElement,
    song: PlaylistTrackView,
    songIndex: number,
    playlistManager: PlaylistManager
  ): void {
    const menuLabel = this.documentRef.createElement('div');
    menuLabel.className = 'playlist-menu-section-label';
    menuLabel.textContent = 'Agregar a playlist';
    menu.appendChild(menuLabel);

    const targetPlaylists = playlistManager
      .getPlaylists()
      .filter((playlistRecord) => {
        return (
          !playlistRecord.isFavorites &&
          playlistRecord.id !== playlistManager.activePlaylistId &&
          !playlistManager.hasSong(playlistRecord.id, song.id)
        );
      });

    if (targetPlaylists.length === 0) {
      const emptyButton = this.documentRef.createElement('button');
      emptyButton.type = 'button';
      emptyButton.className = 'is-disabled';
      emptyButton.textContent = 'No hay otra playlist disponible';
      menu.appendChild(emptyButton);
      return;
    }

    targetPlaylists.forEach((playlistRecord) => {
      const targetButton = this.documentRef.createElement('button');
      targetButton.type = 'button';
      targetButton.textContent = playlistRecord.name;
      targetButton.dataset.addTargetPlaylist = playlistRecord.id;
      targetButton.dataset.songIndex = String(songIndex);
      menu.appendChild(targetButton);
    });
  }

  private createSongMenuButton(
    label: string,
    action: SongMenuAction,
    songIndex: number
  ): HTMLButtonElement {
    const button = this.documentRef.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.songIndex = String(songIndex);
    return button;
  }

  private getPlaylistBadgeLabel(playlistRecord: PlaylistRecord): string {
    if (playlistRecord.isFavorites) {
      return 'Fav';
    }

    if (playlistRecord.id === 'main') {
      return 'Main';
    }

    const normalized = String(playlistRecord.name)
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (normalized.length === 0) {
      return 'PL';
    }

    if (normalized.length === 1) {
      return normalized[0].slice(0, 3);
    }

    return `${normalized[0][0]}${normalized[1][0]}`.toUpperCase();
  }
}

window.PlaylistView = PlaylistView;
