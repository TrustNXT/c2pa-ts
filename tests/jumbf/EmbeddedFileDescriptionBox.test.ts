import assert from 'assert';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { EmbeddedFileDescriptionBox } from '../../src/jumbf';
import { BinaryHelper } from '../../src/util';

describe('EmbeddedFileDescriptionBox Tests', function () {
    describe('Without Filename', function () {
        const mediaType = 'video/mp4';
        const serializedString = '000000136266646200766964656f2f6d703400';

        it('serialization', async function () {
            const box = new EmbeddedFileDescriptionBox();
            box.mediaType = mediaType;

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
            const schema = EmbeddedFileDescriptionBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof EmbeddedFileDescriptionBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.mediaType);
            assert.equal(box.mediaType, mediaType);
        });
    });

    describe('With Filename', function () {
        const mediaType = 'video/mp4';
        const fileName = 'holiday.mp4';
        const serializedString = '0000001f6266646201766964656f2f6d703400686f6c696461792e6d703400';

        it('serialization', async function () {
            const box = new EmbeddedFileDescriptionBox();
            box.mediaType = mediaType;
            box.fileName = fileName;

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
            const schema = EmbeddedFileDescriptionBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof EmbeddedFileDescriptionBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.mediaType);
            assert.equal(box.mediaType, mediaType);
            assert.ok(box.fileName);
            assert.equal(box.fileName, fileName);
        });
    });
});
