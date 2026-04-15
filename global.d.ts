interface ArtworkPalette {
  start: string;
  end: string;
}

interface Track {
  id: string;
  name: string;
  path: string;
  url: string;
  title: string;
  artist: string;
  durationSeconds: number | null;
  durationText: string;
  sourceLabel: string;
  extension: string;
  initials: string;
  artwork: ArtworkPalette;
  isFavorite: boolean;
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
}

interface VersionsAPI {
  node: () => string;
  electron: () => string;
  chrome: () => string;
}

interface Window {
  audioAPI?: AudioAPI;
  versions: VersionsAPI;
  SongLookupUtils: typeof SongLookupUtils;
  DoublyLinkedPlaylist: typeof DoublyLinkedPlaylist;
  PlaylistManager: typeof PlaylistManager;
  LyricsService: typeof LyricsService;
  TranslationService: typeof TranslationService;
  createRendererElements: (documentRef: Document) => RendererElements;
  PlaylistView: typeof PlaylistView;
  NowPlayingView: typeof NowPlayingView;
  PlaybackController: typeof PlaybackController;
  SongFactory: typeof SongFactory;
  PlaylistActions: typeof PlaylistActions;
}
