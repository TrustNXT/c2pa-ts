import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { PNG } from '../src/asset';
import { BinaryHelper } from '../src/util';

const baseDir = 'tests/fixtures';

const manifestDataSmall = Buffer.alloc(100);
const manifestDataLarge = Buffer.alloc(10000);
crypto.randomFillSync(manifestDataSmall);
crypto.randomFillSync(manifestDataLarge);

describe('Functional PNG Processing Tests', function () {
    this.timeout(0);

    describe('Insert manifest data into PNG file', () => {
        let png: PNG;
        it(`load PNG`, async () => {
            const buf = await fs.readFile(`${baseDir}/trustnxt-icon.png`);
            assert.ok(buf);
            png = new PNG(buf);
            assert.ok(png);
        });

        it('ensure no existing JUMBF', async function () {
            if (!png) {
                this.skip();
            }

            assert.ok(!png.getManifestJUMBF());
        });

        it('make space for small data', async function () {
            if (!png) {
                this.skip();
            }

            await png.ensureManifestSpace(manifestDataSmall.length);
        });

        it('try to add large data', async function () {
            if (!png) {
                this.skip();
            }

            await assert.rejects(
                () => png.writeManifestJUMBF(manifestDataLarge),
                'Should not allow writing data larger than available space',
            );
        });

        it('add small data and re-read PNG', async function () {
            if (!png) {
                this.skip();
            }

            await png.writeManifestJUMBF(manifestDataSmall);
            const newPng = new PNG(await png.getDataRange());
            const newManifest = newPng.getManifestJUMBF();
            assert.ok(newManifest, 'No manifest data in updated PNG');
            assert.ok(
                BinaryHelper.bufEqual(newManifest, manifestDataSmall),
                'Manifest data does not have expected content',
            );
        });

        it('update with large data and re-read PNG', async function () {
            if (!png) {
                this.skip();
            }

            await png.ensureManifestSpace(manifestDataLarge.length);
            await png.writeManifestJUMBF(manifestDataLarge);
            const newPng = new PNG(await png.getDataRange());
            const newManifest = newPng.getManifestJUMBF();
            assert.ok(newManifest, 'No manifest data in updated PNG');
            assert.ok(
                BinaryHelper.bufEqual(newManifest, manifestDataLarge),
                'Manifest data does not have expected content',
            );
        });
    });
});
