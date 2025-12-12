import assert from 'assert';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { JSONBox } from '../../src/jumbf';
import { BinaryHelper } from '../../src/util';

describe('JSONBox Tests', function () {
    describe('Empty', function () {
        const serializedString = '000000086a736f6e';

        it('serialization', async function () {
            const box = new JSONBox();

            // fetch schema from the box
            const schema = box.schema;

            // write the box to a buffer
            const length = schema.measure(box).size;
            const buffer = new Uint8Array(length);
            const writer = new bin.BufferWriter(buffer.buffer, { endianness: 'big' });
            schema.write(writer, box);

            // verify that the expected buffer size was also used
            assert.equal(buffer.length, writer.currentByteOffset, 'produced number of bytes differs');

            // verify expected buffer contents
            assert.equal(BinaryHelper.toHexString(buffer), serializedString);
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = JSONBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof JSONBox)) assert.fail('resulting box has wrong type');
            assert.equal(box.content, undefined);
        });
    });

    describe('Simple Dict', function () {
        const serializedString = '0000000f6a736f6e7b2261223a317d';

        it('serialization', async function () {
            const box = new JSONBox();
            box.content = { a: 1 };

            // fetch schema from the box
            const schema = box.schema;

            // write the box to a buffer
            const length = schema.measure(box).size;
            const buffer = new Uint8Array(length);
            const writer = new bin.BufferWriter(buffer.buffer, { endianness: 'big' });
            schema.write(writer, box);

            // verify that the expected buffer size was also used
            assert.equal(buffer.length, writer.currentByteOffset, 'produced number of bytes differs');

            // verify expected buffer contents
            assert.equal(BinaryHelper.toHexString(buffer), serializedString);
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = JSONBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof JSONBox)) assert.fail('resulting box has wrong type');
            assert.equal(JSON.stringify(box.content), JSON.stringify({ a: 1 }));
        });
    });

    describe('UTF-8', function () {
        it('serialization', async function () {
            const box = new JSONBox();
            box.content = { shrug: '🤷‍♂️' };

            // fetch schema from the box
            const schema = box.schema;

            // write the box to a buffer
            const length = schema.measure(box).size;
            const buffer = new Uint8Array(length);
            const writer = new bin.BufferWriter(buffer.buffer, { endianness: 'big' });
            schema.write(writer, box);

            // verify expected buffer contents
            assert.equal(
                BinaryHelper.toHexString(buffer),
                '000000216a736f6e7b227368727567223a22f09fa4b7e2808de29982efb88f227d',
            );
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(
                '000000216a736f6e7b227368727567223a22f09fa4b7e2808de29982efb88f227d',
            );

            // fetch schema from the box class
            const schema = JSONBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // validate resulting box
            if (!(box instanceof JSONBox)) assert.fail('resulting box has wrong type');
            assert.equal((box.content as Record<string, string>).shrug, '🤷‍♂️');
        });
    });
});
