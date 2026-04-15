document.addEventListener('DOMContentLoaded', () => {
  const playlistManager = new window.PlaylistManager(window.DoublyLinkedPlaylist);
  const lyricsService = new window.LyricsService();
  const translationService = new window.TranslationService();
  const supportedExtensions = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
  const artworkPairs = [
    { start: '#2fbf8b', end: '#4b6cb7' },
    { start: '#1f7a62', end: '#64d9c1' },
    { start: '#2a5967', end: '#74f0c7' },
    { start: '#36566e', end: '#3fcf8e' },
    { start: '#21685a', end: '#5c87ff' },
    { start: '#0f8f72', end: '#8ad8ff' },
  ];
  const repeatModeLabels = {
    off: 'Repeat off',
    one: 'Repeat one',
    all: 'Repeat all',
  };

  let songIdCounter = 0;
  let pauseStatusSuppressed = false;
  let searchTerm = '';
  let openMenuSongId = null;
  let shuffleEnabled = false;
  let repeatMode = 'off';
  let shuffleHistory = [];
  let isNowPlayingOpen = false;
  let currentLyricsSongId = '';
  let lyricsLoadToken = 0;
  const lyricsCache = new Map();

  const elements = {
    addEndButton: document.getElementById('addEndButton'),
    addStartButton: document.getElementById('addStartButton'),
    insertPosition: document.getElementById('insertPosition'),
    insertAtPositionButton: document.getElementById('insertAtPositionButton'),
    feedbackMessage: document.getElementById('feedbackMessage'),
    newPlaylistName: document.getElementById('newPlaylistName'),
    createPlaylistButton: document.getElementById('createPlaylistButton'),
    playlistHelperText: document.getElementById('playlistHelperText'),
    playlistList: document.getElementById('playlistList'),
    searchInput: document.getElementById('searchInput'),
    playlistSummaryChip: document.getElementById('playlistSummaryChip'),
    modeSummaryChip: document.getElementById('modeSummaryChip'),
    playlistSummary: document.getElementById('playlistSummary'),
    playlistDurationLabel: document.getElementById('playlistDurationLabel'),
    currentPositionLabel: document.getElementById('currentPositionLabel'),
    activePlaylistTitle: document.getElementById('activePlaylistTitle'),
    activePlaylistDescription: document.getElementById('activePlaylistDescription'),
    playlistPanelTitle: document.getElementById('playlistPanelTitle'),
    playlistResultsLabel: document.getElementById('playlistResultsLabel'),
    currentSongTitle: document.getElementById('currentSongTitle'),
    currentSongMeta: document.getElementById('currentSongMeta'),
    playbackStatus: document.getElementById('playbackStatus'),
    shuffleStateLabel: document.getElementById('shuffleStateLabel'),
    repeatStateLabel: document.getElementById('repeatStateLabel'),
    playlist: document.getElementById('playlist'),
    heroArtwork: document.getElementById('heroArtwork'),
    heroArtworkInitials: document.getElementById('heroArtworkInitials'),
    playerTrackTrigger: document.getElementById('playerTrackTrigger'),
    playerArtwork: document.getElementById('playerArtwork'),
    playerArtworkInitials: document.getElementById('playerArtworkInitials'),
    playerSongTitle: document.getElementById('playerSongTitle'),
    playerSongMeta: document.getElementById('playerSongMeta'),
    audioElement: document.getElementById('audioElement'),
    shuffleButton: document.getElementById('shuffleButton'),
    previousButton: document.getElementById('previousButton'),
    playButton: document.getElementById('playButton'),
    playPauseGlyph: document.getElementById('playPauseGlyph'),
    nextButton: document.getElementById('nextButton'),
    repeatButton: document.getElementById('repeatButton'),
    repeatIndicator: document.getElementById('repeatIndicator'),
    stopButton: document.getElementById('stopButton'),
    progressSlider: document.getElementById('progressSlider'),
    currentTimeLabel: document.getElementById('currentTimeLabel'),
    durationLabel: document.getElementById('durationLabel'),
    volumeSlider: document.getElementById('volumeSlider'),
    nowPlayingOverlay: document.getElementById('nowPlayingOverlay'),
    closeNowPlayingButton: document.getElementById('closeNowPlayingButton'),
    expandedArtwork: document.getElementById('expandedArtwork'),
    expandedArtworkInitials: document.getElementById('expandedArtworkInitials'),
    expandedSongTitle: document.getElementById('expandedSongTitle'),
    expandedSongMeta: document.getElementById('expandedSongMeta'),
    expandedSongContext: document.getElementById('expandedSongContext'),
    expandedPlaybackStatus: document.getElementById('expandedPlaybackStatus'),
    expandedModeSummary: document.getElementById('expandedModeSummary'),
    expandedShuffleButton: document.getElementById('expandedShuffleButton'),
    expandedPreviousButton: document.getElementById('expandedPreviousButton'),
    expandedPlayButton: document.getElementById('expandedPlayButton'),
    expandedPlayPauseGlyph: document.getElementById('expandedPlayPauseGlyph'),
    expandedNextButton: document.getElementById('expandedNextButton'),
    expandedRepeatButton: document.getElementById('expandedRepeatButton'),
    expandedRepeatIndicator: document.getElementById('expandedRepeatIndicator'),
    expandedProgressSlider: document.getElementById('expandedProgressSlider'),
    expandedCurrentTimeLabel: document.getElementById('expandedCurrentTimeLabel'),
    expandedDurationLabel: document.getElementById('expandedDurationLabel'),
    lyricsOriginalStatus: document.getElementById('lyricsOriginalStatus'),
    lyricsOriginalContent: document.getElementById('lyricsOriginalContent'),
    lyricsTranslatedStatus: document.getElementById('lyricsTranslatedStatus'),
    lyricsTranslatedContent: document.getElementById('lyricsTranslatedContent'),
  };

  elements.audioElement.volume = Number(elements.volumeSlider.value) / 100;

  if (!window.audioAPI) {
    setFeedback(
      'No se encontro la integracion con Electron. Revisa preload.js y vuelve a iniciar la app.',
      'error'
    );
    return;
  }

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

  function getActivePlaylistRecord() {
    return playlistManager.getActivePlaylist();
  }

  function getActiveList() {
    const activePlaylist = getActivePlaylistRecord();
    return activePlaylist ? activePlaylist.list : null;
  }

  function getPlayingSong() {
    const songId = elements.audioElement.dataset.songId || '';
    return songId ? playlistManager.getSongById(songId) : null;
  }

  function getDisplaySong() {
    return getPlayingSong() || ensureCurrentSong();
  }

  function wireEvents() {
    window.audioAPI.onMenuAudioFilesSelected((filePaths) => {
      addSongsFromPaths(filePaths, 'end');
    });

    elements.addEndButton.addEventListener('click', async () => {
      await pickFilesAndAdd('end');
    });

    elements.addStartButton.addEventListener('click', async () => {
      await pickFilesAndAdd('start');
    });

    elements.insertAtPositionButton.addEventListener('click', async () => {
      const activeList = getActiveList();
      const insertIndex = readOneBasedPosition(
        elements.insertPosition,
        (activeList ? activeList.length : 0) + 1
      );

      if (insertIndex === null) {
        return;
      }

      await pickFilesAndAdd('position', insertIndex);
    });

    elements.createPlaylistButton.addEventListener('click', () => {
      createPlaylistFromInput();
    });

    elements.newPlaylistName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        createPlaylistFromInput();
      }
    });

    elements.playlistList.addEventListener('click', handlePlaylistListClick);
    elements.playerTrackTrigger.addEventListener('click', openNowPlayingView);
    elements.playerTrackTrigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openNowPlayingView();
      }
    });
    elements.closeNowPlayingButton.addEventListener('click', closeNowPlayingView);
    elements.nowPlayingOverlay.addEventListener('click', (event) => {
      if (event.target === elements.nowPlayingOverlay) {
        closeNowPlayingView();
      }
    });

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

    elements.progressSlider.addEventListener('input', () => {
      if (!Number.isFinite(elements.audioElement.duration)) {
        return;
      }

      elements.audioElement.currentTime = Number(elements.progressSlider.value);
      updatePlaybackProgress();
    });
    elements.expandedProgressSlider.addEventListener('input', () => {
      if (!Number.isFinite(elements.audioElement.duration)) {
        return;
      }

      elements.audioElement.currentTime = Number(elements.expandedProgressSlider.value);
      updatePlaybackProgress();
    });

    elements.volumeSlider.addEventListener('input', () => {
      elements.audioElement.volume = Number(elements.volumeSlider.value) / 100;
    });
    elements.expandedShuffleButton.addEventListener('click', () => {
      elements.shuffleButton.click();
    });
    elements.expandedPreviousButton.addEventListener('click', () => {
      elements.previousButton.click();
    });
    elements.expandedPlayButton.addEventListener('click', () => {
      elements.playButton.click();
    });
    elements.expandedNextButton.addEventListener('click', () => {
      elements.nextButton.click();
    });
    elements.expandedRepeatButton.addEventListener('click', () => {
      elements.repeatButton.click();
    });

    elements.playlist.addEventListener('click', handlePlaylistClick);
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);
    elements.audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    elements.audioElement.addEventListener('timeupdate', updatePlaybackProgress);
    elements.audioElement.addEventListener('play', handlePlay);
    elements.audioElement.addEventListener('pause', handlePause);
    elements.audioElement.addEventListener('ended', handleSongEnded);
    elements.audioElement.addEventListener('error', handleAudioError);
  }

  function handlePlaylistListClick(event) {
    const playlistButton = event.target.closest('button[data-playlist-id]');

    if (!playlistButton) {
      return;
    }

    switchActivePlaylist(playlistButton.dataset.playlistId, true);
  }

  function createPlaylistFromInput() {
    const playlistName = elements.newPlaylistName.value;
    const result = playlistManager.createPlaylist(playlistName);

    if (!result.ok) {
      setFeedback(result.error, 'error');
      return;
    }

    elements.newPlaylistName.value = '';
    switchActivePlaylist(result.playlist.id, false);
    renderPlaylists();
    setFeedback(`La playlist "${result.playlist.name}" fue creada.`, 'success');
  }

  function switchActivePlaylist(playlistId, announce = false) {
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
      setFeedback(`Playlist activa: ${activePlaylist.name}.`, 'success');
    }
  }

  function syncActivePlaylistWithPlayingSong() {
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

  function handlePlaylistClick(event) {
    const favoriteToggle = event.target.closest('button[data-favorite-toggle]');

    if (favoriteToggle) {
      toggleFavoriteForSong(favoriteToggle.dataset.favoriteToggle);
      return;
    }

    const addTarget = event.target.closest('button[data-add-target-playlist]');

    if (addTarget) {
      addSongToExistingPlaylist(
        Number(addTarget.dataset.songIndex),
        addTarget.dataset.addTargetPlaylist
      );
      return;
    }

    const menuTrigger = event.target.closest('button[data-menu-trigger]');

    if (menuTrigger) {
      toggleSongMenu(menuTrigger.dataset.menuTrigger);
      return;
    }

    const menuAction = event.target.closest('button[data-action]');

    if (menuAction) {
      handleSongMenuAction(menuAction.dataset.action, Number(menuAction.dataset.songIndex));
      return;
    }

    const playlistItem = event.target.closest('button[data-index]');

    if (!playlistItem) {
      return;
    }

    const activeList = getActiveList();
    const index = Number(playlistItem.dataset.index);
    const selectedSong = activeList ? activeList.getAt(index) : null;
    const currentSong = getPlayingSong();

    if (
      shuffleEnabled &&
      currentSong &&
      selectedSong &&
      currentSong.id !== selectedSong.id
    ) {
      pushShuffleHistory(currentSong.id);
    }

    if (activeList) {
      activeList.setCurrentByPosition(index);
    }

    openMenuSongId = null;
    loadSongFromActivePlaylist(true);
  }

  function handleDocumentClick(event) {
    if (openMenuSongId && !event.target.closest('.playlist-actions')) {
      openMenuSongId = null;
      renderPlaylist();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && isNowPlayingOpen) {
      closeNowPlayingView();
      return;
    }

    if (event.key === 'Escape' && openMenuSongId) {
      openMenuSongId = null;
      renderPlaylist();
    }
  }

  function openNowPlayingView() {
    const displaySong = getDisplaySong();

    if (!displaySong) {
      setFeedback('No hay una cancion activa para abrir en vista ampliada.', 'error');
      return;
    }

    isNowPlayingOpen = true;
    elements.nowPlayingOverlay.classList.add('is-open');
    elements.nowPlayingOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('now-playing-open');
    syncNowPlayingView();
  }

  function closeNowPlayingView() {
    isNowPlayingOpen = false;
    elements.nowPlayingOverlay.classList.remove('is-open');
    elements.nowPlayingOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('now-playing-open');
  }

  function syncNowPlayingView() {
    const displaySong = getDisplaySong();

    if (!displaySong) {
      currentLyricsSongId = '';
      elements.expandedSongTitle.textContent = 'Sin cancion activa';
      elements.expandedSongMeta.textContent = 'Selecciona una cancion para abrir esta vista.';
      elements.expandedSongContext.textContent =
        'La letra y su traduccion apareceran aqui cuando esten disponibles.';
      elements.expandedModeSummary.textContent = getModeSummaryLabel();
      updateArtwork(elements.expandedArtwork, elements.expandedArtworkInitials, null);
      renderLyricsResult('original', {
        status: 'empty',
        lyrics: '',
        message: 'No se encontro letra para esta cancion',
      });
      renderLyricsResult('translated', {
        status: 'empty',
        translation: '',
        message: 'No hay traduccion disponible para esta cancion',
      });
      return;
    }

    const favoriteSuffix = displaySong.isFavorite ? ' | Favorita' : '';
    elements.expandedSongTitle.textContent = displaySong.title;
    elements.expandedSongMeta.textContent = `${displaySong.artist}${favoriteSuffix}`;
    elements.expandedSongContext.textContent =
      `${displaySong.sourceLabel} | ${displaySong.durationText} | ${summarizePath(displaySong.path)}`;
    elements.expandedModeSummary.textContent = getModeSummaryLabel();
    updateArtwork(elements.expandedArtwork, elements.expandedArtworkInitials, displaySong);

    if (isNowPlayingOpen && (currentLyricsSongId !== displaySong.id || !lyricsCache.has(displaySong.id))) {
      loadLyricsForSong(displaySong);
    }
  }

  async function loadLyricsForSong(song) {
    if (!song) {
      currentLyricsSongId = '';
      renderLyricsResult('original', {
        status: 'empty',
        lyrics: '',
        message: 'No se encontro letra para esta cancion',
      });
      renderLyricsResult('translated', {
        status: 'empty',
        translation: '',
        message: 'No hay traduccion disponible para esta cancion',
      });
      return;
    }

    currentLyricsSongId = song.id;

    if (lyricsCache.has(song.id)) {
      const cached = lyricsCache.get(song.id);
      renderLyricsResult('original', cached.original);
      renderLyricsResult('translated', cached.translation);
      return;
    }

    const token = ++lyricsLoadToken;
    renderLyricsLoadingState();

    try {
      const original = await lyricsService.getLyrics(song);

      if (token !== lyricsLoadToken) {
        return;
      }

      const translation = await translationService.getTranslation(song, original);

      if (token !== lyricsLoadToken) {
        return;
      }

      lyricsCache.set(song.id, { original, translation });
      renderLyricsResult('original', original);
      renderLyricsResult('translated', translation);
    } catch (error) {
      if (token !== lyricsLoadToken) {
        return;
      }

      renderLyricsResult('original', {
        status: 'error',
        lyrics: '',
        message: `No fue posible cargar la letra: ${error.message || error}`,
      });
      renderLyricsResult('translated', {
        status: 'error',
        translation: '',
        message: `No fue posible cargar la traduccion: ${error.message || error}`,
      });
    }
  }

  function renderLyricsLoadingState() {
    elements.lyricsOriginalStatus.textContent = 'Buscando letra...';
    elements.lyricsOriginalContent.textContent = '';
    elements.lyricsOriginalContent.classList.add('is-empty');
    elements.lyricsTranslatedStatus.textContent = 'Preparando traduccion...';
    elements.lyricsTranslatedContent.textContent = '';
    elements.lyricsTranslatedContent.classList.add('is-empty');
  }

  function renderLyricsResult(kind, result) {
    const statusElement =
      kind === 'original' ? elements.lyricsOriginalStatus : elements.lyricsTranslatedStatus;
    const contentElement =
      kind === 'original' ? elements.lyricsOriginalContent : elements.lyricsTranslatedContent;
    const text = kind === 'original' ? result.lyrics : result.translation;

    if (result.status === 'available') {
      statusElement.textContent = 'Disponible';
      contentElement.textContent = text;
      contentElement.classList.remove('is-empty');
      return;
    }

    if (result.status === 'error') {
      statusElement.textContent = 'Error';
      contentElement.textContent = result.message;
      contentElement.classList.add('is-empty');
      return;
    }

    statusElement.textContent = 'Sin datos';
    contentElement.textContent = result.message;
    contentElement.classList.add('is-empty');
  }
  function handleLoadedMetadata() {
    const currentSong = getPlayingSong();

    if (currentSong && Number.isFinite(elements.audioElement.duration)) {
      currentSong.durationSeconds = elements.audioElement.duration;
      currentSong.durationText = formatDuration(elements.audioElement.duration);
      renderPlaylist();
      syncPlayerInfo();
    }

    updatePlaybackProgress();
  }

  function handlePlay() {
    setPlayButtonState(true);
    setPlaybackStatus('Reproduciendo');
    renderPlaylist();
    syncPlayerInfo();
  }

  function handlePause() {
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

  function handleAudioError() {
    setPlayButtonState(false);
    setPlaybackStatus('Error de audio');
    setFeedback(
      'No se pudo reproducir el archivo actual. Verifica el formato o prueba con otra cancion.',
      'error'
    );
    renderPlaylist();
    syncPlayerInfo();
  }

  async function pickFilesAndAdd(mode, position = getActiveList() ? getActiveList().length : 0) {
    try {
      const filePaths = await window.audioAPI.openAudioFiles();

      if (!filePaths || filePaths.length === 0) {
        return;
      }

      addSongsFromPaths(filePaths, mode, position);
    } catch (error) {
      setFeedback(
        `No fue posible abrir el selector de archivos: ${error.message || error}`,
        'error'
      );
    }
  }

  function addSongsFromPaths(
    filePaths,
    mode,
    position = getActiveList() ? getActiveList().length : 0,
    playlistId = playlistManager.activePlaylistId
  ) {
    const songs = filePaths
      .map((filePath) => buildSong(filePath))
      .filter((song) => song !== null)
      .map((song) => playlistManager.getOrCreateSong(song));

    const ignoredFiles = filePaths.length - songs.length;

    if (songs.length === 0) {
      setFeedback(
        'Los archivos seleccionados no coinciden con los formatos soportados: mp3, wav, ogg y m4a.',
        'error'
      );
      return;
    }

    const result = playlistManager.addSongsToPlaylist(playlistId, songs, {
      mode,
      position,
    });
    const targetPlaylist = playlistManager.getPlaylist(playlistId);

    result.added.forEach((song) => {
      if (!Number.isFinite(song.durationSeconds)) {
        probeSongMetadata(song);
      }
    });

    if (
      targetPlaylist &&
      targetPlaylist.id === playlistManager.activePlaylistId &&
      !getPlayingSong() &&
      targetPlaylist.list.getCurrentSong()
    ) {
      syncCurrentSongSource(targetPlaylist.list.getCurrentSong());
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

  function buildSong(filePath) {
    const extension = window.audioAPI.extname(filePath).toLowerCase();

    if (!supportedExtensions.has(extension)) {
      return null;
    }

    const fileName = window.audioAPI.basename(filePath);
    const parsedSong = parseSongLabel(fileName, extension);
    const artwork = createArtworkPalette(`${parsedSong.title}-${filePath}`);

    return {
      id: `song-${Date.now()}-${songIdCounter++}`,
      name: fileName,
      title: parsedSong.title,
      artist: parsedSong.artist,
      path: filePath,
      url: window.audioAPI.filePathToUrl(filePath),
      extension: extension.replace('.', '').toUpperCase(),
      durationSeconds: null,
      durationText: '--:--',
      artwork,
      initials: getInitials(parsedSong.title),
      sourceLabel: 'Archivo local',
      isFavorite: false,
    };
  }

  function parseSongLabel(fileName, extension) {
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

  function createArtworkPalette(seed) {
    let hash = 0;

    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(index);
      hash |= 0;
    }

    return artworkPairs[Math.abs(hash) % artworkPairs.length];
  }

  function getInitials(title) {
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

  function probeSongMetadata(song) {
    const metadataAudio = new Audio();

    metadataAudio.preload = 'metadata';

    const cleanUp = () => {
      metadataAudio.removeAttribute('src');
      metadataAudio.load();
    };

    metadataAudio.addEventListener(
      'loadedmetadata',
      () => {
        if (Number.isFinite(metadataAudio.duration)) {
          song.durationSeconds = metadataAudio.duration;
          song.durationText = formatDuration(metadataAudio.duration);
          renderPlaylist();
          syncPlayerInfo();
          renderPlaylists();
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
  function togglePlayPause() {
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

    const currentSong = ensureCurrentSong();

    if (!currentSong) {
      setFeedback('Primero agrega canciones a la playlist activa.', 'error');
      return;
    }

    loadSongFromActivePlaylist(true);
  }

  function resumeLoadedSong(announce = false) {
    const playingSong = getPlayingSong();

    if (!playingSong) {
      loadSongFromActivePlaylist(true, announce);
      return;
    }

    const playPromise = elements.audioElement.play();

    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise
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

  function playNextSong({ fromEnded = false, announce = true } = {}) {
    const activeList = getActiveList();
    const currentSong = ensureCurrentSong();

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
    loadSongFromActivePlaylist(true, !fromEnded && announce);
    return true;
  }

  function playPreviousSong() {
    const activeList = getActiveList();
    const currentSong = ensureCurrentSong();

    if (!activeList || !currentSong) {
      return false;
    }

    if (shuffleEnabled) {
      while (shuffleHistory.length > 0) {
        const previousSongId = shuffleHistory.pop();
        const previousIndex = findSongIndexById(previousSongId);

        if (previousIndex !== -1) {
          activeList.setCurrentByPosition(previousIndex);
          loadSongFromActivePlaylist(true);
          return true;
        }
      }
    }

    const previousSong = activeList.prevSong();

    if (previousSong) {
      loadSongFromActivePlaylist(true);
      return true;
    }

    if (repeatMode === 'all' && activeList.length > 0) {
      activeList.setCurrentByPosition(activeList.length - 1);
      loadSongFromActivePlaylist(true);
      return true;
    }

    return false;
  }

  function getNextSongIndex() {
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

  function handleSongEnded() {
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

  function handleSongMenuAction(action, index) {
    openMenuSongId = null;

    if (action === 'play-now') {
      const activeList = getActiveList();
      const currentSong = getPlayingSong();
      const selectedSong = activeList ? activeList.getAt(index) : null;

      if (
        shuffleEnabled &&
        currentSong &&
        selectedSong &&
        currentSong.id !== selectedSong.id
      ) {
        pushShuffleHistory(currentSong.id);
      }

      if (activeList) {
        activeList.setCurrentByPosition(index);
      }

      loadSongFromActivePlaylist(true);
      return;
    }

    if (action === 'toggle-favorite') {
      const activeList = getActiveList();
      const selectedSong = activeList ? activeList.getAt(index) : null;

      if (selectedSong) {
        toggleFavoriteForSong(selectedSong.id);
      }

      return;
    }

    if (action === 'remove-song') {
      removeSongAtIndex(index);
    }
  }

  function addSongToExistingPlaylist(songIndex, targetPlaylistId) {
    const activeList = getActiveList();
    const targetPlaylist = playlistManager.getPlaylist(targetPlaylistId);
    const selectedSong = activeList ? activeList.getAt(songIndex) : null;

    openMenuSongId = null;

    if (!selectedSong || !targetPlaylist) {
      setFeedback('No fue posible agregar la cancion a la playlist elegida.', 'error');
      renderPlaylist();
      return;
    }

    if (!playlistManager.addSongToPlaylist(targetPlaylistId, selectedSong)) {
      setFeedback(`"${selectedSong.title}" ya estaba en "${targetPlaylist.name}".`, 'error');
      renderPlaylist();
      return;
    }

    if (!Number.isFinite(selectedSong.durationSeconds)) {
      probeSongMetadata(selectedSong);
    }

    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    setFeedback(`"${selectedSong.title}" fue agregada a "${targetPlaylist.name}".`, 'success');
  }

  function toggleFavoriteForSong(songId) {
    const song = playlistManager.toggleFavorite(songId);

    if (!song) {
      setFeedback('No fue posible actualizar el estado de favorito.', 'error');
      return;
    }

    openMenuSongId = null;
    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    updatePositionInputs();

    setFeedback(
      song.isFavorite
        ? `"${song.title}" fue agregada a "Mis favoritos".`
        : `"${song.title}" fue quitada de "Mis favoritos".`,
      'success'
    );
  }

  function toggleSongMenu(songId) {
    openMenuSongId = openMenuSongId === songId ? null : songId;
    renderPlaylist();
  }

  function removeSongAtIndex(removeIndex) {
    const activePlaylist = getActivePlaylistRecord();
    const activeList = getActiveList();
    const songToRemove = activeList ? activeList.getAt(removeIndex) : null;

    if (!activePlaylist || !activeList || !songToRemove) {
      setFeedback('La cancion que intentaste eliminar ya no existe en la playlist.', 'error');
      return;
    }

    openMenuSongId = null;
    shuffleHistory = shuffleHistory.filter((songId) => songId !== songToRemove.id);

    if (activePlaylist.isFavorites) {
      playlistManager.setFavorite(songToRemove.id, false);
      renderPlaylists();
      renderPlaylist();
      syncPlayerInfo();
      updatePositionInputs();
      setFeedback(`"${songToRemove.title}" ya no forma parte de "Mis favoritos".`, 'success');
      return;
    }

    const currentSong = activeList.getCurrentSong();
    const playingSong = getPlayingSong();
    const removedCurrentSong = currentSong && currentSong.id === songToRemove.id;
    const removedPlayingSong = playingSong && playingSong.id === songToRemove.id;
    const wasPlaying = removedPlayingSong && !elements.audioElement.paused;
    const removedSong = playlistManager.removeSongFromPlaylist(activePlaylist.id, songToRemove.id);

    if (activeList.isEmpty()) {
      if (removedPlayingSong) {
        clearPlayer();
      } else {
        renderPlaylist();
        syncPlayerInfo();
      }
    } else if (removedPlayingSong && removedCurrentSong) {
      loadSongFromActivePlaylist(wasPlaying, false);
    } else {
      renderPlaylist();
      syncPlayerInfo();
    }

    renderPlaylists();
    updatePositionInputs();
    setFeedback(`Se elimino "${removedSong.title}" de "${activePlaylist.name}".`, 'success');
  }

  function ensureCurrentSong() {
    const activeList = getActiveList();

    if (!activeList) {
      return null;
    }

    if (!activeList.getCurrentSong() && !activeList.isEmpty()) {
      activeList.setCurrentByPosition(0);
    }

    return activeList.getCurrentSong();
  }

  function loadSongFromActivePlaylist(autoplay = true, announce = true) {
    const currentSong = ensureCurrentSong();

    if (!currentSong) {
      if (!getPlayingSong()) {
        clearPlayer();
      } else {
        renderPlaylist();
        syncPlayerInfo();
      }

      return;
    }

    syncCurrentSongSource(currentSong);
    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    updatePlaybackProgress();

    if (!autoplay) {
      setPlayButtonState(false);
      setPlaybackStatus('Seleccionada');
      return;
    }

    const playPromise = elements.audioElement.play();

    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise
        .then(() => {
          setPlayButtonState(true);
          setPlaybackStatus('Reproduciendo');

          if (announce) {
            setFeedback(`Reproduciendo "${currentSong.title}".`, 'success');
          }
        })
        .catch(() => {
          setPlayButtonState(false);
          setPlaybackStatus('Error de audio');
          setFeedback(
            `Electron no pudo reproducir "${currentSong.title}". Revisa el archivo o prueba otro formato compatible.`,
            'error'
          );
        });
    }
  }

  function syncCurrentSongSource(song) {
    if (!song) {
      return;
    }

    if (elements.audioElement.dataset.songId !== song.id) {
      elements.audioElement.src = song.url;
      elements.audioElement.dataset.songId = song.id;
      elements.audioElement.load();
    }
  }

  function clearPlayer() {
    suppressPauseStatus();
    elements.audioElement.pause();
    elements.audioElement.removeAttribute('src');
    elements.audioElement.dataset.songId = '';
    elements.audioElement.load();
    setPlayButtonState(false);
    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    updatePlaybackProgress();
    setPlaybackStatus('En espera');
  }
  function getVisibleSongs() {
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

  function renderPlaylists() {
    elements.playlistList.replaceChildren();

    const activePlaylistId = playlistManager.activePlaylistId;
    const fragment = document.createDocumentFragment();

    playlistManager.getPlaylists().forEach((playlistRecord) => {
      const button = document.createElement('button');
      const badge = document.createElement('span');
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      const subtitle = document.createElement('span');
      const count = document.createElement('span');

      button.type = 'button';
      button.className = `playlist-switcher${playlistRecord.id === activePlaylistId ? ' is-active' : ''}${playlistRecord.isFavorites ? ' is-favorites' : ''}`;
      button.dataset.playlistId = playlistRecord.id;

      badge.className = 'playlist-switcher-icon';
      badge.textContent = getPlaylistBadgeLabel(playlistRecord);

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

    elements.playlistList.appendChild(fragment);
  }

  function getPlaylistBadgeLabel(playlistRecord) {
    if (playlistRecord.isFavorites) {
      return 'Fav';
    }

    if (playlistRecord.id === 'main') {
      return 'Main';
    }

    return getInitials(playlistRecord.name);
  }

  function renderPlaylist() {
    elements.playlist.replaceChildren();

    const activePlaylist = getActivePlaylistRecord();
    const activeList = getActiveList();
    const allSongs = activeList ? activeList.toArray() : [];
    const visibleSongs = getVisibleSongs();
    const playingSong = getPlayingSong();

    elements.playlistResultsLabel.textContent = searchTerm
      ? `Mostrando ${visibleSongs.length} de ${allSongs.length} canciones`
      : `Mostrando ${allSongs.length} canciones`;

    if (!activePlaylist || allSongs.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'playlist-empty';
      emptyItem.textContent = activePlaylist && activePlaylist.isFavorites
        ? 'Todavia no hay favoritas. Marca canciones con el corazon para verlas aqui.'
        : 'La playlist activa esta vacia. Agrega canciones para empezar.';
      elements.playlist.appendChild(emptyItem);
      return;
    }

    if (visibleSongs.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'playlist-empty';
      emptyItem.textContent = 'No hay resultados para la busqueda actual.';
      elements.playlist.appendChild(emptyItem);
      return;
    }

    const fragment = document.createDocumentFragment();

    visibleSongs.forEach((song) => {
      const row = document.createElement('li');
      const songButton = document.createElement('button');
      const actions = document.createElement('div');
      const favoriteButton = document.createElement('button');
      const menuButton = document.createElement('button');
      const indexCell = document.createElement('div');
      const number = document.createElement('span');
      const art = document.createElement('div');
      const titleCell = document.createElement('div');
      const titleRow = document.createElement('div');
      const title = document.createElement('strong');
      const favoritePill = document.createElement('span');
      const path = document.createElement('div');
      const metaCell = document.createElement('div');
      const meta = document.createElement('div');
      const status = document.createElement('div');
      const duration = document.createElement('div');
      const isPlayingSong = playingSong && song.id === playingSong.id;
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

      titleCell.className = 'playlist-title';
      titleRow.className = 'playlist-title-row';
      title.textContent = song.title;

      if (song.isFavorite) {
        favoritePill.className = 'playlist-favorite-pill';
        favoritePill.textContent = 'Favorita';
        titleRow.appendChild(favoritePill);
      }

      path.className = 'playlist-path';
      path.textContent = `${song.artist} | ${song.sourceLabel}`;
      path.title = `${song.artist} | ${song.sourceLabel}`;

      metaCell.className = 'playlist-meta';
      meta.className = 'playlist-detail-text';
      meta.textContent = summarizePath(song.path);
      meta.title = song.path;
      status.className = 'playlist-status';
      status.textContent = isPlayingSong ? 'Sonando' : song.isFavorite ? 'Favorita' : song.extension;

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
        const menu = document.createElement('div');
        menu.className = 'playlist-menu';
        menu.appendChild(createSongMenuButton('Reproducir ahora', 'play-now', song.index));
        menu.appendChild(
          createSongMenuButton(
            song.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorita',
            'toggle-favorite',
            song.index
          )
        );
        menu.appendChild(
          createSongMenuButton(
            activePlaylist.isFavorites ? 'Quitar de Mis favoritos' : 'Eliminar de esta playlist',
            'remove-song',
            song.index
          )
        );
        appendAddPlaylistTargets(menu, song, song.index);
        actions.appendChild(menu);
      }

      row.appendChild(songButton);
      row.appendChild(actions);
      fragment.appendChild(row);
    });

    elements.playlist.appendChild(fragment);
  }

  function appendAddPlaylistTargets(menu, song, songIndex) {
    const menuLabel = document.createElement('div');
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
      const emptyButton = document.createElement('button');
      emptyButton.type = 'button';
      emptyButton.className = 'is-disabled';
      emptyButton.textContent = 'No hay otra playlist disponible';
      menu.appendChild(emptyButton);
      return;
    }

    targetPlaylists.forEach((playlistRecord) => {
      const targetButton = document.createElement('button');
      targetButton.type = 'button';
      targetButton.textContent = playlistRecord.name;
      targetButton.dataset.addTargetPlaylist = playlistRecord.id;
      targetButton.dataset.songIndex = String(songIndex);
      menu.appendChild(targetButton);
    });
  }

  function createSongMenuButton(label, action, songIndex) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.songIndex = String(songIndex);
    return button;
  }

  function syncPlayerInfo() {
    const activePlaylist = getActivePlaylistRecord();
    const activeList = getActiveList();
    const displaySong = getDisplaySong();
    const activeSongs = activeList ? activeList.toArray() : [];
    const knownDuration = activeSongs.reduce(
      (total, song) => total + (Number.isFinite(song.durationSeconds) ? song.durationSeconds : 0),
      0
    );
    const modeSummary = getModeSummaryLabel();
    const currentIndex = activeList ? activeList.getCurrentIndex() : -1;

    if (activePlaylist) {
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

  function getPlaylistDescription(playlistRecord) {
    if (playlistRecord.isFavorites) {
      return 'Se llena automaticamente con todas tus canciones marcadas como favoritas.';
    }

    if (playlistRecord.id === 'main') {
      return 'Tu lista base para cargar, ordenar y reproducir archivos locales.';
    }

    return 'Playlist creada manualmente para organizar canciones relacionadas.';
  }

  function updateArtwork(artworkElement, initialsElement, song) {
    const palette = song ? song.artwork : { start: '#2fbf8b', end: '#4b6cb7' };
    const initials = song ? song.initials : 'LP';

    artworkElement.style.setProperty('--art-start', palette.start);
    artworkElement.style.setProperty('--art-end', palette.end);
    initialsElement.textContent = initials;
  }

  function syncControlStates() {
    elements.shuffleButton.classList.toggle('is-active', shuffleEnabled);
    elements.repeatButton.classList.toggle('is-active', repeatMode !== 'off');
    elements.expandedShuffleButton.classList.toggle('is-active', shuffleEnabled);
    elements.expandedRepeatButton.classList.toggle('is-active', repeatMode !== 'off');
    elements.repeatIndicator.textContent =
      repeatMode === 'off' ? 'off' : repeatMode === 'one' ? '1' : 'all';
    elements.expandedRepeatIndicator.textContent = elements.repeatIndicator.textContent;
    elements.modeSummaryChip.textContent = getModeSummaryLabel();
    elements.shuffleStateLabel.textContent = shuffleEnabled ? 'Shuffle on' : 'Shuffle off';
    elements.repeatStateLabel.textContent = repeatModeLabels[repeatMode];
    elements.expandedModeSummary.textContent = getModeSummaryLabel();
  }

  function setPlayButtonState(isPlaying) {
    elements.playButton.dataset.state = isPlaying ? 'pause' : 'play';
    elements.expandedPlayButton.dataset.state = isPlaying ? 'pause' : 'play';
    elements.playPauseGlyph.textContent = isPlaying ? '||' : '>';
    elements.expandedPlayPauseGlyph.textContent = isPlaying ? '||' : '>';
  }

  function updatePositionInputs() {
    const activeList = getActiveList();
    const insertMax = Math.max((activeList ? activeList.length : 0) + 1, 1);

    elements.insertPosition.max = String(insertMax);

    if (Number(elements.insertPosition.value) > insertMax || Number(elements.insertPosition.value) < 1) {
      elements.insertPosition.value = String(insertMax);
    }
  }

  function updatePlaybackProgress() {
    const hasDuration = Number.isFinite(elements.audioElement.duration);
    const duration = hasDuration ? elements.audioElement.duration : 0;
    const currentTime = hasDuration ? elements.audioElement.currentTime : 0;

    elements.progressSlider.max = String(Math.max(duration, 1));
    elements.progressSlider.value = String(currentTime);
    elements.expandedProgressSlider.max = String(Math.max(duration, 1));
    elements.expandedProgressSlider.value = String(currentTime);
    elements.currentTimeLabel.textContent = formatDuration(currentTime);
    elements.durationLabel.textContent = formatDuration(duration);
    elements.expandedCurrentTimeLabel.textContent = formatDuration(currentTime);
    elements.expandedDurationLabel.textContent = formatDuration(duration);
  }
  function readOneBasedPosition(inputElement, maxValue) {
    const rawValue = Number(inputElement.value);

    if (!Number.isInteger(rawValue) || rawValue < 1 || rawValue > Math.max(maxValue, 1)) {
      setFeedback(`La posicion debe estar entre 1 y ${Math.max(maxValue, 1)}.`, 'error');
      return null;
    }

    return rawValue - 1;
  }

  function getNextRepeatMode(currentMode) {
    if (currentMode === 'off') {
      return 'one';
    }

    if (currentMode === 'one') {
      return 'all';
    }

    return 'off';
  }

  function pushShuffleHistory(songId) {
    if (!songId) {
      return;
    }

    shuffleHistory.push(songId);

    if (shuffleHistory.length > 100) {
      shuffleHistory = shuffleHistory.slice(-100);
    }
  }

  function findSongIndexById(songId, playlistId = playlistManager.activePlaylistId) {
    return playlistManager.findSongIndex(playlistId, songId);
  }

  function getModeSummaryLabel() {
    const parts = [];

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

  function summarizePath(filePath) {
    const normalizedPath = String(filePath).replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);

    if (parts.length <= 2) {
      return normalizedPath;
    }

    return `.../${parts.slice(-2).join('/')}`;
  }

  function formatDuration(seconds) {
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

  function suppressPauseStatus() {
    pauseStatusSuppressed = true;

    window.setTimeout(() => {
      pauseStatusSuppressed = false;
    }, 0);
  }

  function setFeedback(message, tone = 'neutral') {
    elements.feedbackMessage.textContent = message;
    elements.feedbackMessage.classList.remove('is-error', 'is-success');

    if (tone === 'error') {
      elements.feedbackMessage.classList.add('is-error');
    }

    if (tone === 'success') {
      elements.feedbackMessage.classList.add('is-success');
    }
  }

  function setPlaybackStatus(label) {
    elements.playbackStatus.textContent = label;
    elements.expandedPlaybackStatus.textContent = label;
  }
});
