import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import * as schemata from '../../src/jumbf/schemata';
import { BinaryHelper } from '../../src/util';

describe('Schemata Tests', function () {
    describe('FallbackBoxSchema Tests', function () {
        const schema = schemata.fallback;

        it('read an unrecognized box', async function () {
            const serializedString = '000000107465787454727573744e5854';
            const buffer = BinaryHelper.fromHexString(serializedString);

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            assert.equal(reader.currentByteOffset, buffer.length, 'not all data was consumed');
            assert.equal(box.type, 'text', 'type field was not filled');
        });
    });
});
