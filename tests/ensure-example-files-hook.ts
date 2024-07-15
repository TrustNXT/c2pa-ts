import { existsSync } from 'fs';
import { normalize } from 'path';

function beforeAll() {
    // expected location with the test file repo
    const testfilesDir = normalize(import.meta.filename + '/../../public-testfiles');

    // ensure that the Git repo with example-files is already present
    if (!existsSync(testfilesDir)) {
        process.stderr.write(`Git repo with example-files not present in ${testfilesDir}.\n`);
        process.stderr.write(
            'Use `git clone git@github.com:c2pa-org/public-testfiles` in the project root to retrieve them.\n',
        );
        process.exit(1);
    }
}

export { beforeAll as mochaHooks };
