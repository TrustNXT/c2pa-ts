import assert from 'assert';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { C2PASaltBox } from '../../src/jumbf/C2PASaltBox';
import { BinaryHelper } from '../../src/util';

describe('C2PASaltBox Tests', function () {
    describe('16 bit salt', function () {
        const saltString = '6332637300110010800000aa00389b71';
        const serializedString = '00000018633273686332637300110010800000aa00389b71';

        it('serialization', async function () {
            const box = new C2PASaltBox();
            box.salt = BinaryHelper.fromHexString(saltString);

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
            const schema = C2PASaltBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof C2PASaltBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.salt);
            assert.equal(BinaryHelper.toHexString(box.salt), saltString);
        });
    });

    describe('32 bit salt', function () {
        const saltString = '0800000aa00386332637300116332637300110010010800000aa00389b719b71';
        const serializedString = '00000028633273680800000aa00386332637300116332637300110010010800000aa00389b719b71';

        it('serialization', async function () {
            const box = new C2PASaltBox();
            box.salt = BinaryHelper.fromHexString(saltString);

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
            const schema = C2PASaltBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof C2PASaltBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.salt);
            assert.equal(BinaryHelper.toHexString(box.salt), saltString);
        });
    });
});
