type FeedbackTone = 'neutral' | 'error' | 'success';

interface PlaylistActionsCallbacks {
  getActiveList: () => DoublyLinkedPlaylist | null;
  getActivePlaylistRecord: () => PlaylistRecord | null;
  getPlayingSong: () => Track | null;
  getOpenMenuSongId: () => string | null;
  setOpenMenuSongId: (songId: string | null) => void;
  getShuffleHistory: () => string[];
  setShuffleHistory: (history: string[]) => void;
  probeSongMetadata: (song: Track) => void;
  pushShuffleHistory: (songId: string) => void;
  renderPlaylists: () => void;
  renderPlaylist: () => void;
  syncPlayerInfo: () => void;
  updatePositionInputs: () => void;
  updatePlaybackProgress: () => void;
  setPlayButtonState: (isPlaying: boolean) => void;
  setPlaybackStatus: (label: string) => void;
  setFeedback: (message: string, tone?: FeedbackTone) => void;
  suppressPauseStatus: () => void;
}

interface LoadSongOptions {
  autoplay?: boolean;
  announce?: boolean;
}

class PlaylistActions {
  playlistManager: PlaylistManager;
  elements: RendererElements;
  playbackController: PlaybackController;
  callbacks: PlaylistActionsCallbacks;

  constructor(
    playlistManager: PlaylistManager,
    elements: RendererElements,
    playbackController: PlaybackController,
    callbacks: PlaylistActionsCallbacks
  ) {
    this.playlistManager = playlistManager;
    this.elements = elements;
    this.playbackController = playbackController;
    this.callbacks = callbacks;
  }

  ensureCurrentSong(): Track | null {
    const activeList = this.callbacks.getActiveList();

    if (!activeList) {
      return null;
    }

    if (!activeList.getCurrentSong() && !activeList.isEmpty()) {
      activeList.setCurrentByPosition(0);
    }

    return activeList.getCurrentSong();
  }

  syncCurrentSongSource(song: Track | null): void {
    this.playbackController.syncCurrentSong(song);
  }

  clearPlayer(): void {
    this.callbacks.suppressPauseStatus();
    this.elements.audioElement.pause();
    this.playbackController.clearSource();
    this.callbacks.setPlayButtonState(false);
    this.callbacks.renderPlaylists();
    this.callbacks.renderPlaylist();
    this.callbacks.syncPlayerInfo();
    this.callbacks.updatePlaybackProgress();
    this.callbacks.setPlaybackStatus('En espera');
  }

  loadSongFromActivePlaylist({ autoplay = true, announce = true }: LoadSongOptions = {}): void {
    const currentSong = this.ensureCurrentSong();

    if (!currentSong) {
      if (!this.callbacks.getPlayingSong()) {
        this.clearPlayer();
      } else {
        this.callbacks.renderPlaylist();
        this.callbacks.syncPlayerInfo();
      }

      return;
    }

    this.syncCurrentSongSource(currentSong);
    this.callbacks.renderPlaylists();
    this.callbacks.renderPlaylist();
    this.callbacks.syncPlayerInfo();
    this.callbacks.updatePlaybackProgress();

    if (!autoplay) {
      this.callbacks.setPlayButtonState(false);
      this.callbacks.setPlaybackStatus('Seleccionada');
      return;
    }

    const playPromise = this.elements.audioElement.play();

    if (playPromise && typeof playPromise.catch === 'function') {
      void playPromise
        .then(() => {
          this.callbacks.setPlayButtonState(true);
          this.callbacks.setPlaybackStatus('Reproduciendo');

          if (announce) {
            this.callbacks.setFeedback(`Reproduciendo "${currentSong.title}".`, 'success');
          }
        })
        .catch(() => {
          this.callbacks.setPlayButtonState(false);
          this.callbacks.setPlaybackStatus('Error de audio');
          this.callbacks.setFeedback(
            `Electron no pudo reproducir "${currentSong.title}". Revisa el archivo o prueba otro formato compatible.`,
            'error'
          );
        });
    }
  }

  handleSongMenuAction(action: SongMenuAction, index: number, shuffleEnabled: boolean): void {
    this.callbacks.setOpenMenuSongId(null);

    if (action === 'play-now') {
      const activeList = this.callbacks.getActiveList();
      const currentSong = this.callbacks.getPlayingSong();
      const selectedSong = activeList ? activeList.getAt(index) : null;

      if (
        shuffleEnabled &&
        currentSong &&
        selectedSong &&
        currentSong.id !== selectedSong.id
      ) {
        this.callbacks.pushShuffleHistory(currentSong.id);
      }

      if (activeList) {
        activeList.setCurrentByPosition(index);
      }

      this.loadSongFromActivePlaylist({ autoplay: true });
      return;
    }

    if (action === 'toggle-favorite') {
      const activeList = this.callbacks.getActiveList();
      const selectedSong = activeList ? activeList.getAt(index) : null;

      if (selectedSong) {
        this.toggleFavoriteForSong(selectedSong.id);
      }

      return;
    }

    if (action === 'remove-song') {
      this.removeSongAtIndex(index);
    }
  }

