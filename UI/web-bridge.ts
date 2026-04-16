interface BrowserFileRecord {
  file: File;
  objectUrl: string;
  metadata: AudioFileMetadata | null;
  metadataPromise: Promise<AudioFileMetadata> | null;
  signature: string;
}

interface PersistedBrowserFileRecord {
  filePath: string;
  file: File;
  metadata: AudioFileMetadata | null;
  signature: string;
}

type FileSelectionInput = HTMLInputElement & {
  webkitdirectory?: boolean;
};

const browserFileRecords = new Map<string, BrowserFileRecord>();
const AUDIO_ACCEPT_VALUE = '.mp3,.wav,.ogg,.m4a,audio/*';
const AUDIO_LIBRARY_DB_NAME = 'local-audio-player-audio-library';
const AUDIO_LIBRARY_DB_VERSION = 1;
const AUDIO_LIBRARY_STORE_NAME = 'audio-files';

let audioLibraryDbPromise: Promise<IDBDatabase> | null = null;

function createEmptyMetadata(): AudioFileMetadata {
  return {
    title: null,
    artist: null,
    album: null,
    durationSeconds: null,
    genre: null,
    trackNumber: null,
    artworkDataUrl: null,
    artworkMimeType: null,
  };
}

function basename(filePath: string): string {
  const normalizedPath = String(filePath).replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || normalizedPath;
}

function extname(filePath: string): string {
  const fileName = basename(filePath);
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return '';
  }

  return fileName.slice(lastDotIndex);
}

function normalizeDisplayPath(value: string): string {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
}

function createFileSignature(file: File): string {
  return [file.name, file.size, file.lastModified, file.type].join(':');
}

function openAudioLibraryDb(): Promise<IDBDatabase> {
  if (audioLibraryDbPromise) {
    return audioLibraryDbPromise;
  }

  audioLibraryDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB no esta disponible en este navegador.'));
      return;
    }

    const request = window.indexedDB.open(AUDIO_LIBRARY_DB_NAME, AUDIO_LIBRARY_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(AUDIO_LIBRARY_STORE_NAME)) {
        database.createObjectStore(AUDIO_LIBRARY_STORE_NAME, {
          keyPath: 'filePath',
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('No fue posible abrir IndexedDB.'));
    };
  }).catch((error) => {
    audioLibraryDbPromise = null;
    throw error;
  });

  return audioLibraryDbPromise as Promise<IDBDatabase>;
}

async function persistBrowserFileRecord(filePath: string, record: BrowserFileRecord): Promise<void> {
  try {
    const database = await openAudioLibraryDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(AUDIO_LIBRARY_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(AUDIO_LIBRARY_STORE_NAME);
      const payload: PersistedBrowserFileRecord = {
        filePath,
        file: record.file,
        metadata: record.metadata,
        signature: record.signature,
      };

      store.put(payload);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error || new Error('No fue posible guardar el archivo local.'));
    });
  } catch (_error) {
    // Ignore persistence failures and keep the in-memory session working.
  }
}

async function restorePersistedBrowserFileRecords(): Promise<string[]> {
  try {
    const database = await openAudioLibraryDb();
    const records = await new Promise<PersistedBrowserFileRecord[]>((resolve, reject) => {
      const transaction = database.transaction(AUDIO_LIBRARY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(AUDIO_LIBRARY_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as PersistedBrowserFileRecord[]) || []);
      };

      request.onerror = () => {
        reject(request.error || new Error('No fue posible restaurar la biblioteca local.'));
      };
    });

    const restoredPaths: string[] = [];

    records.forEach((record) => {
      if (!record?.filePath || !record.file) {
        return;
      }

      if (browserFileRecords.has(record.filePath)) {
        restoredPaths.push(record.filePath);
        return;
      }

      browserFileRecords.set(record.filePath, {
        file: record.file,
        objectUrl: URL.createObjectURL(record.file),
        metadata: record.metadata || null,
        metadataPromise: null,
        signature: record.signature || createFileSignature(record.file),
      });
      restoredPaths.push(record.filePath);
    });

    return restoredPaths;
  } catch (_error) {
    return [];
  }
}

