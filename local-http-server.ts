import { createReadStream, promises as fs } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

interface LocalAppServer {
  baseUrl: string;
  stop: () => Promise<void>;
}

const HOST = '127.0.0.1';

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

function isSafeUiPath(uiRoot: string, requestedPath: string): string | null {
  const normalizedPath = requestedPath === '/' ? '/index.html' : requestedPath;
  const decodedPath = decodeURIComponent(normalizedPath);
  const absolutePath = path.resolve(uiRoot, `.${decodedPath}`);

  if (!absolutePath.startsWith(path.resolve(uiRoot))) {
    return null;
  }

  return absolutePath;
}

async function sendStaticFile(res: ServerResponse, absolutePath: string): Promise<void> {
  try {
    const stats = await fs.stat(absolutePath);

    if (!stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Length': String(stats.size),
      'Content-Type': getContentType(absolutePath),
      'Cache-Control': 'no-cache',
    });

    createReadStream(absolutePath).pipe(res);
  } catch (_error) {
    res.writeHead(404);
    res.end('Not found');
  }
}

function parseRangeHeader(rangeHeader: string | undefined, fileSize: number): { start: number; end: number } | null {
  const match = String(rangeHeader || '').match(/bytes=(\d*)-(\d*)/i);

  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  const start = rawStart ? Number(rawStart) : 0;
  const end = rawEnd ? Number(rawEnd) : fileSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= fileSize) {
    return null;
  }

  return { start, end };
}

async function sendMediaFile(req: IncomingMessage, res: ServerResponse, mediaPath: string): Promise<void> {
  try {
    const stats = await fs.stat(mediaPath);

    if (!stats.isFile()) {
      res.writeHead(404);
      res.end('Media file not found');
      return;
    }

    const range = parseRangeHeader(req.headers.range, stats.size);
    const contentType = getContentType(mediaPath);

    if (range) {
      res.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}`,
        'Content-Type': contentType,
      });

      createReadStream(mediaPath, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Content-Length': String(stats.size),
      'Content-Type': contentType,
    });

    createReadStream(mediaPath).pipe(res);
  } catch (_error) {
    res.writeHead(404);
    res.end('Media file not found');
  }
}

export async function startLocalAppServer(uiRoot: string): Promise<LocalAppServer> {
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${HOST}`);

    if (requestUrl.pathname === '/__media__') {
      const mediaPath = requestUrl.searchParams.get('path');

      if (!mediaPath) {
        res.writeHead(400);
        res.end('Missing media path');
        return;
      }

      await sendMediaFile(req, res, mediaPath);
      return;
    }

    const absolutePath = isSafeUiPath(uiRoot, requestUrl.pathname);

    if (!absolutePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    await sendStaticFile(res, absolutePath);
  });

  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const currentAddress = server.address();

      if (!currentAddress || typeof currentAddress === 'string') {
        reject(new Error('No fue posible resolver la direccion del servidor local.'));
        return;
      }

      resolve(currentAddress);
    });
  });

  return {
    baseUrl: `http://${HOST}:${address.port}`,
    stop: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}
