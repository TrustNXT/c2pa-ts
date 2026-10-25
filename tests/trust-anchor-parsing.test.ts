import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { X509Certificate } from '@peculiar/x509';
import { afterEach, beforeAll, beforeEach, describe, it } from 'bun:test';
import { TrustList } from '../src/cose';

const samplePemPath = 'tests/fixtures/sample_es256.pem';
const malformedPemBlock = [
    '-----BEGIN CERTIFICATE-----',
    'this is not base64 and must fail to parse',
    '-----END CERTIFICATE-----',
].join('\n');

let concatenatedPem = '';
let certBlocks: string[] = [];
let expectedFromPem: X509Certificate[] = [];
let originalTrustAnchors: X509Certificate[] = [];

beforeAll(async () => {
    concatenatedPem = await fs.readFile(samplePemPath, 'utf8');
    certBlocks = concatenatedPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];

    assert.ok(certBlocks.length >= 2, 'fixture must include at least two PEM certificates');

    expectedFromPem = TrustList.parseTrustAnchors([concatenatedPem]);
    assert.equal(expectedFromPem.length, certBlocks.length, 'fixture PEM certificates should be parseable');
});

beforeEach(() => {
    originalTrustAnchors = [...TrustList.trustAnchors];
});

afterEach(() => {
    TrustList.trustAnchors = originalTrustAnchors;
});

describe('Trust anchor parsing', () => {
    it('parses multiple concatenated PEM certificates', () => {
        const parsed = TrustList.parseTrustAnchors([concatenatedPem]);

        assert.equal(parsed.length, certBlocks.length);
        assert.deepEqual(
            parsed.map(cert => cert.subject),
            expectedFromPem.map(cert => cert.subject),
        );
    });

    it('parses DER certificate input', () => {
        const der = new Uint8Array(expectedFromPem[0].rawData);
        const parsed = TrustList.parseTrustAnchors([der]);

        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].subject, expectedFromPem[0].subject);
    });

    it('accepts already-constructed X509Certificate objects', () => {
        const existing = expectedFromPem[0];
        const parsed = TrustList.parseTrustAnchors([existing]);

        assert.equal(parsed.length, 1);
        assert.equal(parsed[0], existing);
    });

    it('keeps valid anchors when malformed PEM blocks are present', () => {
        const mixedPem = [certBlocks[0], malformedPemBlock, certBlocks[1]].join('\n');
        const parsed = TrustList.parseTrustAnchors([mixedPem]);

        assert.equal(parsed.length, 2);
        assert.deepEqual(
            parsed.map(cert => cert.subject),
            [expectedFromPem[0].subject, expectedFromPem[1].subject],
        );

        TrustList.setTrustAnchors([mixedPem]);
        assert.equal(TrustList.trustAnchors.length, 2);
        assert.deepEqual(
            TrustList.trustAnchors.map(cert => cert.subject),
            [expectedFromPem[0].subject, expectedFromPem[1].subject],
        );
    });

    it('throws when non-empty input contains no parseable certificate', () => {
        assert.throws(() => TrustList.parseTrustAnchors([malformedPemBlock]));
        assert.throws(() => TrustList.parseTrustAnchors([new Uint8Array([1, 2, 3])]));
        assert.throws(() => TrustList.setTrustAnchors(['not a certificate']));
    });

    it('accepts empty input without throwing', () => {
        assert.deepEqual(TrustList.parseTrustAnchors([]), []);
        assert.deepEqual(TrustList.parseTrustAnchors(['', '  \n']), []);
        assert.deepEqual(TrustList.parseTrustAnchors([new Uint8Array()]), []);
    });

    it('returns consistent results for repeated and many distinct PEM inputs', () => {
        for (let i = 0; i < 20; i++) {
            const pem = `${certBlocks[0]}\n# variant ${i}`;
            assert.equal(TrustList.parseTrustAnchors([pem]).length, 1);
            assert.equal(TrustList.parseTrustAnchors([pem]).length, 1);
        }
    });
});
