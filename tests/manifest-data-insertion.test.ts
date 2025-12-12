import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { describe, it } from 'bun:test';
import { Asset, BMFF, JPEG, PNG } from '../src/asset';
import { BinaryHelper } from '../src/util';

const baseDir = 'tests/fixtures';

const manifestData = {
    small: Buffer.alloc(100),
    large: Buffer.alloc(200000),
};
for (const buffer of Object.values(manifestData)) {
    // Construct a dummy JUMBF header (just enough to satisfy the JPEG parser) and
    // fill the rest with random bytes
    const dataView = new DataView(buffer.buffer);
    dataView.setUint32(0, buffer.length);
    buffer.set(BinaryHelper.fromHexString('6A756D62000000116A756D6463327061'), 4);
    crypto.randomFillSync(buffer, 36);
}

describe('Asset Manifest Data Insertion Tests', function () {
    const assetTypes = [
        {
            name: 'PNG',
            assetClass: PNG,
            testFile: 'trustnxt-icon.png',
        },
        {
            name: 'JPEG',
            assetClass: JPEG,
            testFile: 'trustnxt-icon.jpg',
        },
        {
            name: 'BMFF',
            assetClass: BMFF,
            testFile: 'trustnxt-icon.heic',
        },
    ];

    for (const assetType of assetTypes) {
        describe(`Insert manifest data into ${assetType.name} file`, () => {
            let asset: Asset;
            it(`load ${assetType.name}`, async () => {
                const buf = await fs.readFile(`${baseDir}/${assetType.testFile}`);
                assert.ok(buf);
                asset = new assetType.assetClass(buf);
                assert.ok(asset);
            });

            it('ensure no existing JUMBF', async function () {
                if (!asset) return;

                assert.ok(!asset.getManifestJUMBF());
            });

            it('try to add too large data', async function () {
                if (!asset) return;

                await asset.ensureManifestSpace(manifestData.small.length);
                await assert.rejects(
                    () => asset.writeManifestJUMBF(manifestData.large),
                    'Should not allow writing data larger than available space',
                );
            });

            for (const dataType of ['small', 'large']) {
                it(`add ${dataType} data and re-read asset`, async function () {
                    const data = manifestData[dataType as keyof typeof manifestData];

                    if (!asset) return;

                    await asset.ensureManifestSpace(data.length);

                    // ensure the hash exclusion range can fully contain the
                    // JUMBF and that it doesn't exceed the asset's storage
                    const { start, length } = asset.getHashExclusionRange();
                    assert.ok(start >= 0);
                    assert.ok(length >= data.length);
                    assert.ok(start + length <= asset.getDataLength());

                    await asset.writeManifestJUMBF(data);
                    const manifest = asset.getManifestJUMBF();
                    assert.ok(manifest, 'No manifest data in asset after adding');
                    assert.ok(BinaryHelper.bufEqual(manifest, data), 'Manifest data does not have expected content');

                    const newAsset = new assetType.assetClass(await asset.getDataRange());
                    const newManifest = newAsset.getManifestJUMBF();
                    assert.ok(newManifest, 'No manifest data in updated file');
                    assert.ok(
                        BinaryHelper.bufEqual(newManifest, data),
                        'Manifest data does not have expected content after reading back file',
                    );
                });
            }
        });
    }
});
