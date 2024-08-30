import * as fs from 'node:fs';

try {
    fs.renameSync('src/util/Version.ts.bak', 'src/util/Version.ts');
} catch {}
