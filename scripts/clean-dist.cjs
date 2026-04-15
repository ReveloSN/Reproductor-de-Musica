const fs = require('node:fs');
const path = require('node:path');

const distPath = path.join(__dirname, '..', 'dist');

fs.rmSync(distPath, { recursive: true, force: true });
