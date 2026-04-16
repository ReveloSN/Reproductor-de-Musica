interface PlaybackControllerEventHandlers {
  onSeek: (seconds: number) => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onError: () => void;
}

interface PlaybackModeRenderState {
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  repeatLabel: string;
  modeSummary: string;
}

class PlaybackController {
  elements: RendererElements;
  audioElement: HTMLAudioElement;
  formatDuration: (seconds: number) => string;

  constructor(elements: RendererElements, formatDuration: (seconds: number) => string) {
    this.elements = elements;
    this.audioElement = elements.audioElement;
    this.formatDuration = formatDuration;
    this.audioElement.volume = Number(this.elements.volumeSlider.value) / 100;
  }

  bindEvents(handlers: PlaybackControllerEventHandlers): void {
    this.elements.progressSlider.addEventListener('input', () => {
      handlers.onSeek(Number(this.elements.progressSlider.value));
    });

    this.elements.expandedProgressSlider.addEventListener('input', () => {
      handlers.onSeek(Number(this.elements.expandedProgressSlider.value));
    });

    this.elements.volumeSlider.addEventListener('input', () => {
      this.audioElement.volume = Number(this.elements.volumeSlider.value) / 100;
    });

    this.elements.expandedShuffleButton.addEventListener('click', () => {
      this.elements.shuffleButton.click();
    });
    this.elements.expandedPreviousButton.addEventListener('click', () => {
      this.elements.previousButton.click();
    });
    this.elements.expandedPlayButton.addEventListener('click', () => {
      this.elements.playButton.click();
    });
    this.elements.expandedNextButton.addEventListener('click', () => {
      this.elements.nextButton.click();
    });
    this.elements.expandedRepeatButton.addEventListener('click', () => {
      this.elements.repeatButton.click();
    });

    this.audioElement.addEventListener('loadedmetadata', handlers.onLoadedMetadata);
    this.audioElement.addEventListener('timeupdate', handlers.onTimeUpdate);
    this.audioElement.addEventListener('play', handlers.onPlay);
    this.audioElement.addEventListener('pause', handlers.onPause);
    this.audioElement.addEventListener('ended', handlers.onEnded);
    this.audioElement.addEventListener('error', handlers.onError);
  }

  getLoadedSongId(): string {
    return this.audioElement.dataset.songId || '';
  }

  syncCurrentSong(song: Pick<Track, 'id' | 'url'> | null): void {
    if (!song) {
      return;
    }

    if (this.audioElement.dataset.songId !== song.id) {
      this.audioElement.src = song.url;
      this.audioElement.dataset.songId = song.id;
      this.audioElement.load();
    }
  }

  clearSource(): void {
    this.audioElement.removeAttribute('src');
    this.audioElement.dataset.songId = '';
    this.audioElement.load();
  }

  setPlayButtonState(isPlaying: boolean): void {
    this.elements.playButton.dataset.state = isPlaying ? 'pause' : 'play';
    this.elements.expandedPlayButton.dataset.state = isPlaying ? 'pause' : 'play';
    this.elements.playPauseGlyph.textContent = isPlaying ? '||' : '>';
    this.elements.expandedPlayPauseGlyph.textContent = isPlaying ? '||' : '>';
  }

  syncModeControls({ shuffleEnabled, repeatMode, repeatLabel, modeSummary }: PlaybackModeRenderState): void {
    this.elements.shuffleButton.classList.toggle('is-active', shuffleEnabled);
    this.elements.repeatButton.classList.toggle('is-active', repeatMode !== 'off');
    this.elements.expandedShuffleButton.classList.toggle('is-active', shuffleEnabled);
    this.elements.expandedRepeatButton.classList.toggle('is-active', repeatMode !== 'off');

    const repeatIndicator = repeatMode === 'off' ? 'off' : repeatMode === 'one' ? '1' : 'all';

    this.elements.repeatIndicator.textContent = repeatIndicator;
    this.elements.expandedRepeatIndicator.textContent = repeatIndicator;
    this.elements.modeSummaryChip.textContent = modeSummary;
    this.elements.expandedModeSummary.textContent = modeSummary;
  }

  updateProgress(
    {
      currentTimeSeconds = null,
      durationSeconds = null,
      fallbackDurationSeconds = null,
    }: {
      currentTimeSeconds?: number | null;
      durationSeconds?: number | null;
      fallbackDurationSeconds?: number | null;
    } = {}
  ): void {
    const audioDuration = Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : null;
    const audioCurrentTime =
      Number.isFinite(this.audioElement.duration) && Number.isFinite(this.audioElement.currentTime)
        ? this.audioElement.currentTime
        : null;
    const resolvedDuration =
      typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
        ? durationSeconds
        : typeof audioDuration === 'number'
          ? audioDuration
          : typeof fallbackDurationSeconds === 'number' && Number.isFinite(fallbackDurationSeconds)
            ? fallbackDurationSeconds
            : 0;
    const resolvedCurrentTime =
      typeof currentTimeSeconds === 'number' && Number.isFinite(currentTimeSeconds)
        ? currentTimeSeconds
        : typeof audioCurrentTime === 'number'
          ? audioCurrentTime
          : 0;
    const duration = Math.max(resolvedDuration, 0);
    const currentTime = Math.min(Math.max(resolvedCurrentTime, 0), duration || resolvedCurrentTime);

    this.elements.progressSlider.max = String(Math.max(duration, 1));
    this.elements.progressSlider.value = String(currentTime);
    this.elements.expandedProgressSlider.max = String(Math.max(duration, 1));
    this.elements.expandedProgressSlider.value = String(currentTime);
    this.elements.currentTimeLabel.textContent = this.formatDuration(currentTime);
    this.elements.durationLabel.textContent = this.formatDuration(duration);
    this.elements.expandedCurrentTimeLabel.textContent = this.formatDuration(currentTime);
    this.elements.expandedDurationLabel.textContent = this.formatDuration(duration);
  }

  setPlaybackStatus(label: string): void {
    this.elements.playbackStatus.textContent = label;
    this.elements.expandedPlaybackStatus.textContent = label;
  }
}

window.PlaybackController = PlaybackController;
