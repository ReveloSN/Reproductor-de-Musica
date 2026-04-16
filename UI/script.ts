type AddSongsMode = 'start' | 'end' | 'position';
const SIDEBAR_STORAGE_KEY = 'local-audio-player.sidebar-collapsed';

interface YouTubeSearchViewLike {
  bindEvents: (callbacks: {
    onSearch: (query: string) => void;
    onPlay: (video: YouTubeVideoSummary) => void;
    onOpen: (video: YouTubeVideoSummary) => void;
    onAdd: (video: YouTubeVideoSummary, playlistId: string) => void;
  }) => void;
  syncPlaylistTargets: (playlists: PlaylistRecord[], activePlaylistId: string | null) => void;
  renderConfig: (config: YouTubeConfig) => void;
  renderSearchResponse: (response: YouTubeSearchResponse) => void;
  setLoading: (query: string) => void;
}

interface YouTubePlayerViewLike {
  currentTrack: Track | null;
  loadTrack: (track: Track, options?: { autoplay?: boolean }) => Promise<boolean>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface AIPlaylistViewLike {
  bindEvents: (callbacks: {
    onGenerate: (prompt: string) => void;
  }) => void;
  renderConfig: (config: AIPlaylistConfig) => void;
  setLoading: (prompt: string) => void;
  renderResult: (result: AIPlaylistResult) => void;
}

document.addEventListener('DOMContentLoaded', () => {
  const playlistManager = new window.PlaylistManager(window.DoublyLinkedPlaylist);
  const lyricsService = new window.LyricsService();
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
  let activePlaybackSongId: string | null = null;
  let activePlaybackSource: TrackSource | null = null;
  let youtubeProgressTimer: number | null = null;
  let mutedVolume: number | null = null;
  let lastNonMutedVolume = 70;

  const elements = window.createRendererElements(document);
  lastNonMutedVolume = normalizeVolumeValue(Number(elements.volumeSlider.value)) || 70;
  const playlistView = new window.PlaylistView(document, elements);
  const waveformController = new window.WaveformController(elements, elements.audioElement);
  const aiPlaylistView = createAIPlaylistView();
  const youtubeSearchView = createYouTubeSearchView();
  const youtubePlayerView = createYouTubePlayerView();
  const nowPlayingView = new window.NowPlayingView(elements, {
    lyricsService,
    summarizePath,
    updateArtwork,
  });
  const playbackController = new window.PlaybackController(elements, formatDuration);
  const audioAPI = window.audioAPI;
  const aiAPI = window.aiAPI;
  const youtubeAPI = window.youtubeAPI;

  if (!audioAPI) {
    setFeedback(
      'No se encontro la integracion con Electron. Revisa preload.js y vuelve a iniciar la app.',
      'error'
    );
    return;
  }

  const electronAudioAPI: AudioAPI = audioAPI;

  function createAIPlaylistView(): AIPlaylistViewLike {
    try {
      return new window.AiPlaylistView(document, elements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markAIModuleUnavailable(`No fue posible iniciar el modulo de IA: ${message}`);
      return {
        bindEvents: () => {
          // The AI module is unavailable in this session.
        },
        renderConfig: (config) => {
          elements.aiConfigStatus.textContent = config.message;
        },
        setLoading: () => {
          elements.aiStatus.textContent = 'El modulo de IA no esta disponible en esta sesion.';
        },
        renderResult: (result) => {
          elements.aiResultTitle.textContent = result.playlistName || 'Sin sugerencia todavia';
          elements.aiResultSummary.textContent = result.summary || result.message;
          elements.aiResultCount.textContent = `${result.trackIds.length} canciones`;
        },
      };
    }
  }

  function createYouTubeSearchView(): YouTubeSearchViewLike {
    try {
      return new window.YoutubeSearchView(document, elements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markYouTubeModuleUnavailable(`No fue posible iniciar la busqueda de YouTube: ${message}`);
      return {
        bindEvents: () => {
          // The YouTube module is unavailable in this session.
        },
        syncPlaylistTargets: (playlists, activePlaylistId) => {
          const selectedId = activePlaylistId || 'main';
          elements.youtubePlaylistTarget.replaceChildren(
            ...playlists.map((playlist) => {
              const option = document.createElement('option');
              option.value = playlist.id;
              option.textContent = playlist.name;
              option.selected = playlist.id === selectedId;
              return option;
            })
          );
        },
        renderConfig: (config) => {
          elements.youtubeApiStatus.textContent = config.message;
        },
        renderSearchResponse: (response) => {
          elements.youtubeSearchStatus.textContent = response.message;
          elements.youtubeResults.replaceChildren();
        },
        setLoading: (query) => {
          elements.youtubeSearchStatus.textContent = query
            ? `Buscando en YouTube: "${query}"...`
            : 'Buscando videos en YouTube...';
        },
      };
    }
  }

  function createYouTubePlayerView(): YouTubePlayerViewLike {
    try {
      return new window.YoutubePlayerView(document, elements, {
        onStateChange: handleYouTubePlayerStateChange,
        onEnded: handleSongEnded,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markYouTubeModuleUnavailable(`No fue posible iniciar el player de YouTube: ${message}`);
      return {
        currentTrack: null,
        async loadTrack(): Promise<boolean> {
          elements.youtubePlayerStatus.textContent =
            'El player de YouTube no esta disponible en esta sesion.';
          return false;
        },
        play: () => {
          // The YouTube module is unavailable in this session.
        },
        pause: () => {
          // The YouTube module is unavailable in this session.
        },
        stop: () => {
          // The YouTube module is unavailable in this session.
        },
        seekTo: () => {
          // The YouTube module is unavailable in this session.
        },
        getCurrentTime: () => 0,
        getDuration: () => 0,
        destroy: () => {
          // The YouTube module is unavailable in this session.
        },
      };
    }
  }

  function markYouTubeModuleUnavailable(message: string): void {
    elements.youtubeApiStatus.textContent = message;
    elements.youtubeApiStatus.dataset.state = 'error';
    elements.youtubeSearchStatus.textContent =
      'El modulo de YouTube fallo al arrancar. La musica local sigue disponible.';
    elements.youtubePlayerStatus.textContent =
      'El reproductor embebido de YouTube no pudo inicializarse.';
    elements.youtubePlayerSurface.dataset.state = 'error';
    elements.youtubeSearchInput.disabled = true;
    elements.youtubeSearchButton.disabled = true;
    elements.youtubeResults.replaceChildren();
  }

  function markAIModuleUnavailable(message: string): void {
    elements.aiConfigStatus.textContent = message;
    elements.aiConfigStatus.dataset.state = 'error';
    elements.aiStatus.textContent =
      'La generacion de playlists con IA no pudo inicializarse en esta sesion.';
    elements.aiStatus.dataset.state = 'error';
    elements.aiPromptInput.disabled = true;
    elements.aiGenerateButton.disabled = true;
  }

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
      playTrack,
      clearPlayback,
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
  initializeSidebarState();
  renderPlaylists();
  renderPlaylist();
  syncPlayerInfo();
  syncControlStates();
  updatePositionInputs();
  updatePlaybackProgress();
  setPlaybackStatus('En espera');
  setPlayButtonState(false);
  syncMuteButtonState();
  syncNowPlayingView();
  void initializeAIPlaylistModule();
  void initializeYouTubeModule();

  function getActivePlaylistRecord(): PlaylistRecord | null {
    return playlistManager.getActivePlaylist();
  }

  function getActiveList(): DoublyLinkedPlaylist | null {
    const activePlaylist = getActivePlaylistRecord();
    return activePlaylist ? activePlaylist.list : null;
  }

  function getPlayingSong(): Track | null {
    return activePlaybackSongId ? playlistManager.getSongById(activePlaybackSongId) : null;
  }

  function getDisplaySong(): Track | null {
    return getPlayingSong() || playlistActions.ensureCurrentSong();
  }

  function getInsertDefaultPosition(): number {
    const activeList = getActiveList();
    return activeList ? activeList.length : 0;
  }

  function wireEvents(): void {
    window.addEventListener('beforeunload', () => {
      waveformController.destroy();
      youtubePlayerView.destroy();
      stopYoutubeProgressLoop();
    });

    electronAudioAPI.onMenuAudioFilesSelected((filePaths: string[]) => {
      void addSongsFromPaths(filePaths, 'end');
    });

    electronAudioAPI.onMenuAudioFolderSelected((selection: AudioFolderSelection) => {
      void createPlaylistFromFolderSelection(selection);
    });

    elements.sidebarToggleButton.addEventListener('click', () => {
      toggleSidebar();
    });

    elements.addEndButton.addEventListener('click', () => {
      void pickFilesAndAdd('end');
    });

    elements.addStartButton.addEventListener('click', () => {
      void pickFilesAndAdd('start');
    });

    elements.addFolderButton.addEventListener('click', () => {
      void pickFolderAndCreatePlaylist();
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
    aiPlaylistView.bindEvents({
      onGenerate: (prompt) => {
        void generatePlaylistWithAI(prompt);
      },
    });
    youtubeSearchView.bindEvents({
      onSearch: (query) => {
        void searchYouTubeVideos(query);
      },
      onPlay: (video) => {
        playYouTubeVideo(video, true, true);
      },
      onOpen: (video) => {
        void openYouTubeVideo(video, true);
      },
      onAdd: (video, playlistId) => {
        addYouTubeVideoToPlaylist(video, playlistId);
      },
    });
    elements.youtubeOpenFallbackButton.addEventListener('click', () => {
      void openCurrentYouTubeTrackExternally();
    });
    elements.muteButton.addEventListener('click', toggleMute);
    elements.volumeSlider.addEventListener('input', handleVolumeSliderInput);

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
      const currentSong = getPlayingSong();

      if (!currentSong) {
        setFeedback('No hay una cancion activa para detener.', 'error');
        return;
      }

      if (currentSong.source === 'youtube') {
        youtubePlayerView.stop();
        stopYoutubeProgressLoop();
      } else {
        suppressPauseStatus();
        elements.audioElement.pause();
        elements.audioElement.currentTime = 0;
      }

      updatePlaybackProgress();
      setPlayButtonState(false);
      setPlaybackStatus('Detenido');
      setFeedback('Reproduccion detenida.', 'success');
    });

    elements.playlist.addEventListener('click', handlePlaylistClick);
    document.querySelectorAll<HTMLButtonElement>('[data-scroll-target]').forEach((button) => {
      button.addEventListener('click', () => {
        handleQuickNavClick(button);
      });
    });
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);
    playbackController.bindEvents({
      onSeek: handleSeek,
      onLoadedMetadata: handleLoadedMetadata,
      onTimeUpdate: updatePlaybackProgress,
      onPlay: handlePlay,
      onPause: handlePause,
      onEnded: handleSongEnded,
      onError: handleAudioError,
    });
  }

  function initializeSidebarState(): void {
    applySidebarCollapsedState(readSidebarPreference(), false);
  }

  function toggleSidebar(): void {
    const isCurrentlyCollapsed = document.body.classList.contains('sidebar-collapsed');
    applySidebarCollapsedState(!isCurrentlyCollapsed, true);
  }

  function applySidebarCollapsedState(collapsed: boolean, persist: boolean): void {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    elements.sidebarToggleButton.setAttribute('aria-pressed', String(collapsed));
    elements.sidebarToggleButton.setAttribute(
      'aria-label',
      collapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'
    );
    elements.sidebarToggleButton.title = collapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral';
    elements.sidebarToggleButton.dataset.collapsed = String(collapsed);

    if (persist) {
      writeSidebarPreference(collapsed);
    }
  }

  function readSidebarPreference(): boolean {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch (_error) {
      return false;
    }
  }

  function writeSidebarPreference(collapsed: boolean): void {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch (_error) {
      // Ignore storage issues and keep the current session state.
    }
  }

  async function initializeAIPlaylistModule(): Promise<void> {
    if (!aiAPI) {
      aiPlaylistView.renderConfig({
        isConfigured: false,
        model: '',
        message: 'No se encontro la integracion segura de IA en preload/main.',
      });
      return;
    }

    try {
      const config = await aiAPI.getConfig();
      aiPlaylistView.renderConfig(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      aiPlaylistView.renderConfig({
        isConfigured: false,
        model: '',
        message: `No fue posible iniciar el modulo de IA: ${message}`,
      });
    }
  }

  async function initializeYouTubeModule(): Promise<void> {
    youtubeSearchView.syncPlaylistTargets(playlistManager.getPlaylists(), playlistManager.activePlaylistId);

    if (!youtubeAPI) {
      youtubeSearchView.renderConfig({
        isConfigured: false,
        message: 'No se encontró la integración segura de YouTube en preload/main.',
      });
      return;
    }

    try {
      const config = await youtubeAPI.getConfig();
      youtubeSearchView.renderConfig(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      youtubeSearchView.renderConfig({
        isConfigured: false,
        message: `No fue posible iniciar el modulo de YouTube: ${message}`,
      });
    }
  }

  async function searchYouTubeVideos(query: string): Promise<void> {
    if (!youtubeAPI) {
      youtubeSearchView.renderConfig({
        isConfigured: false,
        message: 'No se encontró la integración segura de YouTube en preload/main.',
      });
      return;
    }

    if (!query.trim()) {
      youtubeSearchView.renderSearchResponse({
        status: 'empty',
        results: [],
        message: 'Escribe algo para buscar videos musicales en YouTube.',
        query,
      });
      return;
    }

    youtubeSearchView.setLoading(query);
    try {
      const response = await youtubeAPI.searchVideos(query);
      youtubeSearchView.renderSearchResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      youtubeSearchView.renderSearchResponse({
        status: 'error',
        results: [],
        message: `No fue posible consultar YouTube: ${message}`,
        query,
      });
    }
  }

  function collectAIPlaylistCandidates(): AIPlaylistCandidate[] {
    return Array.from(playlistManager.songLibraryById.values())
      .map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        durationText: track.durationText,
        source: track.source,
        isFavorite: track.isFavorite,
      }))
      .sort((left, right) =>
        `${left.title} ${left.artist}`.localeCompare(`${right.title} ${right.artist}`, 'es', {
          sensitivity: 'base',
        })
      );
  }

  async function generatePlaylistWithAI(prompt: string): Promise<void> {
    if (!aiAPI) {
      aiPlaylistView.renderConfig({
        isConfigured: false,
        model: '',
        message: 'No se encontro la integracion segura de IA en preload/main.',
      });
      return;
    }

    const normalizedPrompt = String(prompt || '').trim();

    if (!normalizedPrompt) {
      aiPlaylistView.renderResult({
        status: 'error',
        playlistName: '',
        summary: '',
        trackIds: [],
        message: 'Escribe una descripcion para generar la playlist.',
      });
      return;
    }

    const candidates = collectAIPlaylistCandidates();

    if (candidates.length === 0) {
      aiPlaylistView.renderResult({
        status: 'error',
        playlistName: '',
        summary: '',
        trackIds: [],
        message: 'Primero carga canciones en la app para que la IA pueda elegir.',
      });
      return;
    }

    aiPlaylistView.setLoading(normalizedPrompt);

    try {
      const result = await aiAPI.generatePlaylist({
        prompt: normalizedPrompt,
        tracks: candidates,
      });

      aiPlaylistView.renderResult(result);

      if (result.status !== 'available' || result.trackIds.length === 0) {
        return;
      }

      const suggestedName =
        playlistManager.normalizeName(result.playlistName) || 'Playlist IA';
      const playlistName = getUniquePlaylistName(suggestedName);
      const createResult = playlistManager.createPlaylist(playlistName);

      if (!createResult.ok || !createResult.playlist) {
        setFeedback(createResult.error || 'No fue posible crear la playlist sugerida por IA.', 'error');
        return;
      }

      const tracks = result.trackIds
        .map((trackId) => playlistManager.getSongById(trackId))
        .filter((track): track is Track => Boolean(track));

      if (tracks.length === 0) {
        setFeedback('La IA no devolvio canciones validas de tu biblioteca actual.', 'error');
        return;
      }

      const targetPlaylist = createResult.playlist;
      playlistManager.addSongsToPlaylist(targetPlaylist.id, tracks, { mode: 'end' });
      switchActivePlaylist(targetPlaylist.id, false);
      renderPlaylists();

      setFeedback(
        `La IA creo "${targetPlaylist.name}" con ${tracks.length} cancion(es).`,
        'success'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      aiPlaylistView.renderResult({
        status: 'error',
        playlistName: '',
        summary: '',
        trackIds: [],
        message: `No fue posible generar la playlist con IA: ${message}`,
      });
    }
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

  function getUniquePlaylistName(baseName: string): string {
    const normalizedBase = playlistManager.normalizeName(baseName) || 'Nueva playlist';

    if (!playlistManager.nameExists(normalizedBase)) {
      return normalizedBase;
    }

    let suffix = 2;
    let candidate = `${normalizedBase} (${suffix})`;

    while (playlistManager.nameExists(candidate)) {
      suffix += 1;
      candidate = `${normalizedBase} (${suffix})`;
    }

    return candidate;
  }

  function getFolderPlaylistBaseName(folderPath: string): string {
    const normalizedPath = String(folderPath || '').replace(/[\\/]+$/, '');
    const folderName = electronAudioAPI.basename(normalizedPath);
    return playlistManager.normalizeName(folderName) || 'Nueva playlist';
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

  function handleQuickNavClick(button: HTMLButtonElement): void {
    const targetId = button.dataset.scrollTarget;

    if (!targetId) {
      return;
    }

    const targetSection = document.getElementById(targetId);

    if (!targetSection) {
      return;
    }

    document.querySelectorAll<HTMLButtonElement>('.nav-item[data-scroll-target]').forEach((item) => {
      item.classList.toggle('is-active', item === button);
    });

    targetSection.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && nowPlayingView.isOpen()) {
      closeNowPlayingView();
      return;
    }

    if (event.key === 'Escape' && openMenuSongId) {
      openMenuSongId = null;
      renderPlaylist();
      return;
    }

    if (isFormInputTarget(event.target)) {
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      elements.playButton.click();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      elements.nextButton.click();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      elements.previousButton.click();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      adjustVolume(5);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      adjustVolume(-5);
      return;
    }

    if (event.key === 'm' || event.key === 'M') {
      toggleMute();
      return;
    }

    if (event.key === 's' || event.key === 'S') {
      elements.shuffleButton.click();
    }
  }

  function isFormInputTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    );
  }

  function normalizeVolumeValue(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.min(100, Math.max(0, Math.round(value)));
  }

  function isMuted(): boolean {
    return mutedVolume !== null || normalizeVolumeValue(Number(elements.volumeSlider.value)) === 0;
  }

  function syncMuteButtonState(): void {
    const muted = isMuted();

    elements.muteButton.classList.toggle('is-muted', muted);
    elements.muteButton.title = muted ? 'Activar audio (M)' : 'Silenciar / Activar (M)';
    elements.muteButton.setAttribute(
      'aria-label',
      muted ? 'Activar audio' : 'Silenciar o activar audio'
    );
  }

  function setVolume(nextVolume: number): void {
    const normalizedVolume = normalizeVolumeValue(nextVolume);

    elements.volumeSlider.value = String(normalizedVolume);
    elements.audioElement.volume = normalizedVolume / 100;

    if (normalizedVolume > 0) {
      lastNonMutedVolume = normalizedVolume;
      mutedVolume = null;
    }

    syncMuteButtonState();
  }

  function adjustVolume(delta: number): void {
    const currentVolume = normalizeVolumeValue(Number(elements.volumeSlider.value));
    setVolume(currentVolume + delta);
  }

  function handleVolumeSliderInput(): void {
    const sliderValue = normalizeVolumeValue(Number(elements.volumeSlider.value));

    elements.volumeSlider.value = String(sliderValue);
    elements.audioElement.volume = sliderValue / 100;

    if (sliderValue > 0) {
      lastNonMutedVolume = sliderValue;
      mutedVolume = null;
    }

    syncMuteButtonState();
  }

  function toggleMute(): void {
    if (isMuted()) {
      const restoredVolume =
        mutedVolume ?? (lastNonMutedVolume > 0 ? lastNonMutedVolume : normalizeVolumeValue(70));

      mutedVolume = null;
      setVolume(restoredVolume);
      return;
    }

    const currentVolume = normalizeVolumeValue(Number(elements.volumeSlider.value));
    mutedVolume = currentVolume > 0 ? currentVolume : lastNonMutedVolume || 70;
    setVolume(0);
  }

  function openNowPlayingView(): void {
    const displaySong = getDisplaySong();

    if (!nowPlayingView.open(displaySong, getModeSummaryLabel())) {
      setFeedback('No hay una cancion activa para abrir en vista ampliada.', 'error');
      return;
    }

    updatePlaybackProgress();
    window.requestAnimationFrame(() => {
      waveformController.refreshLayout();
    });
  }

  function closeNowPlayingView(): void {
    nowPlayingView.close();
  }

  function syncNowPlayingView(): void {
    nowPlayingView.sync(getDisplaySong(), getModeSummaryLabel());
  }

  function handleSeek(seconds: number): void {
    const currentSong = getPlayingSong();

    if (!currentSong) {
      return;
    }

    if (currentSong.source === 'youtube') {
      youtubePlayerView.seekTo(seconds);
      updatePlaybackProgress();
      return;
    }

    if (!Number.isFinite(elements.audioElement.duration)) {
      return;
    }

    elements.audioElement.currentTime = seconds;
    updatePlaybackProgress();
  }

  function handleLoadedMetadata(): void {
    if (activePlaybackSource !== 'local') {
      return;
    }

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
    if (activePlaybackSource !== 'local') {
      return;
    }

    setPlayButtonState(true);
    setPlaybackStatus('Reproduciendo');
    renderPlaylist();
    syncPlayerInfo();
  }

  function handlePause(): void {
    if (activePlaybackSource !== 'local') {
      return;
    }

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
    if (activePlaybackSource !== 'local') {
      return;
    }

    setPlayButtonState(false);
    setPlaybackStatus('Error de audio');
    waveformController.clearError(
      'No fue posible renderizar la forma de onda porque el archivo actual fallo al cargarse.'
    );
    setFeedback(
      'No se pudo reproducir el archivo actual. Verifica el formato o prueba con otra cancion.',
      'error'
    );
    renderPlaylist();
    syncPlayerInfo();
  }

  function handleYouTubePlayerStateChange(change: YouTubePlayerStateChange): void {
    const youtubeTrack = youtubePlayerView.currentTrack;

    if (!youtubeTrack) {
      return;
    }

    if (change.state === 'playing') {
      activePlaybackSongId = youtubeTrack.id;
      activePlaybackSource = 'youtube';
      suppressPauseStatus();
      elements.audioElement.pause();
      startYoutubeProgressLoop();
      setPlayButtonState(true);
      setPlaybackStatus('Reproduciendo');
      updatePlaybackProgress();
      renderPlaylist();
      syncPlayerInfo();
      return;
    }

    if (activePlaybackSource !== 'youtube' || activePlaybackSongId !== youtubeTrack.id) {
      return;
    }

    if (change.state === 'paused') {
      stopYoutubeProgressLoop();
      setPlayButtonState(false);
      setPlaybackStatus('Pausado');
      updatePlaybackProgress();
      renderPlaylist();
      syncPlayerInfo();
      return;
    }

    if (change.state === 'ended') {
      stopYoutubeProgressLoop();
      setPlayButtonState(false);
      updatePlaybackProgress();
      return;
    }

    if (change.state === 'error') {
      stopYoutubeProgressLoop();
      setPlayButtonState(false);
      setPlaybackStatus('Error de YouTube');
      setFeedback(`${change.message} Si no arranca en la app, usa "Abrir en YouTube".`, 'error');
      renderPlaylist();
      syncPlayerInfo();
      return;
    }

    if (change.state === 'loading') {
      setPlaybackStatus('Cargando YouTube');
      return;
    }

    if (change.state === 'ready') {
      updatePlaybackProgress();

      if (elements.playButton.dataset.state !== 'pause') {
        setPlaybackStatus('Seleccionada');
      }
    }
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

      await addSongsFromPaths(filePaths, mode, position);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`No fue posible abrir el selector de archivos: ${message}`, 'error');
    }
  }

  async function pickFolderAndCreatePlaylist(): Promise<void> {
    try {
      const selection = await electronAudioAPI.openAudioFolder();
      await createPlaylistFromFolderSelection(selection);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`No fue posible abrir el selector de carpetas: ${message}`, 'error');
    }
  }

  async function createPlaylistFromFolderSelection(
    selection: AudioFolderSelection | null | undefined
  ): Promise<void> {
    const folderPath = String(selection?.folderPath || '').trim();
    const filePaths = Array.isArray(selection?.filePaths) ? selection.filePaths : [];

    if (!folderPath) {
      return;
    }

    const folderName = getFolderPlaylistBaseName(folderPath);

    if (filePaths.length === 0) {
      setFeedback(
        `La carpeta "${folderName}" no contiene archivos mp3, wav, ogg o m4a.`,
        'error'
      );
      return;
    }

    setFeedback(`Leyendo metadata de ${filePaths.length} archivo(s) en "${folderName}"...`);

    let songs: Track[] = [];
    let ignoredFiles = 0;

    try {
      const result = await songFactory.createSongsFromPaths(filePaths, playlistManager);
      songs = result.songs;
      ignoredFiles = result.ignoredFiles;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`No fue posible procesar la carpeta seleccionada: ${message}`, 'error');
      return;
    }

    if (songs.length === 0) {
      setFeedback(
        `No se pudieron importar canciones validas desde la carpeta "${folderName}".`,
        'error'
      );
      return;
    }

    const playlistName = getUniquePlaylistName(folderName);
    const createResult = playlistManager.createPlaylist(playlistName);

    if (!createResult.ok || !createResult.playlist) {
      setFeedback(createResult.error || 'No fue posible crear la playlist desde la carpeta.', 'error');
      return;
    }

    const targetPlaylist = createResult.playlist;
    const result = playlistManager.addSongsToPlaylist(targetPlaylist.id, songs, { mode: 'end' });

    result.added.forEach((song) => {
      if (!Number.isFinite(song.durationSeconds)) {
        songFactory.probeSongMetadata(song);
      }
    });

    switchActivePlaylist(targetPlaylist.id, false);

    const duplicateMessage =
      result.duplicates.length > 0
        ? ` ${result.duplicates.length} cancion(es) repetidas no se agregaron.`
        : '';
    const ignoredMessage =
      ignoredFiles > 0 ? ` ${ignoredFiles} archivo(s) fueron ignorados por formato.` : '';

    setFeedback(
      `Se creo la playlist "${targetPlaylist.name}" con ${result.added.length} cancion(es) desde la carpeta "${folderName}".${duplicateMessage}${ignoredMessage}`,
      'success'
    );
  }

