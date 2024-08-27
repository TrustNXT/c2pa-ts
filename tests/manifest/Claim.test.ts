import assert from 'node:assert/strict';
import * as bin from 'typed-binary';
import { HashAlgorithm } from '../../src/crypto';
import { CBORBox, SuperBox } from '../../src/jumbf';
import { Claim, ClaimVersion } from '../../src/manifest';
import * as raw from '../../src/manifest/rawTypes';
import { BinaryHelper } from '../../src/util';

describe('Claim Tests', function () {
    this.timeout(0);

    describe('Algorithms', () => {
        it('mapping names', () => {
            for (const algo of ['SHA-256', 'SHA-384', 'SHA-512']) {
                const rawAlgo = Claim.reverseMapHashAlgorithm(algo as HashAlgorithm);
                const mappedAlgo = Claim.mapHashAlgorithm(rawAlgo);
                assert.equal(mappedAlgo, algo);
            }
        });
    });

    describe('Hashed URIs', () => {
        const hash = new Uint8Array([
            207, 158, 91, 70, 161, 82, 191, 241, 221, 66, 81, 105, 83, 222, 128, 80, 252, 3, 156, 115, 22, 139, 245,
            213, 85, 169, 222, 116, 161, 59, 147, 23,
        ]);

        it('mapping with default algorithm', () => {
            const claim = new Claim();
            claim.defaultAlgorithm = 'SHA-256';

            const hashedURI = {
                algorithm: 'SHA-256' as HashAlgorithm,
                hash: hash,
                uri: 'https://example.com',
            };

            const rawHashedURI = claim.reverseMapHashedURI(hashedURI);

            assert.deepEqual(rawHashedURI, {
                hash: hash,
                url: 'https://example.com',
            });

            const mappedHashedURI = claim.mapHashedURI(rawHashedURI);
            assert.deepEqual(mappedHashedURI, hashedURI);
        });

        it('mapping with non-default algorithm', () => {
            const claim = new Claim();
            claim.defaultAlgorithm = 'SHA-256';

            const hashedURI = {
                algorithm: 'SHA-512' as HashAlgorithm,
                hash: hash,
                uri: 'https://example.com',
            };

            const rawHashedURI = claim.reverseMapHashedURI(hashedURI);

            assert.deepEqual(rawHashedURI, {
                alg: 'sha512',
                hash: hash,
                url: 'https://example.com',
            });

            const mappedHashedURI = claim.mapHashedURI(rawHashedURI);
            assert.deepEqual(mappedHashedURI, hashedURI);
        });
    });

    // TODO: repeat this test for a V2 claim
    describe('Claim V1 Serialization', () => {
        // claim data taken from adobe-20220124-C.jpg
        const serializedString =
            '000002796a756d62000000246a756d646332636c00110010800000aa00389b7103633270612e636c61696d000000024d63626f72a76864633a7469746c6565432e6a70676964633a666f726d61746a696d6167652f6a7065676a696e7374616e63654944782c786d703a6969643a66376261313334622d386465632d343333342d393131642d6133303430396533326438656f636c61696d5f67656e657261746f7278266d616b655f746573745f696d616765732f302e31362e3120633270612d72732f302e31362e31697369676e6174757265781973656c66236a756d62663d633270612e7369676e61747572656a617373657274696f6e7384a26375726c783473656c66236a756d62663d633270612e617373657274696f6e732f633270612e7468756d626e61696c2e636c61696d2e6a706567646861736858206393342df333ae34b1218b0857b350873667ef0100b9dceed63b65f3729fe381a26375726c783773656c66236a756d62663d633270612e617373657274696f6e732f737464732e736368656d612d6f72672e4372656174697665576f726b64686173685820bb75c4f721a9ed45d6201d9876c8d2f377d7ec3b5cae3c95b1939771289439a3a26375726c782773656c66236a756d62663d633270612e617373657274696f6e732f633270612e616374696f6e7364686173685820e36974992b78b9ed21224e58499dd0f1cc1ca2d369856b12730bc3caafaac8ffa26375726c782973656c66236a756d62663d633270612e617373657274696f6e732f633270612e686173682e6461746164686173685820b293014f8868184dc4cc0524a8220a2e793a6cc8e0472d6dff588248c6f7695b63616c6766736861323536';

        let superBox: SuperBox;
        it('read a JUMBF box', function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = SuperBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(buffer, { endianness: 'big' });
            const box = schema.read(reader);
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // verify box content
            assert.ok(box.descriptionBox);
            assert.equal(box.descriptionBox.label, 'c2pa.claim');
            assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.claim);
            assert.equal(box.contentBoxes.length, 1);
            assert.ok(box.contentBoxes[0] instanceof CBORBox);
            assert.deepEqual(box.contentBoxes[0].content, {
                'dc:title': 'C.jpg',
                'dc:format': 'image/jpeg',
                instanceID: 'xmp:iid:f7ba134b-8dec-4334-911d-a30409e32d8e',
                claim_generator: 'make_test_images/0.16.1 c2pa-rs/0.16.1',
                signature: 'self#jumbf=c2pa.signature',
                assertions: [
                    {
                        url: 'self#jumbf=c2pa.assertions/c2pa.thumbnail.claim.jpeg',
                        hash: new Uint8Array([
                            99, 147, 52, 45, 243, 51, 174, 52, 177, 33, 139, 8, 87, 179, 80, 135, 54, 103, 239, 1, 0,
                            185, 220, 238, 214, 59, 101, 243, 114, 159, 227, 129,
                        ]),
                    },
                    {
                        url: 'self#jumbf=c2pa.assertions/stds.schema-org.CreativeWork',
                        hash: new Uint8Array([
                            187, 117, 196, 247, 33, 169, 237, 69, 214, 32, 29, 152, 118, 200, 210, 243, 119, 215, 236,
                            59, 92, 174, 60, 149, 177, 147, 151, 113, 40, 148, 57, 163,
                        ]),
                    },
                    {
                        url: 'self#jumbf=c2pa.assertions/c2pa.actions',
                        hash: new Uint8Array([
                            227, 105, 116, 153, 43, 120, 185, 237, 33, 34, 78, 88, 73, 157, 208, 241, 204, 28, 162, 211,
                            105, 133, 107, 18, 115, 11, 195, 202, 175, 170, 200, 255,
                        ]),
                    },
                    {
                        url: 'self#jumbf=c2pa.assertions/c2pa.hash.data',
                        hash: new Uint8Array([
                            178, 147, 1, 79, 136, 104, 24, 77, 196, 204, 5, 36, 168, 34, 10, 46, 121, 58, 108, 200, 224,
                            71, 45, 109, 255, 88, 130, 72, 198, 247, 105, 91,
                        ]),
                    },
                ],
                alg: 'sha256',
            });

            superBox = box;
        });

        let claim: Claim;
        it('construct a claim from the JUMBF box', function () {
            if (!superBox) this.skip();

            const c = Claim.read(superBox);

            assert.equal(c.sourceBox, superBox);

            assert.equal(c.label, 'c2pa.claim');
            assert.equal(c.version, ClaimVersion.V1);
            assert.equal(c.defaultAlgorithm, 'SHA-256');
            assert.equal(c.instanceID, 'xmp:iid:f7ba134b-8dec-4334-911d-a30409e32d8e');
            assert.equal(c.format, 'image/jpeg');
            assert.equal(c.title, 'C.jpg');
            assert.equal(c.assertions.length, 4);
            assert.deepEqual(c.assertions[0], {
                uri: 'self#jumbf=c2pa.assertions/c2pa.thumbnail.claim.jpeg',
                hash: new Uint8Array([
                    99, 147, 52, 45, 243, 51, 174, 52, 177, 33, 139, 8, 87, 179, 80, 135, 54, 103, 239, 1, 0, 185, 220,
                    238, 214, 59, 101, 243, 114, 159, 227, 129,
                ]),
                algorithm: 'SHA-256',
            });
            assert.deepEqual(c.assertions[1], {
                uri: 'self#jumbf=c2pa.assertions/stds.schema-org.CreativeWork',
                hash: new Uint8Array([
                    187, 117, 196, 247, 33, 169, 237, 69, 214, 32, 29, 152, 118, 200, 210, 243, 119, 215, 236, 59, 92,
                    174, 60, 149, 177, 147, 151, 113, 40, 148, 57, 163,
                ]),
                algorithm: 'SHA-256',
            });
            assert.deepEqual(c.assertions[2], {
                uri: 'self#jumbf=c2pa.assertions/c2pa.actions',
                hash: new Uint8Array([
                    227, 105, 116, 153, 43, 120, 185, 237, 33, 34, 78, 88, 73, 157, 208, 241, 204, 28, 162, 211, 105,
                    133, 107, 18, 115, 11, 195, 202, 175, 170, 200, 255,
                ]),
                algorithm: 'SHA-256',
            });
            assert.deepEqual(c.assertions[3], {
                uri: 'self#jumbf=c2pa.assertions/c2pa.hash.data',
                hash: new Uint8Array([
                    178, 147, 1, 79, 136, 104, 24, 77, 196, 204, 5, 36, 168, 34, 10, 46, 121, 58, 108, 200, 224, 71, 45,
                    109, 255, 88, 130, 72, 198, 247, 105, 91,
                ]),
                algorithm: 'SHA-256',
            });
            assert.deepEqual(c.redactedAssertions, []);
            assert.equal(c.signatureRef, 'self#jumbf=c2pa.signature');

            claim = c;
        });

        it('construct a JUMBF box from the claim', function () {
            if (!claim) this.skip();

            const box = claim.generateJUMBFBox();

            // check that the source box was regenerated
            assert.notEqual(box, superBox);
            assert.equal(box, claim.sourceBox);

            // verify box content
            assert.ok(box.descriptionBox);
            assert.equal(box.descriptionBox.label, 'c2pa.claim');
            assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.claim);
            assert.equal(box.contentBoxes.length, 1);
            assert.ok(box.contentBoxes[0] instanceof CBORBox);
            assert.deepEqual(box.contentBoxes[0].content, {
                'dc:title': 'C.jpg',
                'dc:format': 'image/jpeg',
                instanceID: 'xmp:iid:f7ba134b-8dec-4334-911d-a30409e32d8e',
                claim_generator: 'make_test_images/0.16.1 c2pa-rs/0.16.1',
                signature: 'self#jumbf=c2pa.signature',
                assertions: [
                    {
                        url: 'self#jumbf=c2pa.assertions/c2pa.thumbnail.claim.jpeg',
                        hash: new Uint8Array([
                            99, 147, 52, 45, 243, 51, 174, 52, 177, 33, 139, 8, 87, 179, 80, 135, 54, 103, 239, 1, 0,
                            185, 220, 238, 214, 59, 101, 243, 114, 159, 227, 129,
                        ]),
                    },
                    {
                        url: 'self#jumbf=c2pa.assertions/stds.schema-org.CreativeWork',
                        hash: new Uint8Array([
                            187, 117, 196, 247, 33, 169, 237, 69, 214, 32, 29, 152, 118, 200, 210, 243, 119, 215, 236,
                            59, 92, 174, 60, 149, 177, 147, 151, 113, 40, 148, 57, 163,
                        ]),
                    },
                    {
                        url: 'self#jumbf=c2pa.assertions/c2pa.actions',
                        hash: new Uint8Array([
                            227, 105, 116, 153, 43, 120, 185, 237, 33, 34, 78, 88, 73, 157, 208, 241, 204, 28, 162, 211,
                            105, 133, 107, 18, 115, 11, 195, 202, 175, 170, 200, 255,
                        ]),
                    },
                    {
                        url: 'self#jumbf=c2pa.assertions/c2pa.hash.data',
                        hash: new Uint8Array([
                            178, 147, 1, 79, 136, 104, 24, 77, 196, 204, 5, 36, 168, 34, 10, 46, 121, 58, 108, 200, 224,
                            71, 45, 109, 255, 88, 130, 72, 198, 247, 105, 91,
                        ]),
                    },
                ],
                alg: 'sha256',
            });
        });
    });
});
