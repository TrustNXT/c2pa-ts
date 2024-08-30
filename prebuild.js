import {replaceInFileSync} from 'replace-in-file'
import {execSync} from 'node:child_process';
import * as fs from 'node:fs';

const gitRevision = execSync('git rev-parse --short HEAD').toString().trim();

fs.copyFileSync('src/util/Version.ts', 'src/util/Version.ts.bak');

replaceInFileSync({
    files: 'src/util/Version.ts',
    from: '@VERSION@',
    to: `${process.env.npm_package_version}-${gitRevision}`,
});
