type YouTubeSearchUiState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface YouTubeSearchViewCallbacks {
  onSearch: (query: string) => void;
  onPlay: (video: YouTubeVideoSummary) => void;
  onOpen: (video: YouTubeVideoSummary) => void;
  onAdd: (video: YouTubeVideoSummary, playlistId: string) => void;
}

class YoutubeSearchView {
  static fallbackThumbnail =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  documentRef: Document;
  elements: RendererElements;
  resultMap: Map<string, YouTubeVideoSummary>;

  constructor(documentRef: Document, elements: RendererElements) {
    this.documentRef = documentRef;
    this.elements = elements;
    this.resultMap = new Map();
    this.setSearchState(
      'idle',
      'Busca videos musicales oficiales, intenta reproducirlos en la app o abre el resultado en YouTube.'
    );
  }

  bindEvents(callbacks: YouTubeSearchViewCallbacks): void {
    this.elements.youtubeSearchButton.addEventListener('click', () => {
      callbacks.onSearch(this.getQuery());
    });

    this.elements.youtubeSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        callbacks.onSearch(this.getQuery());
      }
    });

    this.elements.youtubeResults.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;

      if (!target) {
        return;
      }

      const actionButton = target.closest<HTMLButtonElement>('button[data-youtube-action]');
      const action = actionButton?.dataset.youtubeAction;
      const videoId = actionButton?.dataset.videoId || '';
      const video = this.resultMap.get(videoId);

      if (!video || !action) {
        return;
      }

      if (action === 'play') {
        callbacks.onPlay(video);
        return;
      }

      if (action === 'open') {
        callbacks.onOpen(video);
        return;
      }

      if (action === 'add') {
        callbacks.onAdd(video, this.getSelectedPlaylistId());
      }
    });
  }

  getQuery(): string {
    return String(this.elements.youtubeSearchInput.value || '').trim();
  }

  getSelectedPlaylistId(): string {
    return String(this.elements.youtubePlaylistTarget.value || 'main');
  }

  setLoading(query: string): void {
    const label = query
      ? `Buscando en YouTube: "${query}"...`
      : 'Buscando videos en YouTube...';

    this.setSearchState('loading', label);
    this.elements.youtubeResults.replaceChildren();
  }

  renderConfig(config: YouTubeConfig): void {
    this.elements.youtubeApiStatus.textContent = config.message;
    this.elements.youtubeApiStatus.dataset.state = config.isConfigured ? 'ready' : 'error';
    this.elements.youtubeSearchInput.disabled = !config.isConfigured;
    this.elements.youtubeSearchButton.disabled = !config.isConfigured;

    if (!config.isConfigured) {
      this.setSearchState('error', config.message);
    }
  }

  syncPlaylistTargets(playlists: PlaylistRecord[], activePlaylistId: string | null): void {
    const options = playlists.filter((playlist) => !playlist.isFavorites);
    const previousValue = this.elements.youtubePlaylistTarget.value;
    const selectedValue =
      options.some((playlist) => playlist.id === previousValue) && previousValue
        ? previousValue
        : options.some((playlist) => playlist.id === activePlaylistId) && activePlaylistId
        ? activePlaylistId
        : options[0]?.id || 'main';

    this.elements.youtubePlaylistTarget.replaceChildren();

    options.forEach((playlist) => {
      const option = this.documentRef.createElement('option');
      option.value = playlist.id;
      option.textContent = playlist.name;
      this.elements.youtubePlaylistTarget.appendChild(option);
    });

    this.elements.youtubePlaylistTarget.value = selectedValue;
  }

  renderSearchResponse(response: YouTubeSearchResponse): void {
    this.resultMap.clear();

    if (response.status === 'error') {
      this.setSearchState('error', response.message);
      this.renderEmpty('No fue posible mostrar resultados de YouTube.');
      return;
    }

    if (response.status === 'empty' || response.results.length === 0) {
      this.setSearchState('empty', response.message || 'No se encontraron resultados de YouTube.');
      this.renderEmpty('Prueba con el nombre del artista, canción o versión oficial.');
      return;
    }

    this.setSearchState('ready', response.message);
    const fragment = this.documentRef.createDocumentFragment();

    response.results.forEach((video) => {
      this.resultMap.set(video.videoId, video);
      fragment.appendChild(this.createResultCard(video));
    });

    this.elements.youtubeResults.replaceChildren(fragment);
  }

  private renderEmpty(message: string): void {
    const empty = this.documentRef.createElement('div');
    empty.className = 'youtube-empty-state';
    empty.textContent = message;
    this.elements.youtubeResults.replaceChildren(empty);
  }

  private setSearchState(state: YouTubeSearchUiState, message: string): void {
    this.elements.youtubeSearchStatus.dataset.state = state;
    this.elements.youtubeSearchStatus.textContent = message;
  }

  private createResultCard(video: YouTubeVideoSummary): HTMLElement {
    const card = this.documentRef.createElement('article');
    const thumbnail = this.documentRef.createElement('img');
    const body = this.documentRef.createElement('div');
    const title = this.documentRef.createElement('h4');
    const meta = this.documentRef.createElement('p');
    const description = this.documentRef.createElement('p');
    const actions = this.documentRef.createElement('div');
    const playButton = this.documentRef.createElement('button');
    const openButton = this.documentRef.createElement('button');
    const addButton = this.documentRef.createElement('button');

    card.className = 'youtube-result-card';

    thumbnail.className = 'youtube-result-thumbnail';
    thumbnail.alt = `Miniatura de ${video.title}`;
    thumbnail.loading = 'lazy';
    thumbnail.src = video.thumbnailUrl || YoutubeSearchView.fallbackThumbnail;

    body.className = 'youtube-result-body';
    title.className = 'youtube-result-title';
    title.textContent = video.title;

    meta.className = 'youtube-result-meta';
    meta.textContent = this.buildMetaLine(video);

    description.className = 'youtube-result-description';
    description.textContent = video.description || 'Sin descripción disponible.';

    actions.className = 'youtube-result-actions';

    playButton.type = 'button';
    playButton.className = 'button button-primary';
    playButton.dataset.youtubeAction = 'play';
    playButton.dataset.videoId = video.videoId;
    playButton.textContent = 'Reproducir en app';

    openButton.type = 'button';
    openButton.className = 'button button-secondary';
    openButton.dataset.youtubeAction = 'open';
    openButton.dataset.videoId = video.videoId;
    openButton.textContent = 'Abrir en YouTube';

    addButton.type = 'button';
    addButton.className = 'button button-secondary';
    addButton.dataset.youtubeAction = 'add';
    addButton.dataset.videoId = video.videoId;
    addButton.textContent = 'Agregar a playlist';

    actions.appendChild(playButton);
    actions.appendChild(openButton);
    actions.appendChild(addButton);

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(description);
    body.appendChild(actions);

    card.appendChild(thumbnail);
    card.appendChild(body);

    return card;
  }

  private buildMetaLine(video: YouTubeVideoSummary): string {
    const parts = [video.channelTitle];

    if (video.durationText && video.durationText !== '--:--') {
      parts.push(video.durationText);
    }

    if (video.publishedAt) {
      const publishedDate = new Date(video.publishedAt);

      if (!Number.isNaN(publishedDate.getTime())) {
        parts.push(
          publishedDate.toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        );
      }
    }

    return parts.join(' | ');
  }
}

window.YoutubeSearchView = YoutubeSearchView;