  async function addSongsFromPaths(
    filePaths: string[],
    mode: AddSongsMode,
    position: number = getInsertDefaultPosition(),
    playlistId: string = playlistManager.activePlaylistId || 'main'
  ): Promise<void> {
    setFeedback(`Leyendo metadata de ${filePaths.length} archivo(s)...`);
    let songs: Track[] = [];
    let ignoredFiles = 0;

    try {
      const result = await songFactory.createSongsFromPaths(filePaths, playlistManager);
      songs = result.songs;
      ignoredFiles = result.ignoredFiles;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`No fue posible procesar los archivos seleccionados: ${message}`, 'error');
      return;
    }

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

  function addYouTubeVideoToPlaylist(video: YouTubeVideoSummary, playlistId: string): void {
    const playlist = playlistManager.getPlaylist(playlistId);

    if (!playlist) {
      setFeedback('No fue posible encontrar la playlist destino para YouTube.', 'error');
      return;
    }

    const track = playlistManager.getOrCreateSong(songFactory.createYouTubeTrack(video));

    if (!playlistManager.addSongToPlaylist(playlist.id, track)) {
      setFeedback(`"${track.title}" ya estaba en "${playlist.name}".`, 'error');
      return;
    }

    if (playlist.id === playlistManager.activePlaylistId && !playlist.list.getCurrentSong()) {
      playlist.list.setCurrentByPosition(0);
    }

    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    updatePositionInputs();
    setFeedback(`"${track.title}" fue agregada a "${playlist.name}" desde YouTube.`, 'success');
  }

