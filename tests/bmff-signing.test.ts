import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { afterAll, describe, it } from 'bun:test';
import { BMFF } from '../src/asset';
import { CoseAlgorithmIdentifier } from '../src/cose';
import { SuperBox } from '../src/jumbf';
import { BMFFHashAssertion, Manifest, ManifestStore, ValidationStatusCode } from '../src/manifest';
import { loadTestCertificate } from './utils/testCertificates';

// BMFF test files
const sourceFile = 'tests/fixtures/trustnxt-icon.heic';
const targetFileV2 = 'tests/fixtures/trustnxt-icon-signed-v2-test.heic';
const targetFileV3 = 'tests/fixtures/trustnxt-icon-signed-v3-test.heic';

// MP4 test files
const mp4SourceFile = 'tests/fixtures/test-video.mp4';
const mp4TargetFileV2 = 'tests/fixtures/test-video-signed-v2-test.mp4';
const mp4TargetFileV3 = 'tests/fixtures/test-video-signed-v3-test.mp4';

describe('BMFF Signing Tests', function () {
    let manifestV2: Manifest | undefined;
    let manifestV3: Manifest | undefined;

    async function signAndVerify(version: 2 | 3) {
        const targetFile = version === 2 ? targetFileV2 : targetFileV3;

        const { signer, timestampProvider } = await loadTestCertificate({
            name: 'ES256 sample certificate',
            certificateFile: 'tests/fixtures/sample_es256.pem',
            privateKeyFile: 'tests/fixtures/sample_es256.key',
            algorithm: CoseAlgorithmIdentifier.ES256,
        });

        // load and verify the file
        const buf = await fs.readFile(sourceFile);
        assert.ok(await BMFF.canRead(buf));
        const asset = await BMFF.create(buf);

        // create manifest store and manifest
        const manifestStore = new ManifestStore();
        const manifest = manifestStore.createManifest({
            assetFormat: 'image/heic',
            instanceID: 'xyzxyz',
            defaultHashAlgorithm: 'SHA-256',
            signer,
        });

        // create hash assertion with appropriate version
        const bmffHashAssertion =
            version === 2 ?
                BMFFHashAssertion.createV2('jumbf manifest', 'SHA-256')
            :   BMFFHashAssertion.createV3('jumbf manifest', 'SHA-256');
        manifest.addAssertion(bmffHashAssertion);

        // make space in the asset
        await asset.ensureManifestSpace(manifestStore.measureSize());

        // update the hard binding
        await bmffHashAssertion.updateWithAsset(asset);

        // create the signature
        await manifest.sign(signer, timestampProvider);

        // write the JUMBF box to the asset
        await asset.writeManifestJUMBF(manifestStore.getBytes());

        // write the asset to the target file
        await fs.writeFile(targetFile, await asset.getDataRange());

        return { manifest, asset: await BMFF.create(await fs.readFile(targetFile)) };
    }

    it('add a v2 manifest to a BMFF test file', async function () {
        const result = await signAndVerify(2);
        manifestV2 = result.manifest;
    });

    it('add a v3 manifest to a BMFF test file', async function () {
        const result = await signAndVerify(3);
        manifestV3 = result.manifest;
    });

    it('read and verify the BMFF with v2 manifest', async function () {
        if (!manifestV2) return;

        const buf = await fs.readFile(targetFileV2);
        const asset = await BMFF.create(buf);

        const jumbf = await asset.getManifestJUMBF();
        assert.ok(jumbf, 'no JUMBF found');

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);
        const validationResult = await manifestStore.validate(asset);

        assert.ok(validationResult.isValid, 'Validation result invalid');
        assert.ok(
            validationResult.statusEntries.some(
                entry => entry.code === ValidationStatusCode.AssertionBMFFHashMatch && entry.success,
            ),
            'BMFF hash validation failed',
        );
    });

    it('read and verify the BMFF with v3 manifest', async function () {
        if (!manifestV3) return;

        const buf = await fs.readFile(targetFileV3);
        const asset = await BMFF.create(buf);

        const jumbf = await asset.getManifestJUMBF();
        assert.ok(jumbf, 'no JUMBF found');

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);
        const validationResult = await manifestStore.validate(asset);

        assert.ok(validationResult.isValid, 'Validation result invalid');
        assert.ok(
            validationResult.statusEntries.some(
                entry => entry.code === ValidationStatusCode.AssertionBMFFHashMatch && entry.success,
            ),
            'BMFF hash validation failed',
        );
    });

    afterAll(async function () {
        // delete test files, ignore if they don't exist
        await fs.unlink(targetFileV2).catch(() => undefined);
        await fs.unlink(targetFileV3).catch(() => undefined);
    });
});

