type AddSongsMode = 'start' | 'end' | 'position';

document.addEventListener('DOMContentLoaded', () => {
  const playlistManager = new window.PlaylistManager(window.DoublyLinkedPlaylist);
  const lyricsService = new window.LyricsService();
  const translationService = new window.TranslationService();
  const supportedExtensions = new Set<string>(['.mp3', '.wav', '.ogg', '.m4a']);
  const artworkPairs: ArtworkPalette[] = [
    { start: '#2fbf8b', end: '#4b6cb7' },
    { start: '#1f7a62', end: '#64d9c1' },
    { start: '#2a5967', end: '#74f0c7' },
    { start: '#36566e', end: '#3fcf8e' },
    { start: '#21685a', end: '#5c87ff' },
    { start: '#0f8f72', end: '#8ad8ff' },
  ];
  const repeatModeLabels: Record<RepeatMode, string> = {
    off: 'Repeat off',
    one: 'Repeat one',
    all: 'Repeat all',
  };

  let pauseStatusSuppressed = false;
  let searchTerm = '';
  let openMenuSongId: string | null = null;
  let shuffleEnabled = false;
  let repeatMode: RepeatMode = 'off';
  let shuffleHistory: string[] = [];

  const elements = window.createRendererElements(document);
  const playlistView = new window.PlaylistView(document, elements);
  const nowPlayingView = new window.NowPlayingView(elements, {
    lyricsService,
    translationService,
    summarizePath,
    updateArtwork,
  });
  const playbackController = new window.PlaybackController(elements, formatDuration);
  const audioAPI = window.audioAPI;

  if (!audioAPI) {
    setFeedback(
      'No se encontro la integracion con Electron. Revisa preload.js y vuelve a iniciar la app.',
      'error'
    );
    return;
  }

  const electronAudioAPI: AudioAPI = audioAPI;

  const songFactory = new window.SongFactory({
    audioAPI,
    supportedExtensions,
    artworkPairs,
    formatDuration,
    onMetadataResolved: () => {
      renderPlaylist();
      syncPlayerInfo();
      renderPlaylists();
    },
  });

  const playlistActions = new window.PlaylistActions(
    playlistManager,
    elements,
    playbackController,
    {
      getActiveList,
      getActivePlaylistRecord,
      getPlayingSong,
      getOpenMenuSongId: () => openMenuSongId,
      setOpenMenuSongId: (songId) => {
        openMenuSongId = songId;
      },
      getShuffleHistory: () => shuffleHistory,
      setShuffleHistory: (history) => {
        shuffleHistory = history;
      },
      probeSongMetadata: (song) => {
        songFactory.probeSongMetadata(song);
      },
      pushShuffleHistory,
      renderPlaylists,
      renderPlaylist,
      syncPlayerInfo,
      updatePositionInputs,
      updatePlaybackProgress,
      setPlayButtonState,
      setPlaybackStatus,
      setFeedback,
      suppressPauseStatus,
    }
  );

  wireEvents();
  renderPlaylists();
  renderPlaylist();
  syncPlayerInfo();
  syncControlStates();
  updatePositionInputs();
  updatePlaybackProgress();
  setPlaybackStatus('En espera');
  setPlayButtonState(false);
  syncNowPlayingView();

  function getActivePlaylistRecord(): PlaylistRecord | null {
    return playlistManager.getActivePlaylist();
  }

  function getActiveList(): DoublyLinkedPlaylist | null {
    const activePlaylist = getActivePlaylistRecord();
    return activePlaylist ? activePlaylist.list : null;
  }

  function getPlayingSong(): Track | null {
    const songId = playbackController.getLoadedSongId();
    return songId ? playlistManager.getSongById(songId) : null;
  }

  function getDisplaySong(): Track | null {
    return getPlayingSong() || playlistActions.ensureCurrentSong();
  }

  function getInsertDefaultPosition(): number {
    const activeList = getActiveList();
    return activeList ? activeList.length : 0;
  }

  function wireEvents(): void {
    electronAudioAPI.onMenuAudioFilesSelected((filePaths: string[]) => {
      addSongsFromPaths(filePaths, 'end');
    });

    elements.addEndButton.addEventListener('click', () => {
      void pickFilesAndAdd('end');
    });

    elements.addStartButton.addEventListener('click', () => {
      void pickFilesAndAdd('start');
    });

    elements.insertAtPositionButton.addEventListener('click', () => {
      const activeList = getActiveList();
      const insertIndex = readOneBasedPosition(
        elements.insertPosition,
        (activeList ? activeList.length : 0) + 1
      );

      if (insertIndex === null) {
        return;
      }

      void pickFilesAndAdd('position', insertIndex);
    });

    elements.createPlaylistButton.addEventListener('click', () => {
      createPlaylistFromInput();
    });

    elements.newPlaylistName.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        createPlaylistFromInput();
      }
    });

    elements.playlistList.addEventListener('click', handlePlaylistListClick);
    nowPlayingView.bindEvents(openNowPlayingView);

    elements.searchInput.addEventListener('input', () => {
      searchTerm = elements.searchInput.value.trim().toLowerCase();
      openMenuSongId = null;
      renderPlaylist();
      syncPlayerInfo();
    });

    elements.shuffleButton.addEventListener('click', () => {
      shuffleEnabled = !shuffleEnabled;

      if (!shuffleEnabled) {
        shuffleHistory = [];
      }

      syncControlStates();
      setFeedback(
        shuffleEnabled ? 'Modo aleatorio activado.' : 'Modo aleatorio desactivado.',
        'success'
      );
    });

    elements.repeatButton.addEventListener('click', () => {
      repeatMode = getNextRepeatMode(repeatMode);
      syncControlStates();
      setFeedback(`Modo repetir: ${repeatModeLabels[repeatMode]}.`, 'success');
    });

    elements.previousButton.addEventListener('click', () => {
      if (!playPreviousSong()) {
        setFeedback('No hay una cancion anterior disponible en la playlist activa.', 'error');
        syncPlayerInfo();
        renderPlaylist();
      }
    });

    elements.playButton.addEventListener('click', () => {
      togglePlayPause();
    });

    elements.nextButton.addEventListener('click', () => {
      if (!playNextSong({ fromEnded: false, announce: true })) {
        setFeedback('No hay una siguiente cancion disponible en la playlist activa.', 'error');
        syncPlayerInfo();
        renderPlaylist();
      }
    });

    elements.stopButton.addEventListener('click', () => {
      if (!getPlayingSong()) {
        setFeedback('No hay una cancion activa para detener.', 'error');
        return;
      }

      suppressPauseStatus();
      elements.audioElement.pause();
      elements.audioElement.currentTime = 0;
      updatePlaybackProgress();
      setPlayButtonState(false);
      setPlaybackStatus('Detenido');
      setFeedback('Reproduccion detenida.', 'success');
    });

    elements.playlist.addEventListener('click', handlePlaylistClick);
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);
    playbackController.bindEvents({
      onLoadedMetadata: handleLoadedMetadata,
      onTimeUpdate: updatePlaybackProgress,
      onPlay: handlePlay,
      onPause: handlePause,
      onEnded: handleSongEnded,
      onError: handleAudioError,
    });
  }

  function handlePlaylistListClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;

    if (!target) {
      return;
    }

    const playlistButton = target.closest<HTMLButtonElement>('button[data-playlist-id]');
    const playlistId = playlistButton?.dataset.playlistId;

    if (!playlistId) {
      return;
    }

    switchActivePlaylist(playlistId, true);
  }

  function createPlaylistFromInput(): void {
    const playlistName = elements.newPlaylistName.value;
    const result = playlistManager.createPlaylist(playlistName);

    if (!result.ok || !result.playlist) {
      setFeedback(result.error || 'No fue posible crear la playlist.', 'error');
      return;
    }

    elements.newPlaylistName.value = '';
    switchActivePlaylist(result.playlist.id, false);
    renderPlaylists();
    setFeedback(`La playlist "${result.playlist.name}" fue creada.`, 'success');
  }

  function switchActivePlaylist(playlistId: string, announce = false): void {
    if (!playlistManager.setActivePlaylist(playlistId)) {
      setFeedback('No fue posible cambiar a la playlist seleccionada.', 'error');
      return;
    }

    openMenuSongId = null;
    syncActivePlaylistWithPlayingSong();
    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    updatePositionInputs();

    if (announce) {
      const activePlaylist = getActivePlaylistRecord();

      if (activePlaylist) {
        setFeedback(`Playlist activa: ${activePlaylist.name}.`, 'success');
      }
    }
  }

  function syncActivePlaylistWithPlayingSong(): void {
    const activePlaylist = getActivePlaylistRecord();
    const playingSong = getPlayingSong();

    if (!activePlaylist) {
      return;
    }

    if (playingSong && playlistManager.hasSong(activePlaylist.id, playingSong.id)) {
      playlistManager.setCurrentSongById(activePlaylist.id, playingSong.id);
      return;
    }

    if (!activePlaylist.list.getCurrentSong() && !activePlaylist.list.isEmpty()) {
      activePlaylist.list.setCurrentByPosition(0);
    }
  }

  function handlePlaylistClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;

    if (!target) {
      return;
    }

    const favoriteToggle = target.closest<HTMLButtonElement>('button[data-favorite-toggle]');
    const favoriteSongId = favoriteToggle?.dataset.favoriteToggle;

    if (favoriteSongId) {
      toggleFavoriteForSong(favoriteSongId);
      return;
    }

    const addTarget = target.closest<HTMLButtonElement>('button[data-add-target-playlist]');
    const addTargetSongIndex = addTarget?.dataset.songIndex;
    const addTargetPlaylistId = addTarget?.dataset.addTargetPlaylist;

    if (addTargetSongIndex && addTargetPlaylistId) {
      addSongToExistingPlaylist(Number(addTargetSongIndex), addTargetPlaylistId);
      return;
    }

    const menuTrigger = target.closest<HTMLButtonElement>('button[data-menu-trigger]');
    const menuSongId = menuTrigger?.dataset.menuTrigger;

    if (menuSongId) {
      toggleSongMenu(menuSongId);
      return;
    }

    const menuActionButton = target.closest<HTMLButtonElement>('button[data-action]');
    const menuAction = menuActionButton?.dataset.action as SongMenuAction | undefined;
    const menuSongIndex = menuActionButton?.dataset.songIndex;

    if (menuAction && menuSongIndex) {
      handleSongMenuAction(menuAction, Number(menuSongIndex));
      return;
    }

    const playlistItem = target.closest<HTMLButtonElement>('button[data-index]');
    const indexValue = playlistItem?.dataset.index;

    if (!indexValue) {
      return;
    }

    const activeList = getActiveList();
    const index = Number(indexValue);
    const selectedSong = activeList ? activeList.getAt(index) : null;
    const currentSong = getPlayingSong();

    if (shuffleEnabled && currentSong && selectedSong && currentSong.id !== selectedSong.id) {
      pushShuffleHistory(currentSong.id);
    }

    if (activeList) {
      activeList.setCurrentByPosition(index);
    }

    openMenuSongId = null;
    playlistActions.loadSongFromActivePlaylist({ autoplay: true });
  }

  function handleDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;

    if (openMenuSongId && target && !target.closest('.playlist-actions')) {
      openMenuSongId = null;
      renderPlaylist();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && nowPlayingView.isOpen()) {
      closeNowPlayingView();
      return;
    }

    if (event.key === 'Escape' && openMenuSongId) {
      openMenuSongId = null;
      renderPlaylist();
    }
  }

  function openNowPlayingView(): void {
    const displaySong = getDisplaySong();

    if (!nowPlayingView.open(displaySong, getModeSummaryLabel())) {
      setFeedback('No hay una cancion activa para abrir en vista ampliada.', 'error');
    }
  }

  function closeNowPlayingView(): void {
    nowPlayingView.close();
  }

  function syncNowPlayingView(): void {
    nowPlayingView.sync(getDisplaySong(), getModeSummaryLabel());
  }

  function handleLoadedMetadata(): void {
    const currentSong = getPlayingSong();

    if (currentSong && Number.isFinite(elements.audioElement.duration)) {
      currentSong.durationSeconds = elements.audioElement.duration;
      currentSong.durationText = formatDuration(elements.audioElement.duration);
      renderPlaylist();
      syncPlayerInfo();
    }

    updatePlaybackProgress();
  }

  function handlePlay(): void {
    setPlayButtonState(true);
    setPlaybackStatus('Reproduciendo');
    renderPlaylist();
    syncPlayerInfo();
  }

  function handlePause(): void {
    setPlayButtonState(false);

    if (pauseStatusSuppressed) {
      return;
    }

    if (!elements.audioElement.ended && elements.audioElement.currentTime > 0) {
      setPlaybackStatus('Pausado');
    }

    renderPlaylist();
    syncPlayerInfo();
  }

  function handleAudioError(): void {
    setPlayButtonState(false);
    setPlaybackStatus('Error de audio');
    setFeedback(
      'No se pudo reproducir el archivo actual. Verifica el formato o prueba con otra cancion.',
      'error'
    );
    renderPlaylist();
    syncPlayerInfo();
  }

  async function pickFilesAndAdd(
    mode: AddSongsMode,
    position: number = getInsertDefaultPosition()
  ): Promise<void> {
    try {
      const filePaths = await electronAudioAPI.openAudioFiles();

      if (!filePaths || filePaths.length === 0) {
        return;
      }

      addSongsFromPaths(filePaths, mode, position);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`No fue posible abrir el selector de archivos: ${message}`, 'error');
    }
  }

  function addSongsFromPaths(
    filePaths: string[],
    mode: AddSongsMode,
    position: number = getInsertDefaultPosition(),
    playlistId: string = playlistManager.activePlaylistId || 'main'
  ): void {
    const { songs, ignoredFiles } = songFactory.createSongsFromPaths(filePaths, playlistManager);

    if (songs.length === 0) {
      setFeedback(
        'Los archivos seleccionados no coinciden con los formatos soportados: mp3, wav, ogg y m4a.',
        'error'
      );
      return;
    }

    const result = playlistManager.addSongsToPlaylist(playlistId, songs, { mode, position });
    const targetPlaylist = playlistManager.getPlaylist(playlistId);

    if (!targetPlaylist) {
      setFeedback('No fue posible agregar canciones a la playlist seleccionada.', 'error');
      return;
    }

    result.added.forEach((song) => {
      if (!Number.isFinite(song.durationSeconds)) {
        songFactory.probeSongMetadata(song);
      }
    });

    if (
      targetPlaylist.id === playlistManager.activePlaylistId &&
      !getPlayingSong() &&
      targetPlaylist.list.getCurrentSong()
    ) {
      playlistActions.syncCurrentSongSource(targetPlaylist.list.getCurrentSong());
    }

    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    updatePositionInputs();

    if (result.added.length === 0) {
      setFeedback(
        `Todas las canciones seleccionadas ya estaban en "${targetPlaylist.name}".`,
        'error'
      );
      return;
    }

    const insertMessage =
      mode === 'start'
        ? 'al inicio'
        : mode === 'position'
          ? `desde la posicion ${position + 1}`
          : 'al final';
    const duplicateMessage =
      result.duplicates.length > 0
        ? ` ${result.duplicates.length} cancion(es) ya estaban en la playlist activa.`
        : '';
    const ignoredMessage =
      ignoredFiles > 0 ? ` ${ignoredFiles} archivo(s) fueron ignorados por formato.` : '';

    setFeedback(
      `${result.added.length} cancion(es) agregadas ${insertMessage} en "${targetPlaylist.name}".${duplicateMessage}${ignoredMessage}`,
      'success'
    );
  }

  function togglePlayPause(): void {
    const playingSong = getPlayingSong();

    if (playingSong) {
      if (elements.audioElement.paused) {
        resumeLoadedSong();
        return;
      }

      elements.audioElement.pause();
      setPlaybackStatus('Pausado');
      return;
    }

    const currentSong = playlistActions.ensureCurrentSong();

    if (!currentSong) {
      setFeedback('Primero agrega canciones a la playlist activa.', 'error');
      return;
    }

    playlistActions.loadSongFromActivePlaylist({ autoplay: true });
  }

  function resumeLoadedSong(announce = false): void {
    const playingSong = getPlayingSong();

    if (!playingSong) {
      playlistActions.loadSongFromActivePlaylist({ autoplay: true, announce });
      return;
    }

    const playPromise = elements.audioElement.play();

    if (playPromise && typeof playPromise.catch === 'function') {
      void playPromise
        .then(() => {
          setPlayButtonState(true);
          setPlaybackStatus('Reproduciendo');
          renderPlaylist();
          syncPlayerInfo();

          if (announce) {
            setFeedback(`Reproduciendo "${playingSong.title}".`, 'success');
          }
        })
        .catch(() => {
          setPlayButtonState(false);
          setPlaybackStatus('Error de audio');
          setFeedback(
            `Electron no pudo reproducir "${playingSong.title}". Revisa el archivo o prueba otro formato compatible.`,
            'error'
          );
        });
    }
  }

  function playNextSong(
    { fromEnded = false, announce = true }: { fromEnded?: boolean; announce?: boolean } = {}
  ): boolean {
    const activeList = getActiveList();
    const currentSong = playlistActions.ensureCurrentSong();

    if (!activeList || !currentSong) {
      return false;
    }

    if (repeatMode === 'one' && fromEnded) {
      elements.audioElement.currentTime = 0;
      resumeLoadedSong(false);
      return true;
    }

    const nextIndex = getNextSongIndex();

    if (nextIndex === null) {
      return false;
    }

    if (shuffleEnabled && activeList.length > 1) {
      pushShuffleHistory(currentSong.id);
    }

    activeList.setCurrentByPosition(nextIndex);
    playlistActions.loadSongFromActivePlaylist({
      autoplay: true,
      announce: !fromEnded && announce,
    });
    return true;
  }

  function playPreviousSong(): boolean {
    const activeList = getActiveList();
    const currentSong = playlistActions.ensureCurrentSong();

    if (!activeList || !currentSong) {
      return false;
    }

    if (shuffleEnabled) {
      while (shuffleHistory.length > 0) {
        const previousSongId = shuffleHistory.pop();

        if (!previousSongId) {
          continue;
        }

        const previousIndex = findSongIndexById(previousSongId);

        if (previousIndex !== -1) {
          activeList.setCurrentByPosition(previousIndex);
          playlistActions.loadSongFromActivePlaylist({ autoplay: true });
          return true;
        }
      }
    }

    const previousSong = activeList.prevSong();

    if (previousSong) {
      playlistActions.loadSongFromActivePlaylist({ autoplay: true });
      return true;
    }

    if (repeatMode === 'all' && activeList.length > 0) {
      activeList.setCurrentByPosition(activeList.length - 1);
      playlistActions.loadSongFromActivePlaylist({ autoplay: true });
      return true;
    }

    return false;
  }

  function getNextSongIndex(): number | null {
    const activeList = getActiveList();

    if (!activeList || activeList.isEmpty()) {
      return null;
    }

    const currentIndex = activeList.getCurrentIndex();

    if (shuffleEnabled && activeList.length > 1) {
      const candidates = activeList
        .toArray()
        .filter((song) => song.index !== currentIndex)
        .map((song) => song.index);

      if (candidates.length === 0) {
        return currentIndex >= 0 ? currentIndex : 0;
      }

      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    if (currentIndex === -1) {
      return 0;
    }

    if (currentIndex < activeList.length - 1) {
      return currentIndex + 1;
    }

    if (repeatMode === 'all') {
      return 0;
    }

    return null;
  }

  function handleSongEnded(): void {
    if (playNextSong({ fromEnded: true, announce: false })) {
      return;
    }

    suppressPauseStatus();
    elements.audioElement.currentTime = 0;
    updatePlaybackProgress();
    setPlayButtonState(false);
    setPlaybackStatus('Lista completada');
    setFeedback('La playlist activa termino. Ya no hay una siguiente cancion.', 'success');
    renderPlaylist();
    syncPlayerInfo();
  }

  function handleSongMenuAction(action: SongMenuAction, index: number): void {
    playlistActions.handleSongMenuAction(action, index, shuffleEnabled);
  }

  function addSongToExistingPlaylist(songIndex: number, targetPlaylistId: string): void {
    playlistActions.addSongToExistingPlaylist(songIndex, targetPlaylistId);
  }

  function toggleFavoriteForSong(songId: string): void {
    playlistActions.toggleFavoriteForSong(songId);
  }

  function toggleSongMenu(songId: string): void {
    playlistActions.toggleSongMenu(songId);
  }

  function removeSongAtIndex(removeIndex: number): void {
    playlistActions.removeSongAtIndex(removeIndex);
  }

  function getVisibleSongs(): PlaylistTrackView[] {
    const activeList = getActiveList();
    const songs = activeList ? activeList.toArray() : [];

    if (!searchTerm) {
      return songs;
    }

    return songs.filter((song) => {
      const searchable = `${song.title} ${song.artist} ${song.path} ${song.extension}`.toLowerCase();
      return searchable.includes(searchTerm);
    });
  }

  function renderPlaylists(): void {
    playlistView.renderPlaylists({
      playlists: playlistManager.getPlaylists(),
      activePlaylistId: playlistManager.activePlaylistId,
    });
  }

  function renderPlaylist(): void {
    const activePlaylist = getActivePlaylistRecord();
    const activeList = getActiveList();
    const allSongs = activeList ? activeList.toArray() : [];
    const visibleSongs = getVisibleSongs();
    const playingSong = getPlayingSong();

    playlistView.renderSongs({
      activePlaylist,
      visibleSongs,
      allSongs,
      playingSongId: playingSong ? playingSong.id : null,
      searchTerm,
      openMenuSongId,
      playlistManager,
      summarizePath,
    });
  }

  function syncPlayerInfo(): void {
    const activePlaylist = getActivePlaylistRecord();
    const activeList = getActiveList();
    const displaySong = getDisplaySong();
    const activeSongs = activeList ? activeList.toArray() : [];
    const knownDuration = activeSongs.reduce((total, song) => {
      return total + (Number.isFinite(song.durationSeconds) ? song.durationSeconds || 0 : 0);
    }, 0);
    const modeSummary = getModeSummaryLabel();
    const currentIndex = activeList ? activeList.getCurrentIndex() : -1;

    if (activePlaylist && activeList) {
      elements.activePlaylistTitle.textContent = activePlaylist.name;
      elements.activePlaylistDescription.textContent = getPlaylistDescription(activePlaylist);
      elements.playlistPanelTitle.textContent = activePlaylist.name;
      elements.playlistSummary.textContent = `${activePlaylist.name} - ${activeList.length} canciones`;
      elements.playlistSummaryChip.textContent = activePlaylist.name;
    }

    elements.playlistDurationLabel.textContent = `Duracion conocida: ${formatDuration(knownDuration)}`;
    elements.modeSummaryChip.textContent = modeSummary;
    elements.shuffleStateLabel.textContent = shuffleEnabled ? 'Shuffle on' : 'Shuffle off';
    elements.repeatStateLabel.textContent = repeatModeLabels[repeatMode];
    elements.currentPositionLabel.textContent =
      currentIndex === -1 || !activeList
        ? 'Nodo actual: sin seleccion'
        : `Nodo actual: ${currentIndex + 1} de ${activeList.length}`;

    if (!displaySong) {
      elements.currentSongTitle.textContent = 'Sin canciones cargadas';
      elements.currentSongMeta.textContent =
        'Usa la barra lateral o el menu Archivo para cargar archivos locales.';
      elements.playerSongTitle.textContent = 'Sin reproduccion';
      elements.playerSongMeta.textContent = 'Selecciona una cancion de la playlist.';
      updateArtwork(elements.heroArtwork, elements.heroArtworkInitials, null);
      updateArtwork(elements.playerArtwork, elements.playerArtworkInitials, null);
      syncNowPlayingView();
      return;
    }

    const favoriteSuffix = displaySong.isFavorite ? ' | Favorita' : '';
    const summarizedPath = summarizePath(displaySong.path);

    elements.currentSongTitle.textContent = displaySong.title;
    elements.currentSongMeta.textContent = `${displaySong.artist} | ${summarizedPath}${favoriteSuffix}`;
    elements.playerSongTitle.textContent = displaySong.title;
    elements.playerSongMeta.textContent =
      `${displaySong.sourceLabel}${favoriteSuffix} | ${displaySong.durationText} | ${summarizedPath}`;

    updateArtwork(elements.heroArtwork, elements.heroArtworkInitials, displaySong);
    updateArtwork(elements.playerArtwork, elements.playerArtworkInitials, displaySong);
    syncNowPlayingView();
  }

  function getPlaylistDescription(playlistRecord: PlaylistRecord): string {
    if (playlistRecord.isFavorites) {
      return 'Se llena automaticamente con todas tus canciones marcadas como favoritas.';
    }

    if (playlistRecord.id === 'main') {
      return 'Tu lista base para cargar, ordenar y reproducir archivos locales.';
    }

    return 'Playlist creada manualmente para organizar canciones relacionadas.';
  }

  function updateArtwork(
    artworkElement: HTMLDivElement,
    initialsElement: HTMLSpanElement,
    song: Track | null
  ): void {
    const palette = song ? song.artwork : { start: '#2fbf8b', end: '#4b6cb7' };
    const initials = song ? song.initials : 'LP';

    artworkElement.style.setProperty('--art-start', palette.start);
    artworkElement.style.setProperty('--art-end', palette.end);
    initialsElement.textContent = initials;
  }

  function syncControlStates(): void {
    playbackController.syncModeControls({
      shuffleEnabled,
      repeatMode,
      repeatLabel: repeatModeLabels[repeatMode],
      modeSummary: getModeSummaryLabel(),
    });
  }

  function setPlayButtonState(isPlaying: boolean): void {
    playbackController.setPlayButtonState(isPlaying);
  }

  function updatePositionInputs(): void {
    const activeList = getActiveList();
    const insertMax = Math.max((activeList ? activeList.length : 0) + 1, 1);

    elements.insertPosition.max = String(insertMax);

    if (
      Number(elements.insertPosition.value) > insertMax ||
      Number(elements.insertPosition.value) < 1
    ) {
      elements.insertPosition.value = String(insertMax);
    }
  }

  function updatePlaybackProgress(): void {
    playbackController.updateProgress();
  }

  function readOneBasedPosition(inputElement: HTMLInputElement, maxValue: number): number | null {
    const rawValue = Number(inputElement.value);
    const allowedMax = Math.max(maxValue, 1);

    if (!Number.isInteger(rawValue) || rawValue < 1 || rawValue > allowedMax) {
      setFeedback(`La posicion debe estar entre 1 y ${allowedMax}.`, 'error');
      return null;
    }

    return rawValue - 1;
  }

  function getNextRepeatMode(currentMode: RepeatMode): RepeatMode {
    if (currentMode === 'off') {
      return 'one';
    }

    if (currentMode === 'one') {
      return 'all';
    }

    return 'off';
  }

  function pushShuffleHistory(songId: string): void {
    if (!songId) {
      return;
    }

    shuffleHistory.push(songId);

    if (shuffleHistory.length > 100) {
      shuffleHistory = shuffleHistory.slice(-100);
    }
  }

  function findSongIndexById(
    songId: string,
    playlistId: string = playlistManager.activePlaylistId || 'main'
  ): number {
    return playlistManager.findSongIndex(playlistId, songId);
  }

  function getModeSummaryLabel(): string {
    const parts: string[] = [];

    if (shuffleEnabled) {
      parts.push('Aleatorio');
    }

    if (repeatMode === 'one') {
      parts.push('Repite una');
    } else if (repeatMode === 'all') {
      parts.push('Repite playlist');
    }

    return parts.length > 0 ? parts.join(' + ') : 'Normal';
  }

  function summarizePath(filePath: string): string {
    const normalizedPath = String(filePath).replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);

    if (parts.length <= 2) {
      return normalizedPath;
    }

    return `.../${parts.slice(-2).join('/')}`;
  }

  function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return '0:00';
    }

    const roundedSeconds = Math.floor(seconds);
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    const remainingSeconds = roundedSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  function suppressPauseStatus(): void {
    pauseStatusSuppressed = true;

    window.setTimeout(() => {
      pauseStatusSuppressed = false;
    }, 0);
  }

  function setFeedback(message: string, tone: FeedbackTone = 'neutral'): void {
    elements.feedbackMessage.textContent = message;
    elements.feedbackMessage.classList.remove('is-error', 'is-success');

    if (tone === 'error') {
      elements.feedbackMessage.classList.add('is-error');
    }

    if (tone === 'success') {
      elements.feedbackMessage.classList.add('is-success');
    }
  }

  function setPlaybackStatus(label: string): void {
    playbackController.setPlaybackStatus(label);
  }
});