  function playYouTubeVideo(
    video: YouTubeVideoSummary,
    autoplay = true,
    announce = true
  ): void {
    const activePlaylist = getActivePlaylistRecord();
    const targetPlaylistId =
      activePlaylist && !activePlaylist.isFavorites ? activePlaylist.id : 'main';
    const targetPlaylist = playlistManager.getPlaylist(targetPlaylistId);
    const track = playlistManager.getOrCreateSong(songFactory.createYouTubeTrack(video));

    if (targetPlaylist) {
      if (!playlistManager.hasSong(targetPlaylistId, track.id)) {
        playlistManager.addSongToPlaylist(targetPlaylistId, track);
      }

      const trackIndex = playlistManager.findSongIndex(targetPlaylistId, track.id);

      if (trackIndex !== -1) {
        targetPlaylist.list.setCurrentByPosition(trackIndex);
      }
    }

    void playYouTubeTrack(track, { autoplay, announce });
  }

  async function openYouTubeVideo(video: YouTubeVideoSummary, announce = true): Promise<void> {
    const activePlaylist = getActivePlaylistRecord();
    const targetPlaylistId =
      activePlaylist && !activePlaylist.isFavorites ? activePlaylist.id : 'main';
    const targetPlaylist = playlistManager.getPlaylist(targetPlaylistId);
    const track = playlistManager.getOrCreateSong(songFactory.createYouTubeTrack(video));

    if (targetPlaylist) {
      if (!playlistManager.hasSong(targetPlaylistId, track.id)) {
        playlistManager.addSongToPlaylist(targetPlaylistId, track);
      }

      const trackIndex = playlistManager.findSongIndex(targetPlaylistId, track.id);

      if (trackIndex !== -1) {
        targetPlaylist.list.setCurrentByPosition(trackIndex);
      }
    }

    await showYouTubeTrackSelection(track);
    const opened = await openYouTubeExternally(track.youtubeUrl || track.url);

    if (!opened) {
      setFeedback(`No fue posible abrir "${track.title}" en YouTube.`, 'error');
      return;
    }

    setPlaybackStatus('Abierto en YouTube');

    if (announce) {
      setFeedback(`"${track.title}" se abrio en YouTube.`, 'success');
    }
  }