async function signMP4AndVerify(version: 2 | 3) {
    const targetFile = version === 2 ? mp4TargetFileV2 : mp4TargetFileV3;

    const { signer, timestampProvider } = await loadTestCertificate({
        name: 'ES256 sample certificate',
        certificateFile: 'tests/fixtures/sample_es256.pem',
        privateKeyFile: 'tests/fixtures/sample_es256.key',
        algorithm: CoseAlgorithmIdentifier.ES256,
    });

    // load and verify the file
    const buf = await fs.readFile(mp4SourceFile);
    assert.ok(await BMFF.canRead(buf), 'MP4 should be readable as BMFF');
    const asset = await BMFF.create(buf);

    // Verify it's an MP4 (has stco box)
    const topBoxes = asset.getTopLevelBoxes();
    const moov = topBoxes.find(b => b.type === 'moov');
    assert.ok(moov, 'MP4 should have moov box');

    // create manifest store and manifest
    const manifestStore = new ManifestStore();
    const manifest = manifestStore.createManifest({
        assetFormat: 'video/mp4',
        instanceID: 'mp4-test-xyz',
        defaultHashAlgorithm: 'SHA-256',
        signer,
    });

    // create hash assertion with appropriate version
    const bmffHashAssertion =
        version === 2 ?
            BMFFHashAssertion.createV2('jumbf manifest', 'SHA-256')
        :   BMFFHashAssertion.createV3('jumbf manifest', 'SHA-256');
    manifest.addAssertion(bmffHashAssertion);

    // Record original stco offset for patching verification
    const origBuf = await fs.readFile(mp4SourceFile);
    const origAsset = await BMFF.create(origBuf);

    // make space in the asset
    await asset.ensureManifestSpace(manifestStore.measureSize());

    // update the hard binding
    await bmffHashAssertion.updateWithAsset(asset);

    // create the signature
    await manifest.sign(signer, timestampProvider);

    // write the JUMBF box to the asset
    await asset.writeManifestJUMBF(manifestStore.getBytes());

    // write the asset to the target file
    const outputData = await asset.getDataRange();
    await fs.writeFile(targetFile, outputData);

    return { manifest, asset: await BMFF.create(await fs.readFile(targetFile)), origAsset };
}

