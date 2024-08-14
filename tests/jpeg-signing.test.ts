import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { after } from 'mocha';
import * as bin from 'typed-binary';
import { JPEG } from '../src/asset';
import { Crypto } from '../src/crypto';
import { SuperBox } from '../src/jumbf';
import {
    Assertion,
    AssertionLabels,
    AssertionStore,
    Claim,
    DataHashAssertion,
    Manifest,
    ManifestStore,
    Signature,
    ValidationStatusCode,
} from '../src/manifest';
import { AssertionUtils } from '../src/manifest/assertions/AssertionUtils';
import { UUIDs } from '../src/manifest/rawTypes';

// location of the image to sign
const sourceFile = 'tests/fixtures/trustnxt-icon.jpg';
// location of the signed image
const targetFile = 'tests/fixtures/trustnxt-icon-signed.jpg';

describe('Functional Signing Tests', function () {
    this.timeout(0);

    it('add a manifest to a JPEG test file', async function () {
        // load the file into a buffer
        const buf = await fs.readFile(sourceFile);
        assert.ok(buf);

        // ensure it's a JPEG
        assert.ok(JPEG.canRead(buf));

        // construct the asset
        const asset = new JPEG(buf);

        // create a data hash assertion
        const dataHashAssertion = new DataHashAssertion();
        dataHashAssertion.uuid = UUIDs.cborAssertion; // TODO: This should not be required here!
        dataHashAssertion.label = AssertionLabels.dataHash;
        dataHashAssertion.fullLabel = dataHashAssertion.label;
        dataHashAssertion.algorithm = 'SHA-256';
        dataHashAssertion.hash = await AssertionUtils.hashWithExclusions(
            asset,
            dataHashAssertion.exclusions,
            dataHashAssertion.algorithm,
        );

        // create an assertion store and add the data hash assertion to it
        const assertionStore = new AssertionStore();
        assertionStore.assertions.push(dataHashAssertion);

        // create a claim and add the data hash assertion to it
        const claim = new Claim();
        claim.instanceID = 'aoeu'; // TODO: ....
        claim.defaultAlgorithm = 'SHA-256';
        const createHashedURIForAssertion = async (assertion: Assertion) => {
            const box = assertion.generateJUMBFBox(claim);
            if (!box.rawContent) box.toBuffer();
            const digest = await Crypto.digest(box.rawContent!, claim.defaultAlgorithm!);
            return {
                // TODO: This URI should be assigned by the component store within the manifest
                uri: 'self#jumbf=c2pa.assertions/' + AssertionLabels.dataHash,
                algorithm: claim.defaultAlgorithm!,
                hash: digest,
            };
        };
        claim.assertions.push(await createHashedURIForAssertion(dataHashAssertion));

        // create an empty (TODO) signature
        const signature = new Signature();

        // create a manifest from the assertion store, claim, and signature
        const manifestStore = new ManifestStore();
        const manifest = new Manifest(manifestStore);
        manifest.label = 'c2pa-ts:urn:uuid:14cd3c1b-3048-45ac-a613-9b497a41528b'; // TODO: Generate this value
        manifest.assertions = assertionStore;
        manifest.claim = claim;
        manifest.signature = signature;
        manifestStore.manifests.push(manifest);

        // serialize the manifest store to a JUMBF box
        const jumbfBox = manifestStore.generateJUMBFBox();
        const schema = jumbfBox.schema;

        // insert the JUMBF box data into the asset
        const length = schema.measure(jumbfBox).size;
        await asset.ensureManifestSpace(length);
        const buffer = Buffer.alloc(length);
        const writer = new bin.BufferWriter(buffer, { endianness: 'big' });
        schema.write(writer, jumbfBox);
        await asset.writeManifestJUMBF(buffer);

        // write the asset to the target file
        await fs.writeFile(targetFile, await asset.getDataRange());
    });

    it('read and verify the JPEG with manifest', async function () {
        // load the file into a buffer
        const buf = await fs.readFile(targetFile).catch(() => undefined);
        if (!buf) this.skip();

        // ensure it's a JPEG
        assert.ok(JPEG.canRead(buf));

        // construct the asset
        const asset = new JPEG(buf);

        // extract the C2PA manifest store in binary JUMBF format
        const jumbf = asset.getManifestJUMBF();
        assert.ok(jumbf, 'no JUMBF found');

        // deserialize the JUMBF box structure
        const superBox = SuperBox.fromBuffer(jumbf);

        // construct the manifest store from the JUMBF box
        const manifestStore = ManifestStore.read(superBox);

        // validate the asset against the store
        const validationResult = await manifestStore.validate(asset);

        // check individual codes
        assert.deepEqual(validationResult.statusEntries, [
            {
                code: ValidationStatusCode.ClaimSignatureMissing,
                explanation: undefined,
                url: undefined,
            },
            {
                code: ValidationStatusCode.AssertionHashedURIMatch,
                explanation: undefined,
                url: 'self#jumbf=c2pa.assertions/c2pa.hash.data',
            },
        ]);

        // check overall validity
        assert.ok(!validationResult.isValid);
    });

    after(async function () {
        // delete test file, ignore the case it doesn't exist
        await fs.unlink(targetFile).catch(() => undefined);
    });
});