function withNumericSuffix(filePath: string, suffix: number): string {
  const extension = extname(filePath);
  const baseName = basename(filePath);
  const nameWithoutExtension = extension ? baseName.slice(0, -extension.length) : baseName;
  const normalizedPath = normalizeDisplayPath(filePath);
  const directory = normalizedPath.includes('/')
    ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/'))
    : '';
  const nextName = `${nameWithoutExtension} (${suffix})${extension}`;

  return directory ? `${directory}/${nextName}` : nextName;
}

function resolveUniqueDisplayPath(preferredPath: string, file: File): string {
  const normalizedPreferredPath = normalizeDisplayPath(preferredPath) || file.name;
  const signature = createFileSignature(file);
  let candidatePath = normalizedPreferredPath;
  let suffix = 2;

  while (browserFileRecords.has(candidatePath)) {
    const existingRecord = browserFileRecords.get(candidatePath);

    if (existingRecord?.signature === signature) {
      return candidatePath;
    }

    candidatePath = withNumericSuffix(normalizedPreferredPath, suffix);
    suffix += 1;
  }

  return candidatePath;
}

function registerSelectedFiles(files: File[], { preferRelativePath = false }: { preferRelativePath?: boolean } = {}): string[] {
  const resolvedPaths: string[] = [];

  files.forEach((file) => {
    const preferredPath =
      preferRelativePath && normalizeDisplayPath((file as File & { webkitRelativePath?: string }).webkitRelativePath)
        ? normalizeDisplayPath((file as File & { webkitRelativePath?: string }).webkitRelativePath)
        : file.name;
    const displayPath = resolveUniqueDisplayPath(preferredPath, file);
    const existingRecord = browserFileRecords.get(displayPath);

    if (existingRecord) {
      resolvedPaths.push(displayPath);
      return;
    }

    const nextRecord: BrowserFileRecord = {
      file,
      objectUrl: URL.createObjectURL(file),
      metadata: null,
      metadataPromise: null,
      signature: createFileSignature(file),
    };
    browserFileRecords.set(displayPath, nextRecord);
    void persistBrowserFileRecord(displayPath, nextRecord);
    resolvedPaths.push(displayPath);
  });

  return resolvedPaths;
}

function createPickerInput({ folderMode = false }: { folderMode?: boolean } = {}): FileSelectionInput {
  const input = document.createElement('input') as FileSelectionInput;
  input.type = 'file';
  input.accept = AUDIO_ACCEPT_VALUE;
  input.multiple = true;
  input.hidden = true;

  if (folderMode) {
    input.webkitdirectory = true;
  }

  document.body.appendChild(input);
  return input;
}

function pickFilesWithInput(input: FileSelectionInput): Promise<File[]> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (files: File[] = []): void => {
      if (settled) {
        return;
      }

      settled = true;
      input.removeEventListener('change', handleChange);
      window.removeEventListener('focus', handleFocus);
      resolve(files);
    };

    const handleChange = (): void => {
      finish(Array.from(input.files || []));
    };

    const handleFocus = (): void => {
      window.setTimeout(() => {
        finish(Array.from(input.files || []));
      }, 300);
    };

    input.value = '';
    input.addEventListener('change', handleChange, { once: true });
    window.addEventListener('focus', handleFocus, { once: true });
    input.click();
  });
}

async function requestAudioMetadata(filePath: string): Promise<AudioFileMetadata> {
  const record = browserFileRecords.get(filePath);

  if (!record) {
    return createEmptyMetadata();
  }

  if (record.metadata) {
    return record.metadata;
  }

  if (!record.metadataPromise) {
    record.metadataPromise = (async () => {
      try {
        const arrayBuffer = await record.file.arrayBuffer();
        const response = await fetch('/api/audio/metadata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(record.file.name),
            'X-File-Type': record.file.type || 'audio/mpeg',
          },
          body: arrayBuffer,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const metadata = (await response.json()) as AudioFileMetadata;
        record.metadata = metadata;
        void persistBrowserFileRecord(filePath, record);
        return metadata;
      } catch (_error) {
        const emptyMetadata = createEmptyMetadata();
        record.metadata = emptyMetadata;
        void persistBrowserFileRecord(filePath, record);
        return emptyMetadata;
      } finally {
        record.metadataPromise = null;
      }
    })();
  }

  return record.metadataPromise;
}

async function postJson<TRequest, TResponse>(url: string, payload: TRequest): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

