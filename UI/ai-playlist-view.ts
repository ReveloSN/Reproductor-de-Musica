type AIPlaylistUiState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface AIPlaylistViewCallbacks {
  onGenerate: (prompt: string) => void;
}

class AiPlaylistView {
  documentRef: Document;
  elements: RendererElements;

  constructor(documentRef: Document, elements: RendererElements) {
    this.documentRef = documentRef;
    this.elements = elements;
    this.setState(
      'idle',
      'Describe la playlist que quieres y la IA elegira canciones ya cargadas.'
    );
    this.renderResult({
      status: 'empty',
      playlistName: 'Sin sugerencia todavia',
      summary: 'Carga canciones locales o de YouTube y luego pide una playlist con el mood que quieras.',
      trackIds: [],
      message: 'Aun no hay una seleccion generada por IA.',
    });
  }

  bindEvents(callbacks: AIPlaylistViewCallbacks): void {
    this.elements.aiGenerateButton.addEventListener('click', () => {
      callbacks.onGenerate(this.getPrompt());
    });

    this.elements.aiPromptInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        callbacks.onGenerate(this.getPrompt());
      }
    });
  }

  getPrompt(): string {
    return String(this.elements.aiPromptInput.value || '').trim();
  }

  setLoading(prompt: string): void {
    this.setState(
      'loading',
      prompt
        ? `La IA esta armando una playlist para: "${prompt}".`
        : 'La IA esta creando una playlist...'
    );
    this.elements.aiGenerateButton.disabled = true;
  }

  renderConfig(config: AIPlaylistConfig): void {
    this.elements.aiConfigStatus.textContent = config.message;
    this.elements.aiConfigStatus.dataset.state = config.isConfigured ? 'ready' : 'error';
    this.elements.aiPromptInput.disabled = !config.isConfigured;
    this.elements.aiGenerateButton.disabled = !config.isConfigured;
  }

  renderResult(result: AIPlaylistResult): void {
    this.elements.aiGenerateButton.disabled = false;
    this.elements.aiResultTitle.textContent = result.playlistName || 'Sin sugerencia todavia';
    this.elements.aiResultSummary.textContent = result.summary || result.message;
    this.elements.aiResultCount.textContent = `${result.trackIds.length} canciones`;
    this.setState(result.status === 'available' ? 'ready' : result.status, result.message);
  }

  private setState(state: AIPlaylistUiState, message: string): void {
    this.elements.aiStatus.dataset.state = state;
    this.elements.aiStatus.textContent = message;
  }
}

window.AiPlaylistView = AiPlaylistView;
