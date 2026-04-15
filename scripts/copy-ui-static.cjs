const fs = require('node:fs');
const path = require('node:path');

const sourceUiDir = path.join(__dirname, '..', 'UI');
const targetUiDir = path.join(__dirname, '..', 'dist', 'UI');
const ignoredExtensions = new Set(['.ts', '.js', '.map']);

function shouldCopy(fileName) {
  return !ignoredExtensions.has(path.extname(fileName).toLowerCase());
}

function copyDirectory(sourceDir, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile() && shouldCopy(entry.name)) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

copyDirectory(sourceUiDir, targetUiDir);