describe('MP4 Video Signing Tests', function () {
    let mp4ManifestV2: Manifest | undefined;
    let mp4ManifestV3: Manifest | undefined;

    it('should recognize MP4 as BMFF format', async function () {
        const buf = await fs.readFile(mp4SourceFile);
        assert.ok(await BMFF.canRead(buf), 'MP4 should be recognized as BMFF');
    });

    it('should parse MP4 box structure correctly', async function () {
        const buf = await fs.readFile(mp4SourceFile);
        const asset = await BMFF.create(buf);
        const boxes = asset.getTopLevelBoxes();

        // MP4 should have ftyp, mdat, and moov boxes
        assert.ok(
            boxes.some(b => b.type === 'ftyp'),
            'MP4 should have ftyp box',
        );
        assert.ok(
            boxes.some(b => b.type === 'mdat'),
            'MP4 should have mdat box',
        );
        assert.ok(
            boxes.some(b => b.type === 'moov'),
            'MP4 should have moov box',
        );
    });

    it('add a v2 manifest to MP4 video file', async function () {
        const result = await signMP4AndVerify(2);
        mp4ManifestV2 = result.manifest;
    });

    it('add a v3 manifest to MP4 video file', async function () {
        const result = await signMP4AndVerify(3);
        mp4ManifestV3 = result.manifest;
    });

    it('read and verify MP4 with v2 manifest', async function () {
        if (!mp4ManifestV2) return;

        const buf = await fs.readFile(mp4TargetFileV2);
        const asset = await BMFF.create(buf);

        const jumbf = await asset.getManifestJUMBF();
        assert.ok(jumbf, 'no JUMBF found in signed MP4');

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);
        const validationResult = await manifestStore.validate(asset);

        assert.ok(validationResult.isValid, 'MP4 validation result invalid');
        assert.ok(
            validationResult.statusEntries.some(
                entry => entry.code === ValidationStatusCode.AssertionBMFFHashMatch && entry.success,
            ),
            'MP4 BMFF hash validation failed',
        );
    });

    it('read and verify MP4 with v3 manifest', async function () {
        if (!mp4ManifestV3) return;

        const buf = await fs.readFile(mp4TargetFileV3);
        const asset = await BMFF.create(buf);

        const jumbf = await asset.getManifestJUMBF();
        assert.ok(jumbf, 'no JUMBF found in signed MP4');

        const superBox = SuperBox.fromBuffer(jumbf);
        const manifestStore = ManifestStore.read(superBox);
        const validationResult = await manifestStore.validate(asset);

        assert.ok(validationResult.isValid, 'MP4 validation result invalid');
        assert.ok(
            validationResult.statusEntries.some(
                entry => entry.code === ValidationStatusCode.AssertionBMFFHashMatch && entry.success,
            ),
            'MP4 BMFF hash validation failed',
        );
    });

    it('should patch stco offsets correctly when inserting C2PA manifest', async function () {
        // Load original and signed files
        const origBuf = await fs.readFile(mp4SourceFile);
        const signedBuf = await fs.readFile(mp4TargetFileV2);

        const origAsset = await BMFF.create(origBuf);
        const signedAsset = await BMFF.create(signedBuf);

        // Find stco boxes - need to traverse to moov/trak/mdia/minf/stbl/stco
        const findStco = (asset: BMFF) => {
            const moov = asset.getTopLevelBoxes().find(b => b.type === 'moov');
            if (!moov) return undefined;
            const trak = moov.childBoxes.find(c => c.type === 'trak');
            if (!trak) return undefined;
            const mdia = trak.childBoxes.find(c => c.type === 'mdia');
            if (!mdia) return undefined;
            const minf = mdia.childBoxes.find(c => c.type === 'minf');
            if (!minf) return undefined;
            const stbl = minf.childBoxes.find(c => c.type === 'stbl');
            if (!stbl) return undefined;
            return stbl.childBoxes.find(c => c.type === 'stco');
        };

        const origStco = findStco(origAsset);
        const signedStco = findStco(signedAsset);

        assert.ok(origStco, 'Original MP4 should have stco box');
        assert.ok(signedStco, 'Signed MP4 should have stco box');

        // Get the C2PA box to determine the offset adjustment
        const c2paBox = signedAsset.getTopLevelBoxes().find(b => b.type === 'uuid');
        assert.ok(c2paBox, 'Signed MP4 should have C2PA uuid box');

        // The stco offsets in the signed file should be shifted by the C2PA box size
        const origOffsets = (origStco.payload as { chunkOffsets: number[] }).chunkOffsets;
        const signedOffsets = (signedStco.payload as { chunkOffsets: number[] }).chunkOffsets;

        assert.equal(origOffsets.length, signedOffsets.length, 'stco entry count should match');

        // All offsets should be shifted by the C2PA box size
        for (let i = 0; i < origOffsets.length; i++) {
            assert.equal(
                signedOffsets[i],
                origOffsets[i] + c2paBox.size,
                `stco offset ${i} should be shifted by C2PA box size`,
            );
        }
    });

    afterAll(async function () {
        // Delete signed output files, ignore if they don't exist
        await fs.unlink(mp4TargetFileV2).catch(() => undefined);
        await fs.unlink(mp4TargetFileV3).catch(() => undefined);
    });
});
