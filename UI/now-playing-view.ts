interface NowPlayingViewOptions {
  lyricsService: LyricsService;
  translationService: TranslationService;
  summarizePath: (filePath: string) => string;
  updateArtwork: (artworkElement: HTMLDivElement, initialsElement: HTMLSpanElement, song: Track | null) => void;
}

class NowPlayingView {
  elements: RendererElements;
  lyricsService: LyricsService;
  translationService: TranslationService;
  summarizePath: (filePath: string) => string;
  updateArtwork: (artworkElement: HTMLDivElement, initialsElement: HTMLSpanElement, song: Track | null) => void;
  isNowPlayingOpen: boolean;
  currentLyricsSongId: string;
  lyricsLoadToken: number;
  lyricsCache: Map<string, { original: LyricsResult; translation: TranslationResult }>;

  constructor(elements: RendererElements, options: NowPlayingViewOptions) {
    this.elements = elements;
    this.lyricsService = options.lyricsService;
    this.translationService = options.translationService;
    this.summarizePath = options.summarizePath;
    this.updateArtwork = options.updateArtwork;
    this.isNowPlayingOpen = false;
    this.currentLyricsSongId = '';
    this.lyricsLoadToken = 0;
    this.lyricsCache = new Map();
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

    this.isNowPlayingOpen = true;
    this.elements.nowPlayingOverlay.classList.add('is-open');
    this.elements.nowPlayingOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('now-playing-open');
    this.sync(displaySong, modeSummary);
    return true;
  }

  close(): void {
    this.isNowPlayingOpen = false;
    this.elements.nowPlayingOverlay.classList.remove('is-open');
    this.elements.nowPlayingOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('now-playing-open');
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
        'La letra y su traduccion apareceran aqui cuando esten disponibles.';
      this.elements.expandedModeSummary.textContent = modeSummary;
      this.updateArtwork(this.elements.expandedArtwork, this.elements.expandedArtworkInitials, null);
      this.renderLyricsResult('original', {
        status: 'empty',
        lyrics: '',
        message: 'No se encontro letra para esta cancion',
      });
      this.renderLyricsResult('translated', {
        status: 'empty',
        translation: '',
        message: 'No hay traduccion disponible para esta cancion',
      });
      return;
    }

    const favoriteSuffix = displaySong.isFavorite ? ' | Favorita' : '';
    this.elements.expandedSongTitle.textContent = displaySong.title;
    this.elements.expandedSongMeta.textContent = `${displaySong.artist}${favoriteSuffix}`;
    this.elements.expandedSongContext.textContent =
      `${displaySong.sourceLabel} | ${displaySong.durationText} | ${this.summarizePath(displaySong.path)}`;
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
      this.renderLyricsResult('original', cached.original);
      this.renderLyricsResult('translated', cached.translation);
    }
  }

  private async loadLyricsForSong(song: Track | null): Promise<void> {
    if (!song) {
      this.currentLyricsSongId = '';
      this.renderLyricsResult('original', {
        status: 'empty',
        lyrics: '',
        message: 'No se encontro letra para esta cancion',
      });
      this.renderLyricsResult('translated', {
        status: 'empty',
        translation: '',
        message: 'No hay traduccion disponible para esta cancion',
      });
      return;
    }

    this.currentLyricsSongId = song.id;

    if (this.lyricsCache.has(song.id)) {
      const cached = this.lyricsCache.get(song.id);

      if (cached) {
        this.renderLyricsResult('original', cached.original);
        this.renderLyricsResult('translated', cached.translation);
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

      const translation = await this.translationService.getTranslation(song, original);

      if (token !== this.lyricsLoadToken) {
        return;
      }

      this.lyricsCache.set(song.id, { original, translation });
      this.renderLyricsResult('original', original);
      this.renderLyricsResult('translated', translation);
    } catch (error) {
      if (token !== this.lyricsLoadToken) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      this.renderLyricsResult('original', {
        status: 'error',
        lyrics: '',
        message: `No fue posible cargar la letra: ${message}`,
      });
      this.renderLyricsResult('translated', {
        status: 'error',
        translation: '',
        message: `No fue posible cargar la traduccion: ${message}`,
      });
    }
  }

  private renderLyricsLoadingState(): void {
    this.elements.lyricsOriginalStatus.textContent = 'Buscando letra...';
    this.elements.lyricsOriginalContent.textContent = '';
    this.elements.lyricsOriginalContent.classList.add('is-empty');
    this.elements.lyricsTranslatedStatus.textContent = 'Preparando traduccion...';
    this.elements.lyricsTranslatedContent.textContent = '';
    this.elements.lyricsTranslatedContent.classList.add('is-empty');
  }

  private renderLyricsResult(
    kind: LyricsPanelKind,
    result: LyricsResult | TranslationResult
  ): void {
    const statusElement =
      kind === 'original' ? this.elements.lyricsOriginalStatus : this.elements.lyricsTranslatedStatus;
    const contentElement =
      kind === 'original' ? this.elements.lyricsOriginalContent : this.elements.lyricsTranslatedContent;
    const text = kind === 'original'
      ? (result as LyricsResult).lyrics
      : (result as TranslationResult).translation;

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
}

window.NowPlayingView = NowPlayingView;
