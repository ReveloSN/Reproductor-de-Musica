interface ArtworkPalette {
  start: string;
  end: string;
}

type WaveSurferConstructor = typeof import('wavesurfer.js').default;
type WaveSurferInstance = import('wavesurfer.js').default;

interface AudioFileMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSeconds: number | null;
  genre: string | null;
  trackNumber: number | null;
  artworkDataUrl: string | null;
  artworkMimeType: string | null;
}

interface Track {
  id: string;
  name: string;
  fileName: string;
  path: string;
  filePath: string;
  url: string;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  durationText: string;
  sourceLabel: string;
  extension: string;
  initials: string;
  artwork: ArtworkPalette;
  artworkDataUrl: string | null;
  artworkMimeType: string | null;
  genre: string | null;
  trackNumber: number | null;
  isFavorite: boolean;
}

interface LyricsLookupQuery {
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
}

interface PlaylistTrackView extends Track {
  index: number;
  isCurrent: boolean;
}

interface PlaylistRecord<TTrack extends Track = Track> {
  id: string;
  name: string;
  list: DoublyLinkedPlaylist<TTrack>;
  isSystem: boolean;
  isFavorites: boolean;
}

type LookupStatus = 'available' | 'empty' | 'error';
type RepeatMode = 'off' | 'one' | 'all';

interface LyricsResult {
  status: LookupStatus;
  lyrics: string;
  message: string;
  lookupKey?: string;
  provider?: string;
}

interface TranslationResult {
  status: LookupStatus;
  translation: string;
  message: string;
  lookupKey?: string;
}

interface PlaybackState {
  currentSongId: string | null;
  status: string;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
}

interface AudioAPI {
  openAudioFiles: () => Promise<string[]>;
  onMenuAudioFilesSelected: (callback: (filePaths: string[]) => void) => void;
  filePathToUrl: (filePath: string) => string;
  basename: (filePath: string) => string;
  extname: (filePath: string) => string;
  readAudioMetadata: (filePath: string) => Promise<AudioFileMetadata>;
  fetchLyrics: (query: LyricsLookupQuery) => Promise<LyricsResult>;
}

interface VersionsAPI {
  node: () => string;
  electron: () => string;
  chrome: () => string;
}

interface Window {
  audioAPI?: AudioAPI;
  versions: VersionsAPI;
  WaveSurfer?: WaveSurferConstructor;
  SongLookupUtils: typeof SongLookupUtils;
  DoublyLinkedPlaylist: typeof DoublyLinkedPlaylist;
  PlaylistManager: typeof PlaylistManager;
  LyricsService: typeof LyricsService;
  TranslationService: typeof TranslationService;
  createRendererElements: (documentRef: Document) => RendererElements;
  WaveformController: typeof WaveformController;
  PlaylistView: typeof PlaylistView;
  NowPlayingView: typeof NowPlayingView;
  PlaybackController: typeof PlaybackController;
  SongFactory: typeof SongFactory;
  PlaylistActions: typeof PlaylistActions;
}