  function clearPlayback(): void {
    activePlaybackSongId = null;
    activePlaybackSource = null;
    stopYoutubeProgressLoop();
    suppressPauseStatus();
    elements.audioElement.pause();
    playbackController.clearSource();
    youtubePlayerView.stop();
    updatePlaybackProgress();
  }

  function playTrack(song: Track, { autoplay = true, announce = true }: LoadSongOptions = {}): void {
    if (song.source === 'youtube') {
      void playYouTubeTrack(song, { autoplay, announce });
      return;
    }

    playLocalTrack(song, { autoplay, announce });
  }

  function playLocalTrack(song: Track, { autoplay = true, announce = true }: LoadSongOptions = {}): void {
    stopYoutubeProgressLoop();
    youtubePlayerView.pause();
    activePlaybackSongId = song.id;
    activePlaybackSource = 'local';
    playbackController.syncCurrentSong(song);
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
      void playPromise
        .then(() => {
          setPlayButtonState(true);
          setPlaybackStatus('Reproduciendo');
          renderPlaylist();
          syncPlayerInfo();

          if (announce) {
            setFeedback(`Reproduciendo "${song.title}".`, 'success');
          }
        })
        .catch(() => {
          setPlayButtonState(false);
          setPlaybackStatus('Error de audio');
          setFeedback(
            `Electron no pudo reproducir "${song.title}". Revisa el archivo o prueba otro formato compatible.`,
            'error'
          );
        });
    }
  }

  async function showYouTubeTrackSelection(song: Track): Promise<void> {
    if (!song.youtubeVideoId) {
      setFeedback(`"${song.title}" no tiene un video de YouTube valido.`, 'error');
      return;
    }

    clearPlayback();
    setPlayButtonState(false);
    setPlaybackStatus('Seleccionada');
    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    updatePlaybackProgress();

    const loaded = await youtubePlayerView.loadTrack(song, { autoplay: false });

    if (!loaded) {
      setPlaybackStatus('Error de YouTube');
      renderPlaylist();
      syncPlayerInfo();
      return;
    }
  }

  async function playYouTubeTrack(
    song: Track,
    { autoplay = true, announce = true }: LoadSongOptions = {}
  ): Promise<void> {
    if (!song.youtubeVideoId) {
      setFeedback(`"${song.title}" no tiene un video de YouTube valido para reproducir.`, 'error');
      return;
    }

    activePlaybackSongId = song.id;
    activePlaybackSource = 'youtube';
    stopYoutubeProgressLoop();
    suppressPauseStatus();
    elements.audioElement.pause();
    setPlayButtonState(false);
    setPlaybackStatus(autoplay ? 'Cargando YouTube' : 'Seleccionada');
    renderPlaylists();
    renderPlaylist();
    syncPlayerInfo();
    updatePlaybackProgress();

    const loaded = await youtubePlayerView.loadTrack(song, { autoplay });

    if (!loaded) {
      setPlaybackStatus('Error de YouTube');
      renderPlaylist();
      syncPlayerInfo();
      return;
    }

    updatePlaybackProgress();

    if (!autoplay) {
      setPlaybackStatus('Seleccionada');
      return;
    }

    if (announce) {
      setFeedback(`Intentando reproducir "${song.title}" en la app. Si falla, usa "Abrir en YouTube".`, 'success');
    }
  }

  async function openYouTubeExternally(url: string): Promise<boolean> {
    const targetUrl = String(url || '').trim();

    if (!targetUrl || !youtubeAPI) {
      return false;
    }

    try {
      return await youtubeAPI.openVideo(targetUrl);
    } catch (_error) {
      return false;
    }
  }

  async function openCurrentYouTubeTrackExternally(): Promise<void> {
    const youtubeTrack =
      youtubePlayerView.currentTrack ||
      (getDisplaySong()?.source === 'youtube' ? getDisplaySong() : null);

    if (!youtubeTrack?.youtubeUrl && !youtubeTrack?.url) {
      setFeedback('No hay un track de YouTube listo para abrir.', 'error');
      return;
    }

    const opened = await openYouTubeExternally(youtubeTrack.youtubeUrl || youtubeTrack.url);

    if (!opened) {
      setFeedback(`No fue posible abrir "${youtubeTrack.title}" en YouTube.`, 'error');
      return;
    }

    setPlaybackStatus('Abierto en YouTube');
    setFeedback(`"${youtubeTrack.title}" se abrio en YouTube.`, 'success');
  }

  function startYoutubeProgressLoop(): void {
    if (youtubeProgressTimer !== null) {
      return;
    }

    youtubeProgressTimer = window.setInterval(() => {
      if (activePlaybackSource === 'youtube') {
        updatePlaybackProgress();
      }
    }, 400);
  }

  function stopYoutubeProgressLoop(): void {
    if (youtubeProgressTimer === null) {
      return;
    }

    window.clearInterval(youtubeProgressTimer);
    youtubeProgressTimer = null;
  }

  function seekActiveTrackToStart(): void {
    const currentSong = getPlayingSong();

    if (!currentSong) {
      return;
    }

    if (currentSong.source === 'youtube') {
      youtubePlayerView.seekTo(0);
      return;
    }

    elements.audioElement.currentTime = 0;
  }

  function togglePlayPause(): void {
    const playingSong = getPlayingSong();

    if (playingSong) {
      if (playingSong.source === 'youtube') {
        if (elements.playButton.dataset.state === 'play') {
          resumeLoadedSong();
          return;
        }

        youtubePlayerView.pause();
        setPlaybackStatus('Pausado');
        return;
      }

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

    if (playingSong.source === 'youtube') {
      youtubePlayerView.play();
      startYoutubeProgressLoop();
      setPlayButtonState(true);
      setPlaybackStatus('Reproduciendo');
      updatePlaybackProgress();
      renderPlaylist();
      syncPlayerInfo();

      if (announce) {
        setFeedback(`Reproduciendo "${playingSong.title}" desde YouTube.`, 'success');
      }

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
      seekActiveTrackToStart();
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

    if (activePlaybackSource === 'youtube') {
      stopYoutubeProgressLoop();
      youtubePlayerView.seekTo(0);
    } else {
      suppressPauseStatus();
      elements.audioElement.currentTime = 0;
    }

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
      const searchable = [
        song.title,
        song.artist,
        song.channelTitle || '',
        song.album || '',
        song.fileName,
        song.path,
        song.extension,
        song.genre || '',
        song.sourceLabel,
        song.youtubeUrl || '',
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(searchTerm);
    });
  }

  function renderPlaylists(): void {
    const playlists = playlistManager.getPlaylists();

    playlistView.renderPlaylists({
      playlists,
      activePlaylistId: playlistManager.activePlaylistId,
    });
    youtubeSearchView.syncPlaylistTargets(playlists, playlistManager.activePlaylistId);
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

    const isEmpty = !activeList || activeList.isEmpty();
    elements.playlist.hidden = isEmpty;
    elements.playlistEmptyState.hidden = !isEmpty;
    renderNodeVisualizer();
  }

  function renderNodeVisualizer(): void {
    const visualizerElement = elements.nodeVisualizer;
    const activeList = getActiveList();

    if (!activeList || activeList.isEmpty()) {
      const emptyLabel = document.createElement('span');
      emptyLabel.className = 'node-visualizer-empty';
      emptyLabel.textContent = 'Sin nodos cargados';
      visualizerElement.replaceChildren(emptyLabel);
      return;
    }

    const total = activeList.length;
    const currentIndex = activeList.getCurrentIndex();
    const resolvedCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
    const maxVisible = 5;
    const allNodes = activeList.toArray();
    let nodesToShow = allNodes;

    if (total > maxVisible * 2 + 1) {
      const start = Math.max(0, resolvedCurrentIndex - 2);
      const end = Math.min(total - 1, resolvedCurrentIndex + 2);
      nodesToShow = allNodes.slice(start, end + 1);
    }

    const fragment = document.createDocumentFragment();
    const firstVisibleNode = nodesToShow[0];
    const lastVisibleNode = nodesToShow[nodesToShow.length - 1];

    if (firstVisibleNode && firstVisibleNode.index > 0) {
      const headEllipsis = document.createElement('span');
      headEllipsis.className = 'node-vis-ellipsis';
      headEllipsis.textContent = 'head \u00b7\u00b7\u00b7';
      fragment.appendChild(headEllipsis);
    }

    nodesToShow.forEach((song, index) => {
      const item = document.createElement('div');
      item.className = 'node-vis-item';

      if (index > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'node-vis-arrow';
        arrow.textContent = '\u21c4';
        item.appendChild(arrow);
      }

      const box = document.createElement('span');
      const classes = ['node-vis-box'];

      if (song.isCurrent) {
        classes.push('is-current');
      }

      if (song.index === 0) {
        classes.push('is-head');
      }

      if (song.index === total - 1) {
        classes.push('is-tail');
      }

      box.className = classes.join(' ');
      box.title = `${song.title} (nodo ${song.index + 1}/${total})`;
      box.textContent = song.isCurrent ? `\u25cf ${song.title}` : song.title;

      item.appendChild(box);
      fragment.appendChild(item);
    });

    if (lastVisibleNode && lastVisibleNode.index < total - 1) {
      const tailEllipsis = document.createElement('span');
      tailEllipsis.className = 'node-vis-ellipsis';
      tailEllipsis.textContent = '\u00b7\u00b7\u00b7 tail';
      fragment.appendChild(tailEllipsis);
    }

    visualizerElement.replaceChildren(fragment);
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

    if (!displaySong) {
      elements.currentSongTitle.textContent = 'Sin canciones cargadas';
      elements.currentSongMeta.textContent = 'Aun no hay reproduccion activa.';
      elements.playerSongTitle.textContent = 'Sin reproduccion';
      elements.playerSongMeta.textContent = 'Tu cola esta lista cuando quieras empezar.';
      updateArtwork(elements.heroArtwork, elements.heroArtworkInitials, null);
      updateArtwork(elements.playerArtwork, elements.playerArtworkInitials, null);
      waveformController.syncSong(null);
      syncNowPlayingView();
      return;
    }

    const displayArtist = window.SongLookupUtils.getDisplayArtist(displaySong);
    const displayFileName = window.SongLookupUtils.getDisplayFileName(displaySong) || displaySong.name;
    const favoriteSuffix = displaySong.isFavorite ? ' | Favorita' : '';
    const summarizedPath = summarizePath(displaySong.path);
    const albumSuffix = displaySong.album ? ` • ${displaySong.album}` : '';
    const playerPrimaryMeta = `${displayArtist || displaySong.artist || 'Artista desconocido'}${albumSuffix}`;
    const detailBits = [displaySong.sourceLabel, displaySong.durationText];

    if (displaySong.genre) {
      detailBits.push(`Genero: ${displaySong.genre}`);
    }

    detailBits.push(summarizedPath);

    elements.currentSongTitle.textContent = displaySong.title;
    elements.currentSongMeta.textContent = `${playerPrimaryMeta} | ${summarizedPath}${favoriteSuffix}`;
    elements.playerSongTitle.textContent = displaySong.title;
    elements.playerSongMeta.textContent =
      `${playerPrimaryMeta} | ${detailBits.join(' | ')}${favoriteSuffix}`;

    updateArtwork(elements.heroArtwork, elements.heroArtworkInitials, displaySong);
    updateArtwork(elements.playerArtwork, elements.playerArtworkInitials, displaySong);
    waveformController.syncSong(displaySong);
    syncNowPlayingView();
  }

  function getPlaylistDescription(playlistRecord: PlaylistRecord): string {
    if (playlistRecord.isFavorites) {
      return 'Tus favoritas.';
    }

    if (playlistRecord.id === 'main') {
      return 'Tu seleccion activa.';
    }

    return 'Lista personalizada.';
  }

  function updateArtwork(
    artworkElement: HTMLDivElement,
    initialsElement: HTMLSpanElement,
    song: Track | null
  ): void {
    const palette = song ? song.artwork : { start: '#2fbf8b', end: '#4b6cb7' };
    const initials = song ? song.initials : 'LP';
    const artworkImage = song ? song.artworkDataUrl : null;

    artworkElement.style.setProperty('--art-start', palette.start);
    artworkElement.style.setProperty('--art-end', palette.end);
    artworkElement.style.setProperty('--art-image', artworkImage ? `url("${artworkImage}")` : 'none');
    artworkElement.classList.toggle('has-artwork-image', Boolean(artworkImage));
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
    const currentSong = getDisplaySong();

    if (currentSong?.source === 'youtube' && activePlaybackSource === 'youtube') {
      const currentTimeSeconds = youtubePlayerView.getCurrentTime();
      const liveDuration = youtubePlayerView.getDuration();
      const durationSeconds =
        Number.isFinite(liveDuration) && liveDuration > 0
          ? liveDuration
          : currentSong.durationSeconds;

      if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0) {
        currentSong.durationSeconds = durationSeconds;
        currentSong.durationText = formatDuration(durationSeconds);
      }

      playbackController.updateProgress({
        currentTimeSeconds,
        durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : 0,
        fallbackDurationSeconds: currentSong.durationSeconds,
      });
      nowPlayingView.syncPlaybackPosition(currentTimeSeconds);
      return;
    }

    playbackController.updateProgress({
      fallbackDurationSeconds: currentSong ? currentSong.durationSeconds : null,
    });
    nowPlayingView.syncPlaybackPosition(
      Number.isFinite(elements.audioElement.currentTime) ? elements.audioElement.currentTime : null
    );
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

    if (/^https?:\/\/(www\.)?youtube\.com\/watch/i.test(normalizedPath)) {
      return normalizedPath.replace(/^https?:\/\//i, '');
    }

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
