import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { NamedActorRole, SignatureType } from '../../../src/cawg';
import { CBORBox, DescriptionBox, SuperBox } from '../../../src/jumbf';
import { Assertion, AssertionLabels, Claim, IdentityAssertion } from '../../../src/manifest';
import * as raw from '../../../src/manifest/rawTypes';

describe('IdentityAssertion Tests', function () {
    const claim = new Claim();

    // Example CAWG Identity Assertion CBOR data
    const exampleIdentityAssertion = {
        signer_payload: {
            referenced_assertions: [
                {
                    url: 'self#jumbf=/c2pa/urn:uuid:12345678-1234-1234-1234-123456789abc/c2pa.assertions/c2pa.hash.data',
                    alg: 'sha256',
                    hash: new Uint8Array([
                        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
                        0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
                    ]),
                },
            ],
            sig_type: SignatureType.X509Cose,
            role: [NamedActorRole.Creator],
        },
        signature: new Uint8Array([
            0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xad, 0xae, 0xaf, 0xb0, 0xb1,
            0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf,
        ]),
        pad1: new Uint8Array(64),
    };

    let superBox: SuperBox;
    it('construct a JUMBF box with identity assertion', function () {
        superBox = new SuperBox();
        superBox.descriptionBox = new DescriptionBox();
        superBox.descriptionBox.label = AssertionLabels.identity;
        superBox.descriptionBox.uuid = raw.UUIDs.cborAssertion;

        const cborBox = new CBORBox();
        cborBox.content = exampleIdentityAssertion;
        superBox.contentBoxes.push(cborBox);

        // verify box content
        assert.ok(superBox.descriptionBox);
        assert.equal(superBox.descriptionBox.label, AssertionLabels.identity);
        assert.deepEqual(superBox.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(superBox.contentBoxes.length, 1);
        assert.ok(superBox.contentBoxes[0] instanceof CBORBox);
    });

    let assertion: Assertion;
    it('construct an assertion from the JUMBF box', function () {
        if (!superBox) return;

        const identityAssertion = new IdentityAssertion();
        identityAssertion.readFromJUMBF(superBox, claim);

        assert.equal(identityAssertion.sourceBox, superBox);
        assert.equal(identityAssertion.label, AssertionLabels.identity);
        assert.deepEqual(identityAssertion.uuid, raw.UUIDs.cborAssertion);

        // Verify signer payload
        assert.equal(identityAssertion.signerPayload.sig_type, SignatureType.X509Cose);
        assert.deepEqual(identityAssertion.signerPayload.role, [NamedActorRole.Creator]);
        assert.equal(identityAssertion.signerPayload.referenced_assertions.length, 1);
        assert.equal(
            identityAssertion.signerPayload.referenced_assertions[0].url,
            'self#jumbf=/c2pa/urn:uuid:12345678-1234-1234-1234-123456789abc/c2pa.assertions/c2pa.hash.data',
        );
        assert.equal(identityAssertion.signerPayload.referenced_assertions[0].alg, 'sha256');
        assert.deepEqual(
            identityAssertion.signerPayload.referenced_assertions[0].hash,
            exampleIdentityAssertion.signer_payload.referenced_assertions[0].hash,
        );

        // Verify signature
        assert.deepEqual(identityAssertion.signature, exampleIdentityAssertion.signature);

        // Verify padding
        assert.deepEqual(identityAssertion.pad1, exampleIdentityAssertion.pad1);

        assertion = identityAssertion;
    });

    it('construct a JUMBF box from the assertion', function () {
        if (!assertion) return;

        const box = assertion.generateJUMBFBox(claim);

        // check that the source box was regenerated
        assert.notEqual(box, superBox);
        assert.equal(box, assertion.sourceBox);

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, AssertionLabels.identity);
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);

        const content = box.contentBoxes[0].content as typeof exampleIdentityAssertion;
        assert.equal(content.signer_payload.sig_type, SignatureType.X509Cose);
        assert.deepEqual(content.signer_payload.role, [NamedActorRole.Creator]);
        assert.deepEqual(content.signature, exampleIdentityAssertion.signature);
        assert.deepEqual(content.pad1, exampleIdentityAssertion.pad1);
    });

    it('create and read back an assertion', function () {
        const constructedAssertion = new IdentityAssertion();

        // Use helper method to set signer payload
        constructedAssertion.setSignerPayload(
            [
                {
                    url: 'self#jumbf=/c2pa/manifest/c2pa.assertions/c2pa.hash.data',
                    alg: 'sha256',
                    hash: new Uint8Array(32).fill(0xff),
                },
            ],
            SignatureType.X509Cose,
            [NamedActorRole.Creator, NamedActorRole.Contributor],
        );

        // Use helper method to set signature
        const testSignature = new Uint8Array(64).fill(0xaa);
        const testPad1 = new Uint8Array(128).fill(0x00);
        constructedAssertion.setSignature(testSignature, testPad1);

        // Generate JUMBF box
        const box = constructedAssertion.generateJUMBFBox(claim);

        assert.equal(box.descriptionBox?.label, AssertionLabels.identity);
        assert.deepEqual(box.descriptionBox?.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);

        // Read back the assertion
        const readBackAssertion = new IdentityAssertion();
        readBackAssertion.readFromJUMBF(box, claim);

        assert.equal(readBackAssertion.label, AssertionLabels.identity);
        assert.equal(readBackAssertion.signerPayload.sig_type, SignatureType.X509Cose);
        assert.deepEqual(readBackAssertion.signerPayload.role, [NamedActorRole.Creator, NamedActorRole.Contributor]);
        assert.equal(readBackAssertion.signerPayload.referenced_assertions.length, 1);
        assert.equal(
            readBackAssertion.signerPayload.referenced_assertions[0].url,
            'self#jumbf=/c2pa/manifest/c2pa.assertions/c2pa.hash.data',
        );
        assert.deepEqual(readBackAssertion.signature, testSignature);
        assert.deepEqual(readBackAssertion.pad1, testPad1);
    });

    it('create assertion with optional fields', function () {
        const constructedAssertion = new IdentityAssertion();

        const expectedPartialClaim = {
            alg: 'sha256',
            hash: new Uint8Array(32).fill(0x11),
        };

        const expectedClaimGenerator = {
            alg: 'sha256',
            hash: new Uint8Array(32).fill(0x22),
        };

        const expectedCountersigners = [
            {
                partial_signer_payload: {
                    referenced_assertions: [
                        {
                            url: 'self#jumbf=/c2pa/manifest/c2pa.assertions/c2pa.hash.data',
                            hash: new Uint8Array(32).fill(0x33),
                        },
                    ],
                    sig_type: SignatureType.X509Cose,
                },
                expected_credentials: {
                    alg: 'sha256',
                    hash: new Uint8Array(32).fill(0x44),
                },
            },
        ];

        constructedAssertion.setSignerPayload(
            [
                {
                    url: 'self#jumbf=/c2pa/manifest/c2pa.assertions/c2pa.hash.data',
                    hash: new Uint8Array(32).fill(0x55),
                },
            ],
            SignatureType.X509Cose,
            [NamedActorRole.Editor],
            {
                expectedPartialClaim,
                expectedClaimGenerator,
                expectedCountersigners,
            },
        );

        constructedAssertion.setSignature(new Uint8Array(64).fill(0xbb), new Uint8Array(128).fill(0x00));

        // Generate and read back
        const box = constructedAssertion.generateJUMBFBox(claim);
        const readBackAssertion = new IdentityAssertion();
        readBackAssertion.readFromJUMBF(box, claim);

        assert.deepEqual(readBackAssertion.signerPayload.expected_partial_claim, expectedPartialClaim);
        assert.deepEqual(readBackAssertion.signerPayload.expected_claim_generator, expectedClaimGenerator);
        assert.equal(readBackAssertion.signerPayload.expected_countersigners?.length, 1);
        assert.deepEqual(
            readBackAssertion.signerPayload.expected_countersigners?.[0].partial_signer_payload.sig_type,
            SignatureType.X509Cose,
        );
    });

    it('create assertion with pad2', function () {
        const constructedAssertion = new IdentityAssertion();

        constructedAssertion.setSignerPayload(
            [
                {
                    url: 'self#jumbf=/c2pa/manifest/c2pa.assertions/c2pa.hash.data',
                    hash: new Uint8Array(32).fill(0xcc),
                },
            ],
            SignatureType.X509Cose,
        );

        const testPad2 = new Uint8Array(256).fill(0x00);
        constructedAssertion.setSignature(new Uint8Array(64).fill(0xdd), new Uint8Array(128).fill(0x00), testPad2);

        // Generate and read back
        const box = constructedAssertion.generateJUMBFBox(claim);
        const readBackAssertion = new IdentityAssertion();
        readBackAssertion.readFromJUMBF(box, claim);

        assert.ok(readBackAssertion.pad2);
        assert.deepEqual(readBackAssertion.pad2, testPad2);
    });

    it('should throw error for missing signer_payload', function () {
        const invalidBox = new SuperBox();
        invalidBox.descriptionBox = new DescriptionBox();
        invalidBox.descriptionBox.label = AssertionLabels.identity;
        invalidBox.descriptionBox.uuid = raw.UUIDs.cborAssertion;

        const cborBox = new CBORBox();
        cborBox.content = {
            signature: new Uint8Array(64),
            pad1: new Uint8Array(128),
        };
        invalidBox.contentBoxes.push(cborBox);

        const identityAssertion = new IdentityAssertion();
        assert.throws(() => {
            identityAssertion.readFromJUMBF(invalidBox, claim);
        }, /Identity assertion is missing signer_payload/);
    });

    it('should throw error for missing signature', function () {
        const invalidBox = new SuperBox();
        invalidBox.descriptionBox = new DescriptionBox();
        invalidBox.descriptionBox.label = AssertionLabels.identity;
        invalidBox.descriptionBox.uuid = raw.UUIDs.cborAssertion;

        const cborBox = new CBORBox();
        cborBox.content = {
            signer_payload: {
                referenced_assertions: [],
                sig_type: SignatureType.X509Cose,
            },
            pad1: new Uint8Array(128),
        };
        invalidBox.contentBoxes.push(cborBox);

        const identityAssertion = new IdentityAssertion();
        assert.throws(() => {
            identityAssertion.readFromJUMBF(invalidBox, claim);
        }, /Identity assertion is missing signature/);
    });

    it('should throw error for missing pad1', function () {
        const invalidBox = new SuperBox();
        invalidBox.descriptionBox = new DescriptionBox();
        invalidBox.descriptionBox.label = AssertionLabels.identity;
        invalidBox.descriptionBox.uuid = raw.UUIDs.cborAssertion;

        const cborBox = new CBORBox();
        cborBox.content = {
            signer_payload: {
                referenced_assertions: [],
                sig_type: SignatureType.X509Cose,
            },
            signature: new Uint8Array(64),
        };
        invalidBox.contentBoxes.push(cborBox);

        const identityAssertion = new IdentityAssertion();
        assert.throws(() => {
            identityAssertion.readFromJUMBF(invalidBox, claim);
        }, /Identity assertion is missing pad1/);
    });

    it('should throw error for invalid box type', function () {
        const invalidBox = new SuperBox();
        invalidBox.descriptionBox = new DescriptionBox();
        invalidBox.descriptionBox.label = AssertionLabels.identity;
        invalidBox.descriptionBox.uuid = raw.UUIDs.jsonAssertion; // Wrong UUID

        const cborBox = new CBORBox();
        cborBox.content = exampleIdentityAssertion;
        invalidBox.contentBoxes.push(cborBox);

        const identityAssertion = new IdentityAssertion();
        assert.throws(() => {
            identityAssertion.readFromJUMBF(invalidBox, claim);
        }, /Identity assertion has invalid type/);
    });
});
