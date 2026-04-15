type YouTubePlayerUiState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

interface YouTubePlayerStateChange {
  state: YouTubePlayerUiState;
  message: string;
}

interface YoutubePlayerViewOptions {
  onStateChange: (change: YouTubePlayerStateChange) => void;
  onEnded: () => void;
}

class YoutubePlayerView {
  static apiPromise: Promise<YouTubeIframeApiNamespace> | null = null;

  documentRef: Document;
  elements: RendererElements;
  onStateChange: (change: YouTubePlayerStateChange) => void;
  onEnded: () => void;
  player: YouTubeIframePlayer | null;
  currentTrack: Track | null;
  loadToken: number;
  isPlayerReady: boolean;
  suppressEndedCallback: boolean;
  pendingAutoplay: boolean;
  pendingUnmute: boolean;

  constructor(documentRef: Document, elements: RendererElements, options: YoutubePlayerViewOptions) {
    this.documentRef = documentRef;
    this.elements = elements;
    this.onStateChange = options.onStateChange;
    this.onEnded = options.onEnded;
    this.player = null;
    this.currentTrack = null;
    this.loadToken = 0;
    this.isPlayerReady = false;
    this.suppressEndedCallback = false;
    this.pendingAutoplay = false;
    this.pendingUnmute = false;

    this.setUiState('idle', 'Selecciona un video de YouTube para reproducirlo aqui.', false);
    this.elements.youtubePlayerTitle.textContent = 'Player de YouTube';
    this.elements.youtubePlayerMeta.textContent =
      'Intenta reproducir en la app. Si no arranca, puedes abrir el mismo resultado en YouTube.';
    this.renderPlaceholder('Selecciona un resultado de YouTube para empezar.');
    this.syncFallbackButton(null);
  }

