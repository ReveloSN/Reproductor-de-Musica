type LyricsPanelUiState = LookupStatus | 'loading';

interface ParsedLyricLine {
  timeSeconds: number;
  text: string;
  element: HTMLDivElement | null;
}

interface NowPlayingViewOptions {
  lyricsService: LyricsService;
  summarizePath: (filePath: string) => string;
  updateArtwork: (
    artworkElement: HTMLDivElement,
    initialsElement: HTMLSpanElement,
    song: Track | null
  ) => void;
}

class NowPlayingView {
  elements: RendererElements;
  lyricsService: LyricsService;
  summarizePath: (filePath: string) => string;
  updateArtwork: (
    artworkElement: HTMLDivElement,
    initialsElement: HTMLSpanElement,
    song: Track | null
  ) => void;
  isNowPlayingOpen: boolean;
  currentLyricsSongId: string;
  lyricsLoadToken: number;
  lyricsCache: Map<string, LyricsResult>;
  lastFocusedElement: HTMLElement | null;
  syncedLyricLines: ParsedLyricLine[];
  activeLyricLineIndex: number;
  lastPlaybackTimeSeconds: number | null;

  constructor(elements: RendererElements, options: NowPlayingViewOptions) {
    this.elements = elements;
    this.lyricsService = options.lyricsService;
    this.summarizePath = options.summarizePath;
    this.updateArtwork = options.updateArtwork;
    this.isNowPlayingOpen = false;
    this.currentLyricsSongId = '';
    this.lyricsLoadToken = 0;
    this.lyricsCache = new Map();
    this.lastFocusedElement = null;
    this.syncedLyricLines = [];
    this.activeLyricLineIndex = -1;
    this.lastPlaybackTimeSeconds = null;
  }

