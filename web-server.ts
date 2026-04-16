import { createReadStream, promises as fs } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { readAudioMetadataFromBuffer } from './audio-metadata-service';
import { generateAIPlaylist, getAIPlaylistConfig } from './ai-playlist-service';
import { loadRuntimeEnv } from './env-config';
import { fetchLyricsFromRemote } from './lyrics-remote-service';
import { getYouTubeConfig, searchYouTubeVideos } from './youtube-service';

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || '3000');
const UI_ROOT = path.join(__dirname, 'UI');

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

function getContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[extension] || 'application/octet-stream';
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(body).toString(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

function sendText(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(body).toString(),
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end(body);
}

function isSafeUiPath(requestedPath: string): string | null {
  const normalizedPath = requestedPath === '/' ? '/index.html' : requestedPath;
  const decodedPath = decodeURIComponent(normalizedPath);
  const absolutePath = path.resolve(UI_ROOT, `.${decodedPath}`);

  if (!absolutePath.startsWith(path.resolve(UI_ROOT))) {
    return null;
  }

  return absolutePath;
}

async function sendStaticFile(res: ServerResponse, absolutePath: string): Promise<void> {
  try {
    const stats = await fs.stat(absolutePath);

    if (!stats.isFile()) {
      sendText(res, 404, 'Not found');
      return;
    }

    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Length': String(stats.size),
      'Content-Type': getContentType(absolutePath),
    });

    createReadStream(absolutePath).pipe(res);
  } catch (_error) {
    sendText(res, 404, 'Not found');
  }
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const rawBody = await readRequestBody(req);
  const rawText = rawBody.toString('utf8').trim();

  if (!rawText) {
    return {} as T;
  }

  return JSON.parse(rawText) as T;
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL
): Promise<boolean> {
  if (requestUrl.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      runtime: 'web',
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  if (requestUrl.pathname === '/api/youtube/config' && req.method === 'GET') {
    sendJson(res, 200, getYouTubeConfig());
    return true;
  }

  if (requestUrl.pathname === '/api/youtube/search' && req.method === 'GET') {
    const query = String(requestUrl.searchParams.get('q') || '');
    const response = await searchYouTubeVideos(query);
    sendJson(res, 200, response);
    return true;
  }

  if (requestUrl.pathname === '/api/lyrics/lookup' && req.method === 'POST') {
    const query = await readJsonBody<LyricsLookupQuery>(req);
    const result = await fetchLyricsFromRemote(query);
    sendJson(res, 200, result);
    return true;
  }

  if (requestUrl.pathname === '/api/ai/config' && req.method === 'GET') {
    sendJson(res, 200, getAIPlaylistConfig());
    return true;
  }

  if (requestUrl.pathname === '/api/ai/generate' && req.method === 'POST') {
    const request = await readJsonBody<AIPlaylistGenerateRequest>(req);
    const result = await generateAIPlaylist(request);
    sendJson(res, 200, result);
    return true;
  }

  if (requestUrl.pathname === '/api/audio/metadata' && req.method === 'POST') {
    const body = await readRequestBody(req);

    if (body.length === 0) {
      sendJson(res, 400, {
        message: 'Missing audio payload',
      });
      return true;
    }

    const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'audio-file'));
    const mimeType = String(req.headers['x-file-type'] || 'audio/mpeg');
    const metadata = await readAudioMetadataFromBuffer(new Uint8Array(body), {
      mimeType,
      path: fileName,
      size: body.length,
    });

    sendJson(res, 200, metadata);
    return true;
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    sendJson(res, 404, {
      message: 'Endpoint not found',
      path: requestUrl.pathname,
    });
    return true;
  }

  return false;
}

loadRuntimeEnv({
  cwd: process.cwd(),
  executableDir: process.cwd(),
});

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

    if (await handleApiRequest(req, res, requestUrl)) {
      return;
    }

    const absolutePath = isSafeUiPath(requestUrl.pathname);

    if (!absolutePath) {
      sendText(res, 403, 'Forbidden');
      return;
    }

    await sendStaticFile(res, absolutePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, {
      message,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Web app running at http://127.0.0.1:${PORT}`);
});
