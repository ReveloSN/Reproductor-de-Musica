import fs from 'node:fs';
import path from 'node:path';

interface RuntimeEnvLoadOptions {
  cwd?: string;
  executableDir?: string | null;
  userDataDir?: string | null;
}

function parseEnvValue(rawValue: string): string {
  const trimmedValue = rawValue.trim();

  if (!trimmedValue) {
    return '';
  }

  const firstChar = trimmedValue[0];
  const lastChar = trimmedValue[trimmedValue.length - 1];

  if (
    (firstChar === '"' && lastChar === '"') ||
    (firstChar === '\'' && lastChar === '\'')
  ) {
    const innerValue = trimmedValue.slice(1, -1);

    if (firstChar === '"') {
      return innerValue
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
    }

    return innerValue;
  }

  const commentIndex = trimmedValue.indexOf(' #');

  if (commentIndex >= 0) {
    return trimmedValue.slice(0, commentIndex).trim();
  }

  return trimmedValue;
}

function loadEnvFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const lines = fileContents.split(/\r?\n/u);
  let hasEntries = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const normalizedLine = trimmedLine.startsWith('export ')
      ? trimmedLine.slice('export '.length).trim()
      : trimmedLine;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const rawValue = normalizedLine.slice(separatorIndex + 1);

    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = parseEnvValue(rawValue);
    hasEntries = true;
  }

  return hasEntries;
}

function buildCandidateEnvPaths(options: RuntimeEnvLoadOptions): string[] {
  const candidates = [
    options.cwd ? path.join(options.cwd, '.env') : '',
    options.cwd ? path.join(options.cwd, '.env.local') : '',
    options.executableDir ? path.join(options.executableDir, '.env') : '',
    options.executableDir ? path.join(options.executableDir, '.env.local') : '',
    options.userDataDir ? path.join(options.userDataDir, '.env') : '',
    options.userDataDir ? path.join(options.userDataDir, '.env.local') : '',
  ];

  return [...new Set(candidates.filter(Boolean).map((candidate) => path.resolve(candidate)))];
}

export function loadRuntimeEnv(options: RuntimeEnvLoadOptions = {}): string[] {
  const candidatePaths = buildCandidateEnvPaths({
    cwd: options.cwd || process.cwd(),
    executableDir: options.executableDir || path.dirname(process.execPath),
    userDataDir: options.userDataDir || null,
  });
  const loadedFiles: string[] = [];

  for (const candidatePath of candidatePaths) {
    if (loadEnvFile(candidatePath)) {
      loadedFiles.push(candidatePath);
    }
  }

  return loadedFiles;
}
