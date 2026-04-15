interface ArtworkPalette {
  start: string;
  end: string;
}

type WaveSurferConstructor = typeof import('wavesurfer.js').default;
type WaveSurferInstance = import('wavesurfer.js').default;
type TrackSource = 'local' | 'youtube';

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
  source: TrackSource;
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
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
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

interface YouTubeConfig {
  isConfigured: boolean;
  message: string;
}

interface YouTubeVideoSummary {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  durationText: string;
  youtubeUrl: string;
}

interface YouTubeSearchResponse {
  status: LookupStatus;
  results: YouTubeVideoSummary[];
  message: string;
  query: string;
}

interface YouTubeAPI {
  getConfig: () => Promise<YouTubeConfig>;
  searchVideos: (query: string) => Promise<YouTubeSearchResponse>;
  openVideo: (url: string) => Promise<boolean>;
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
  youtubeAPI?: YouTubeAPI;
  versions: VersionsAPI;
  WaveSurfer?: WaveSurferConstructor;
  YT?: YouTubeIframeApiNamespace;
  onYouTubeIframeAPIReady?: () => void;
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
  YoutubeSearchView: typeof YoutubeSearchView;
  YoutubePlayerView: typeof YoutubePlayerView;
}

interface YouTubeIframePlayer {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  loadVideoById: (videoId: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (videoId: string | { videoId: string; startSeconds?: number }) => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
}

interface YouTubeIframePlayerEvent {
  target: YouTubeIframePlayer;
  data: number;
}

interface YouTubeIframeApiNamespace {
  Player: new (
    elementId: string | HTMLElement,
    options: {
      videoId?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YouTubeIframePlayerEvent) => void;
        onStateChange?: (event: YouTubeIframePlayerEvent) => void;
        onError?: (event: YouTubeIframePlayerEvent) => void;
      };
    }
  ) => YouTubeIframePlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}