  async loadTrack(track: Track, { autoplay = true }: { autoplay?: boolean } = {}): Promise<boolean> {
    if (!track.youtubeVideoId) {
      this.setUiState('error', 'El track de YouTube no tiene videoId valido.');
      return false;
    }

    const token = ++this.loadToken;
    this.currentTrack = track;
    this.suppressEndedCallback = false;
    this.pendingAutoplay = autoplay;
    this.pendingUnmute = autoplay;
    this.syncTrackCopy(track);
    this.syncFallbackButton(track);
    this.setUiState('loading', `Cargando "${track.title}" en el reproductor de YouTube...`);

    try {
      const api = await YoutubePlayerView.ensureApi(this.documentRef);

      if (token !== this.loadToken) {
        return false;
      }

      const player = await this.ensurePlayer(api);

      if (token !== this.loadToken) {
        return false;
      }

      if (autoplay) {
        player.mute();
        player.loadVideoById({ videoId: track.youtubeVideoId, startSeconds: 0 });

        window.setTimeout(() => {
          if (token !== this.loadToken || !this.player || !this.pendingAutoplay) {
            return;
          }

          this.player.playVideo();
        }, 150);
      } else {
        player.cueVideoById({ videoId: track.youtubeVideoId, startSeconds: 0 });
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setUiState('error', `No fue posible iniciar el player de YouTube: ${message}`);
      return false;
    }
  }

  play(): void {
    if (this.player) {
      this.player.playVideo();
    }
  }

  pause(): void {
    if (this.player) {
      this.player.pauseVideo();
    }
  }

  stop(): void {
    if (this.player) {
      this.suppressEndedCallback = true;
      this.player.stopVideo();
    }
  }

  seekTo(seconds: number): void {
    if (this.player && Number.isFinite(seconds) && seconds >= 0) {
      this.player.seekTo(seconds, true);
    }
  }

  getCurrentTime(): number {
    if (!this.player) {
      return 0;
    }

    return Number(this.player.getCurrentTime()) || 0;
  }

  getDuration(): number {
    if (!this.player) {
      return 0;
    }

    return Number(this.player.getDuration()) || 0;
  }

  destroy(): void {
    this.loadToken += 1;
    this.currentTrack = null;
    this.suppressEndedCallback = false;
    this.pendingAutoplay = false;
    this.pendingUnmute = false;

    if (this.player) {
      this.player.destroy();
      this.player = null;
    }

    this.isPlayerReady = false;
    this.renderPlaceholder('Selecciona un resultado de YouTube para empezar.');
    this.syncFallbackButton(null);
    this.setUiState('idle', 'Selecciona un video de YouTube para reproducirlo aqui.');
  }

  private async ensurePlayer(api: YouTubeIframeApiNamespace): Promise<YouTubeIframePlayer> {
    if (this.player) {
      return this.player;
    }

    const targetId = this.mountPlayerTarget();

    return new Promise<YouTubeIframePlayer>((resolve, reject) => {
      let resolved = false;

      const player = new api.Player(targetId, {
        width: '100%',
        height: '100%',
        playerVars: {
          enablejsapi: 1,
          autoplay: 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          origin: this.getEmbedOrigin(),
          widget_referrer: this.getWidgetReferrer(),
        },
        events: {
          onReady: () => {
            this.player = player;
            this.isPlayerReady = true;

            if (!resolved) {
              resolved = true;
              resolve(player);
            }

            this.setUiState('ready', 'Player listo. Puedes intentar reproducir el video aqui.');
          },
          onStateChange: (event) => {
            this.handlePlayerStateChange(event.data);
          },
          onError: (event) => {
            const message = this.describePlayerError(event.data);

            this.setUiState('error', message);

            if (!resolved) {
              resolved = true;
              reject(new Error(message));
            }
          },
        },
      });
    });
  }

  private mountPlayerTarget(): string {
    this.elements.youtubePlayerTarget.replaceChildren();

    const target = this.documentRef.createElement('div');
    target.id = `youtubePlayerTargetInner-${Date.now()}`;
    target.className = 'youtube-player-target-inner';
    this.elements.youtubePlayerTarget.appendChild(target);

    return target.id;
  }

  private syncTrackCopy(track: Track): void {
    const metaParts = [track.channelTitle || track.artist || 'Canal desconocido'];

    if (track.durationText && track.durationText !== '--:--') {
      metaParts.push(track.durationText);
    }

    metaParts.push('Intento interno');

    this.elements.youtubePlayerTitle.textContent = track.title;
    this.elements.youtubePlayerMeta.textContent = metaParts.join(' • ');
  }

  private renderPlaceholder(message: string): void {
    this.elements.youtubePlayerTarget.replaceChildren();

    const placeholder = this.documentRef.createElement('div');
    placeholder.className = 'youtube-player-placeholder';
    placeholder.textContent = message;
    this.elements.youtubePlayerTarget.appendChild(placeholder);
  }

  private handlePlayerStateChange(playerState: number): void {
    const states = window.YT?.PlayerState;

    if (!states) {
      return;
    }

    if (playerState === states.PLAYING) {
      this.suppressEndedCallback = false;
      this.pendingAutoplay = false;

      if (this.pendingUnmute && this.player) {
        window.setTimeout(() => {
          if (!this.player) {
            return;
          }

          try {
            this.player.unMute();
          } catch (_error) {
            // Ignore unmute failures from the iframe player.
          }
        }, 200);
      }

      this.pendingUnmute = false;
      this.setUiState('playing', 'Reproduciendo desde YouTube.');
      return;
    }

    if (playerState === states.PAUSED) {
      this.suppressEndedCallback = false;
      this.pendingAutoplay = false;
      this.pendingUnmute = false;
      this.setUiState('paused', 'Video pausado.');
      return;
    }

    if (playerState === states.ENDED) {
      this.setUiState('ended', 'El video termino.');

      if (this.suppressEndedCallback) {
        this.suppressEndedCallback = false;
        return;
      }

      this.onEnded();
      return;
    }

    if (playerState === states.BUFFERING || playerState === states.UNSTARTED) {
      this.setUiState('loading', 'YouTube esta cargando el video...');
      return;
    }

    if (playerState === states.CUED) {
      this.suppressEndedCallback = false;

      if (this.pendingAutoplay && this.player) {
        this.setUiState('loading', 'Intentando iniciar la reproduccion en YouTube...');
        this.player.playVideo();
        return;
      }

      this.pendingAutoplay = false;
      this.pendingUnmute = false;
      this.setUiState('ready', 'Video listo para reproducirse.');
    }
  }

  private setUiState(state: YouTubePlayerUiState, message: string, notify = true): void {
    this.elements.youtubePlayerSurface.dataset.state = state;
    this.elements.youtubePlayerStatus.dataset.state = state;
    this.elements.youtubePlayerStatus.textContent = message;

    if (notify) {
      this.onStateChange({ state, message });
    }
  }

  private describePlayerError(code: number): string {
    if (code === 2) {
      return 'YouTube rechazo el video solicitado por un videoId invalido.';
    }

    if (code === 5) {
      return 'El reproductor embebido de YouTube no pudo cargar el video HTML5.';
    }

    if (code === 100) {
      return 'El video de YouTube ya no esta disponible.';
    }

    if (code === 101 || code === 150) {
      return 'Este video no permite reproduccion embebida.';
    }

    if (code === 153) {
      return 'YouTube rechazo la reproduccion embebida para este entorno.';
    }

    return `YouTube devolvio un error de reproduccion (${code}).`;
  }

  private getEmbedOrigin(): string {
    const origin = this.documentRef.location?.origin || '';
    return origin && origin !== 'null' ? origin : 'http://127.0.0.1';
  }

  private getWidgetReferrer(): string {
    const href = this.documentRef.location?.href || '';
    return href || `${this.getEmbedOrigin()}/index.html`;
  }

  private syncFallbackButton(track: Track | null): void {
    const button = this.elements.youtubeOpenFallbackButton;

    if (!track?.youtubeUrl) {
      button.hidden = true;
      button.disabled = true;
      button.textContent = 'Abrir este track en YouTube';
      return;
    }

    button.hidden = false;
    button.disabled = false;
    button.textContent = `Abrir "${track.title}" en YouTube`;
  }

  static ensureApi(documentRef: Document): Promise<YouTubeIframeApiNamespace> {
    if (window.YT?.Player) {
      return Promise.resolve(window.YT);
    }

    if (!YoutubePlayerView.apiPromise) {
      YoutubePlayerView.apiPromise = new Promise<YouTubeIframeApiNamespace>((resolve, reject) => {
        const existingScript = documentRef.querySelector<HTMLScriptElement>(
          'script[data-youtube-iframe-api]'
        );
        const previousReady = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
          previousReady?.();

          if (window.YT?.Player) {
            resolve(window.YT);
            return;
          }

          reject(new Error('La IFrame Player API se cargo pero no expuso window.YT.'));
        };

        if (existingScript) {
          return;
        }

        const script = documentRef.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.youtubeIframeApi = 'true';
        script.addEventListener('error', () => {
          reject(new Error('No fue posible descargar la IFrame Player API de YouTube.'));
        });
        documentRef.head.appendChild(script);
      });
    }

    return YoutubePlayerView.apiPromise;
  }
}

window.YoutubePlayerView = YoutubePlayerView;
