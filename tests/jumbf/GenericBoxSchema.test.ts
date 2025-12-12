import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { GenericBoxSchema } from '../../src/jumbf/GenericBoxSchema';
import { UUIDBox } from '../../src/jumbf/UUIDBox';
import { BinaryHelper } from '../../src/util';

describe('GenericBoxSchema Tests', function () {
    const schema = new GenericBoxSchema();

    it('read an unrecognized box', async function () {
        const serializedString = '000000107465787454727573744e5854';
        const buffer = BinaryHelper.fromHexString(serializedString);

        // read the box from the buffer
        const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
        const box = schema.read(reader);

        // verify that the expected buffer size was also used
        assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

        assert.equal(box.type, 'text', 'type field was not filled');
    });

    it('read a UUIDBox', async function () {
        const serializedString = '00000018757569646332637300110010800000aa00389b71';

        const buffer = BinaryHelper.fromHexString(serializedString);

        // read the box from the buffer
        const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
        const box = schema.read(reader);

        // verify that the expected buffer size was also used
        assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

        assert(box instanceof UUIDBox);
    });
});
