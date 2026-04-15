type WaveformUiState = 'idle' | 'loading' | 'ready' | 'error';

class WaveformController {
  elements: RendererElements;
  audioElement: HTMLAudioElement;
  waveSurfer: WaveSurferInstance | null;
  currentSongId: string;
  loadToken: number;

  constructor(elements: RendererElements, audioElement: HTMLAudioElement) {
    this.elements = elements;
    this.audioElement = audioElement;
    this.waveSurfer = null;
    this.currentSongId = '';
    this.loadToken = 0;
    this.setStatus('idle', 'Selecciona una cancion para ver su forma de onda.');
  }

  private ensureWaveSurfer(): WaveSurferInstance {
    if (!window.WaveSurfer) {
      throw new Error('WaveSurfer no esta disponible en el renderer.');
    }

    if (!this.waveSurfer) {
      this.waveSurfer = window.WaveSurfer.create({
        container: this.elements.expandedWaveform,
        media: this.audioElement,
        backend: 'MediaElement',
        height: 128,
        waveColor: 'rgba(145, 162, 157, 0.34)',
        progressColor: '#53d6aa',
        cursorColor: '#f4f7f6',
        cursorWidth: 2,
        barWidth: 3,
        barGap: 2,
        barRadius: 999,
        barMinHeight: 2,
        normalize: true,
        hideScrollbar: true,
        dragToSeek: true,
      });

      this.waveSurfer.on('ready', () => {
        this.setStatus('ready', 'Forma de onda lista. Puedes hacer clic para moverte.');
      });

      this.waveSurfer.on('error', (error: Error) => {
        this.setStatus('error', `No fue posible cargar la forma de onda: ${error.message}`);
      });
    }

    return this.waveSurfer;
  }

  syncSong(song: Track | null): void {
    if (!song) {
      this.currentSongId = '';
      this.loadToken += 1;

      if (this.waveSurfer) {
        this.waveSurfer.empty();
      }

      this.setStatus('idle', 'Selecciona una cancion para ver su forma de onda.');
      return;
    }

    if (song.source === 'youtube') {
      this.currentSongId = '';
      this.loadToken += 1;

      if (this.waveSurfer) {
        this.waveSurfer.empty();
      }

      this.setStatus('idle', 'La waveform está disponible solo para archivos locales.');
      return;
    }

    if (
      this.currentSongId === song.id &&
      this.elements.expandedWaveform.dataset.state !== 'error'
    ) {
      return;
    }

    let waveSurfer: WaveSurferInstance;

    try {
      waveSurfer = this.ensureWaveSurfer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus('error', `No fue posible iniciar la waveform: ${message}`);
      return;
    }

    const token = ++this.loadToken;
    this.currentSongId = song.id;
    this.setStatus('loading', 'Cargando forma de onda...');

    void waveSurfer
      .load(song.url)
      .then(() => {
        if (token !== this.loadToken) {
          return;
        }

        this.setStatus('ready', 'Forma de onda lista. Puedes hacer clic para moverte.');
      })
      .catch((error: Error) => {
        if (token !== this.loadToken) {
          return;
        }

        this.setStatus(
          'error',
          `No fue posible cargar la forma de onda de "${song.title}": ${error.message}`
        );
      });
  }

  clearError(message: string): void {
    this.setStatus('error', message);
  }

  destroy(): void {
    this.loadToken += 1;
    this.currentSongId = '';

    if (this.waveSurfer) {
      this.waveSurfer.destroy();
      this.waveSurfer = null;
    }

    this.setStatus('idle', 'Selecciona una cancion para ver su forma de onda.');
  }

  private setStatus(state: WaveformUiState, message: string): void {
    this.elements.expandedWaveform.dataset.state = state;
    this.elements.expandedWaveformStatus.dataset.state = state;
    this.elements.expandedWaveformStatus.textContent = message;
  }
}

window.WaveformController = WaveformController;