  bindEvents(onOpenRequest: () => void): void {
    this.elements.playerTrackTrigger.addEventListener('click', onOpenRequest);
    this.elements.playerTrackTrigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpenRequest();
      }
    });

    this.elements.closeNowPlayingButton.addEventListener('click', () => {
      this.close();
    });

    this.elements.nowPlayingOverlay.addEventListener('click', (event) => {
      if (event.target === this.elements.nowPlayingOverlay) {
        this.close();
      }
    });
  }

  open(displaySong: Track | null, modeSummary: string): boolean {
    if (!displaySong) {
      return false;
    }

    this.lastFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.isNowPlayingOpen = true;
    this.elements.nowPlayingOverlay.classList.add('is-open');
    this.elements.nowPlayingOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('now-playing-open');
    this.sync(displaySong, modeSummary);
    window.setTimeout(() => {
      this.elements.closeNowPlayingButton.focus();
    }, 0);
    return true;
  }

  close(): void {
    this.isNowPlayingOpen = false;
    this.elements.nowPlayingOverlay.classList.remove('is-open');
    this.elements.nowPlayingOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('now-playing-open');
    (this.lastFocusedElement || this.elements.playerTrackTrigger).focus();
  }

  isOpen(): boolean {
    return this.isNowPlayingOpen;
  }

  sync(displaySong: Track | null, modeSummary: string): void {
    if (!displaySong) {
      this.currentLyricsSongId = '';
      this.elements.expandedSongTitle.textContent = 'Sin cancion activa';
      this.elements.expandedSongMeta.textContent = 'Selecciona una cancion para abrir esta vista.';
      this.elements.expandedSongContext.textContent =
        'La letra aparecera aqui cuando este disponible.';
      this.elements.expandedModeSummary.textContent = modeSummary;
      this.updateArtwork(this.elements.expandedArtwork, this.elements.expandedArtworkInitials, null);
      this.renderLyricsResult({
        status: 'empty',
        lyrics: '',
        syncedLyrics: null,
        message: 'No se encontro letra para esta cancion',
      });
      return;
    }

    const displayArtist = window.SongLookupUtils.getDisplayArtist(displaySong);
    const displayFileName =
      window.SongLookupUtils.getDisplayFileName(displaySong) || displaySong.name;
    const favoriteSuffix = displaySong.isFavorite ? ' | Favorita' : '';
    const primaryMeta = `${displayArtist || displaySong.artist || 'Artista desconocido'}${displaySong.album ? ` | ${displaySong.album}` : ''}`;
    const contextBits = [displaySong.sourceLabel, displaySong.durationText, displayFileName];

    if (displaySong.trackNumber) {
      contextBits.push(`Pista ${displaySong.trackNumber}`);
    }

    if (displaySong.genre) {
      contextBits.push(`Genero: ${displaySong.genre}`);
    }

    contextBits.push(this.summarizePath(displaySong.filePath || displaySong.path));

    this.elements.expandedSongTitle.textContent = displaySong.title;
    this.elements.expandedSongMeta.textContent = `${primaryMeta}${favoriteSuffix}`;
    this.elements.expandedSongContext.textContent = contextBits.join(' | ');
    this.elements.expandedModeSummary.textContent = modeSummary;
    this.updateArtwork(this.elements.expandedArtwork, this.elements.expandedArtworkInitials, displaySong);

    if (
      this.isNowPlayingOpen &&
      (this.currentLyricsSongId !== displaySong.id || !this.lyricsCache.has(displaySong.id))
    ) {
      void this.loadLyricsForSong(displaySong);
    }

    const cached = this.lyricsCache.get(displaySong.id);

    if (cached) {
      this.renderLyricsResult(cached);
    }
  }

  syncPlaybackPosition(currentTimeSeconds: number | null): void {
    this.lastPlaybackTimeSeconds =
      typeof currentTimeSeconds === 'number' && Number.isFinite(currentTimeSeconds)
        ? Math.max(currentTimeSeconds, 0)
        : null;

    if (this.syncedLyricLines.length === 0) {
      return;
    }

    const nextActiveIndex = this.getActiveLyricLineIndex(this.lastPlaybackTimeSeconds);

    if (nextActiveIndex === this.activeLyricLineIndex) {
      return;
    }

    this.activeLyricLineIndex = nextActiveIndex;
    this.updateSyncedLyricClasses();
  }

  private async loadLyricsForSong(song: Track | null): Promise<void> {
    if (!song) {
      this.currentLyricsSongId = '';
      this.renderLyricsResult({
        status: 'empty',
        lyrics: '',
        syncedLyrics: null,
        message: 'No se encontro letra para esta cancion',
      });
      return;
    }

    this.currentLyricsSongId = song.id;

    if (this.lyricsCache.has(song.id)) {
      const cached = this.lyricsCache.get(song.id);

      if (cached) {
        this.renderLyricsResult(cached);
      }

      return;
    }

    const token = ++this.lyricsLoadToken;
    this.renderLyricsLoadingState();

    try {
      const original = await this.lyricsService.getLyrics(song);

      if (token !== this.lyricsLoadToken) {
        return;
      }

      this.lyricsCache.set(song.id, original);
      this.renderLyricsResult(original);
    } catch (error) {
      if (token !== this.lyricsLoadToken) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      this.renderLyricsResult({
        status: 'error',
        lyrics: '',
        syncedLyrics: null,
        message: `No fue posible cargar la letra: ${message}`,
      });
    }
  }

  private renderLyricsLoadingState(): void {
    this.resetSyncedLyrics();
    this.setLyricsPanelState('loading', 'Buscando letra...', '');
  }

  private renderLyricsResult(result: LyricsResult): void {
    if (result.status === 'available') {
      const parsedSyncedLyrics = this.parseSyncedLyrics(result.syncedLyrics);

      if (parsedSyncedLyrics.length > 0) {
        this.setLyricsStatus('Sincronizada', 'available');
        this.renderSyncedLyrics(parsedSyncedLyrics);
        this.syncPlaybackPosition(this.lastPlaybackTimeSeconds);
        return;
      }

      this.resetSyncedLyrics();
      this.setLyricsPanelState('available', 'Disponible', result.lyrics);
      return;
    }

    this.resetSyncedLyrics();

    if (result.status === 'error') {
      this.setLyricsPanelState('error', 'Error', result.message);
      return;
    }

    this.setLyricsPanelState('empty', 'Sin datos', result.message);
  }

  private setLyricsPanelState(
    state: LyricsPanelUiState,
    statusText: string,
    contentText: string
  ): void {
    this.setLyricsStatus(statusText, state);
    this.elements.lyricsOriginalContent.textContent = contentText;
    this.elements.lyricsOriginalContent.dataset.state = state;
    this.elements.lyricsOriginalContent.classList.toggle('is-empty', state !== 'available');
    this.elements.lyricsOriginalContent.classList.remove('is-synced');
  }

  private setLyricsStatus(statusText: string, state: LyricsPanelUiState): void {
    this.elements.lyricsOriginalStatus.textContent = statusText;
    this.elements.lyricsOriginalStatus.dataset.state = state;
  }

  private renderSyncedLyrics(lines: ParsedLyricLine[]): void {
    const fragment = document.createDocumentFragment();

    this.resetSyncedLyrics();
    this.elements.lyricsOriginalContent.replaceChildren();
    this.elements.lyricsOriginalContent.dataset.state = 'available';
    this.elements.lyricsOriginalContent.classList.remove('is-empty');
    this.elements.lyricsOriginalContent.classList.add('is-synced');

    this.syncedLyricLines = lines.map((line) => {
      const element = document.createElement('div');
      element.className = 'lyrics-line';
      element.textContent = line.text;
      fragment.appendChild(element);

      return {
        ...line,
        element,
      };
    });

    this.elements.lyricsOriginalContent.appendChild(fragment);
  }

  private parseSyncedLyrics(value: string | null | undefined): ParsedLyricLine[] {
    const rawLyrics = String(value || '').trim();

    if (!rawLyrics) {
      return [];
    }

    const parsedLines: ParsedLyricLine[] = [];

    rawLyrics.split(/\r?\n/).forEach((rawLine) => {
      const matches = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
      const text = rawLine.replace(/\[[^\]]+\]/g, '').trim();

      if (!text || matches.length === 0) {
        return;
      }

      matches.forEach((match) => {
        const minutes = Number(match[1] || '0');
        const seconds = Number(match[2] || '0');
        const fractionRaw = match[3] || '';
        const fraction =
          fractionRaw.length === 0
            ? 0
            : Number(`0.${fractionRaw.padEnd(3, '0').slice(0, 3)}`);

        parsedLines.push({
          timeSeconds: minutes * 60 + seconds + fraction,
          text,
          element: null,
        });
      });
    });

    return parsedLines.sort((left, right) => left.timeSeconds - right.timeSeconds);
  }

  private getActiveLyricLineIndex(currentTimeSeconds: number | null): number {
    if (currentTimeSeconds === null || this.syncedLyricLines.length === 0) {
      return -1;
    }

    let activeIndex = -1;

    this.syncedLyricLines.forEach((line, index) => {
      if (line.timeSeconds <= currentTimeSeconds + 0.12) {
        activeIndex = index;
      }
    });

    return activeIndex;
  }

  private updateSyncedLyricClasses(): void {
    this.syncedLyricLines.forEach((line, index) => {
      if (!line.element) {
        return;
      }

      line.element.classList.toggle('is-active', index === this.activeLyricLineIndex);
      line.element.classList.toggle(
        'is-past',
        this.activeLyricLineIndex !== -1 && index < this.activeLyricLineIndex
      );
    });

    if (!this.isNowPlayingOpen || this.activeLyricLineIndex === -1) {
      return;
    }

    const activeLine = this.syncedLyricLines[this.activeLyricLineIndex];

    if (!activeLine?.element) {
      return;
    }

    activeLine.element.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }

  private resetSyncedLyrics(): void {
    this.syncedLyricLines = [];
    this.activeLyricLineIndex = -1;
  }
}

window.NowPlayingView = NowPlayingView;