  addSongToExistingPlaylist(songIndex: number, targetPlaylistId: string): void {
    const activeList = this.callbacks.getActiveList();
    const targetPlaylist = this.playlistManager.getPlaylist(targetPlaylistId);
    const selectedSong = activeList ? activeList.getAt(songIndex) : null;

    this.callbacks.setOpenMenuSongId(null);

    if (!selectedSong || !targetPlaylist) {
      this.callbacks.setFeedback('No fue posible agregar la cancion a la playlist elegida.', 'error');
      this.callbacks.renderPlaylist();
      return;
    }

    if (!this.playlistManager.addSongToPlaylist(targetPlaylistId, selectedSong)) {
      this.callbacks.setFeedback(`"${selectedSong.title}" ya estaba en "${targetPlaylist.name}".`, 'error');
      this.callbacks.renderPlaylist();
      return;
    }

    if (!Number.isFinite(selectedSong.durationSeconds)) {
      this.callbacks.probeSongMetadata(selectedSong);
    }

    this.callbacks.renderPlaylists();
    this.callbacks.renderPlaylist();
    this.callbacks.syncPlayerInfo();
    this.callbacks.setFeedback(`"${selectedSong.title}" fue agregada a "${targetPlaylist.name}".`, 'success');
  }

  toggleFavoriteForSong(songId: string): void {
    const song = this.playlistManager.toggleFavorite(songId);

    if (!song) {
      this.callbacks.setFeedback('No fue posible actualizar el estado de favorito.', 'error');
      return;
    }

    this.callbacks.setOpenMenuSongId(null);
    this.callbacks.renderPlaylists();
    this.callbacks.renderPlaylist();
    this.callbacks.syncPlayerInfo();
    this.callbacks.updatePositionInputs();

    this.callbacks.setFeedback(
      song.isFavorite
        ? `"${song.title}" fue agregada a "Mis favoritos".`
        : `"${song.title}" fue quitada de "Mis favoritos".`,
      'success'
    );
  }

  toggleSongMenu(songId: string): void {
    const nextSongId = this.callbacks.getOpenMenuSongId() === songId ? null : songId;
    this.callbacks.setOpenMenuSongId(nextSongId);
    this.callbacks.renderPlaylist();
  }

  removeSongAtIndex(removeIndex: number): void {
    const activePlaylist = this.callbacks.getActivePlaylistRecord();
    const activeList = this.callbacks.getActiveList();
    const songToRemove = activeList ? activeList.getAt(removeIndex) : null;

    if (!activePlaylist || !activeList || !songToRemove) {
      this.callbacks.setFeedback('La cancion que intentaste eliminar ya no existe en la playlist.', 'error');
      return;
    }

    this.callbacks.setOpenMenuSongId(null);
    this.callbacks.setShuffleHistory(
      this.callbacks.getShuffleHistory().filter((songId) => songId !== songToRemove.id)
    );

    if (activePlaylist.isFavorites) {
      this.playlistManager.setFavorite(songToRemove.id, false);
      this.callbacks.renderPlaylists();
      this.callbacks.renderPlaylist();
      this.callbacks.syncPlayerInfo();
      this.callbacks.updatePositionInputs();
      this.callbacks.setFeedback(`"${songToRemove.title}" ya no forma parte de "Mis favoritos".`, 'success');
      return;
    }

    const currentSong = activeList.getCurrentSong();
    const playingSong = this.callbacks.getPlayingSong();
    const removedCurrentSong = Boolean(currentSong && currentSong.id === songToRemove.id);
    const removedPlayingSong = Boolean(playingSong && playingSong.id === songToRemove.id);
    const wasPlaying = removedPlayingSong && !this.elements.audioElement.paused;
    const removedSong = this.playlistManager.removeSongFromPlaylist(activePlaylist.id, songToRemove.id);

    if (activeList.isEmpty()) {
      if (removedPlayingSong) {
        this.clearPlayer();
      } else {
        this.callbacks.renderPlaylist();
        this.callbacks.syncPlayerInfo();
      }
    } else if (removedPlayingSong && removedCurrentSong) {
      this.loadSongFromActivePlaylist({ autoplay: wasPlaying, announce: false });
    } else {
      this.callbacks.renderPlaylist();
      this.callbacks.syncPlayerInfo();
    }

    this.callbacks.renderPlaylists();
    this.callbacks.updatePositionInputs();

    if (removedSong) {
      this.callbacks.setFeedback(`Se elimino "${removedSong.title}" de "${activePlaylist.name}".`, 'success');
    }
  }
}

window.PlaylistActions = PlaylistActions;