async function getJson<TResponse>(url: string): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

function buildServerManagedYouTubeKeyState(config: YouTubeConfig): YouTubeApiKeyState {
  if (config.isConfigured) {
    return {
      hasConfiguredKey: true,
      hasStoredApiKey: false,
      source: 'env',
      message: 'La API key de YouTube se administra desde Railway o desde el servidor.',
    };
  }

  return {
    hasConfiguredKey: false,
    hasStoredApiKey: false,
    source: 'none',
    message: 'Configura YOUTUBE_API_KEY en Railway para habilitar la busqueda oficial de YouTube.',
  };
}

window.versions = {
  node: (): string => '',
  electron: (): string => '',
  chrome: (): string => navigator.userAgent,
};

window.audioAPI = {
  openAudioFiles: async (): Promise<string[]> => {
    const picker = createPickerInput();
    const files = await pickFilesWithInput(picker);
    picker.remove();
    return registerSelectedFiles(files);
  },
  openAudioFolder: async (): Promise<AudioFolderSelection> => {
    const picker = createPickerInput({ folderMode: true });
    const files = await pickFilesWithInput(picker);
    picker.remove();

    if (files.length === 0) {
      return {
        folderPath: '',
        filePaths: [],
      };
    }

    const relativePaths = registerSelectedFiles(files, { preferRelativePath: true });
    const firstRelativePath = normalizeDisplayPath(
      (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    );
    const folderPath = firstRelativePath.includes('/')
      ? firstRelativePath.slice(0, firstRelativePath.indexOf('/'))
      : firstRelativePath || 'Carpeta local';

    return {
      folderPath,
      filePaths: relativePaths,
    };
  },
  onMenuAudioFilesSelected: (): void => {
    // No native menu in the browser version.
  },
  onMenuAudioFolderSelected: (): void => {
    // No native menu in the browser version.
  },
  filePathToUrl: (filePath: string): string => {
    return browserFileRecords.get(filePath)?.objectUrl || '';
  },
  basename,
  extname,
  readAudioMetadata: (filePath: string): Promise<AudioFileMetadata> => {
    return requestAudioMetadata(filePath);
  },
  readAudioBlob: async (filePath: string): Promise<Blob | null> => {
    return browserFileRecords.get(filePath)?.file || null;
  },
  restorePersistedAudioFiles: async (): Promise<string[]> => {
    return restorePersistedBrowserFileRecords();
  },
  fetchLyrics: (query: LyricsLookupQuery): Promise<LyricsResult> => {
    return postJson<LyricsLookupQuery, LyricsResult>('/api/lyrics/lookup', query);
  },
};

window.youtubeAPI = {
  getConfig: (): Promise<YouTubeConfig> => {
    return getJson<YouTubeConfig>('/api/youtube/config');
  },
  getApiKeyState: async (): Promise<YouTubeApiKeyState> => {
    const config = await getJson<YouTubeConfig>('/api/youtube/config');
    return buildServerManagedYouTubeKeyState(config);
  },
  saveApiKey: async (): Promise<YouTubeApiKeyState> => {
    throw new Error('En la version web la API key de YouTube se configura en el servidor.');
  },
  clearSavedApiKey: async (): Promise<YouTubeApiKeyState> => {
    throw new Error('En la version web la API key de YouTube se configura en el servidor.');
  },
  searchVideos: (query: string): Promise<YouTubeSearchResponse> => {
    return getJson<YouTubeSearchResponse>(`/api/youtube/search?q=${encodeURIComponent(query)}`);
  },
  openVideo: async (url: string): Promise<boolean> => {
    const normalizedUrl = String(url || '').trim();

    if (!normalizedUrl) {
      return false;
    }

    window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
    return true;
  },
};

window.aiAPI = {
  getConfig: (): Promise<AIPlaylistConfig> => {
    return getJson<AIPlaylistConfig>('/api/ai/config');
  },
  generatePlaylist: (request: AIPlaylistGenerateRequest): Promise<AIPlaylistResult> => {
    return postJson<AIPlaylistGenerateRequest, AIPlaylistResult>('/api/ai/generate', request);
  },
};

window.addEventListener('beforeunload', () => {
  browserFileRecords.forEach((record) => {
    URL.revokeObjectURL(record.objectUrl);
  });
});
