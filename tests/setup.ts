import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll } from 'bun:test';

beforeAll(() => {
    // expected location with the test file repo
    const testfilesDir = path.join(import.meta.dirname, 'fixtures/public-testfiles');

    // ensure that the Git repo with example-files is already present
    if (!fs.existsSync(testfilesDir)) {
        process.stderr.write(`Git repo with example-files not present in ${testfilesDir}.\n`);
        process.stderr.write(
            'Use `git clone --depth=1 git@github.com:c2pa-org/public-testfiles tests/fixtures/public-testfiles` in the project root to retrieve them.\n',
        );
        process.exit(1);
    }
});
