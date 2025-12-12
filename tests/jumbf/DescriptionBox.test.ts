import assert from 'assert';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { DescriptionBox } from '../../src/jumbf';
import { UUIDBox } from '../../src/jumbf/UUIDBox';
import { BinaryHelper } from '../../src/util';

describe('DescriptionBox Tests', function () {
    describe('Minimal', function () {
        const uuidString = '6332637300110010800000aa00389b71';
        const serializedString = '000000196a756d646332637300110010800000aa00389b7100';

        it('serialization', async function () {
            const box = new DescriptionBox();
            box.uuid = BinaryHelper.fromHexString(uuidString);
            box.requestable = false;

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
            const schema = DescriptionBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof DescriptionBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.uuid);
            assert.equal(BinaryHelper.toHexString(box.uuid), uuidString);
            assert.equal(box.requestable, false);
            assert.equal(box.label, undefined);
            assert.equal(box.id, undefined);
            assert.equal(box.hash, undefined);
            assert.equal(box.privateBoxes.length, 0);
        });
    });

    describe('With Optional Fields', function () {
        const uuidString = '6332637300110010800000aa00389b71';
        const label = 'description label';
        const id = 42;
        const hashString = '8dc6ba27eb4c0195fc7001c3e13ecaa78dc6ba27eb4c0195fc7001c3e13ecaa7';
        const serializedString =
            '0000004f6a756d646332637300110010800000aa00389b710f6465736372697074696f6e206c6162656c000000002a8dc6ba27eb4c0195fc7001c3e13ecaa78dc6ba27eb4c0195fc7001c3e13ecaa7';

        it('serialization', async function () {
            const box = new DescriptionBox();
            box.uuid = BinaryHelper.fromHexString(uuidString);
            box.requestable = true;
            box.label = label;
            box.id = id;
            box.hash = BinaryHelper.fromHexString(hashString);
            box.privateBoxes = [];

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
            const schema = DescriptionBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof DescriptionBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.uuid);
            assert.equal(BinaryHelper.toHexString(box.uuid), uuidString);
            assert.equal(box.requestable, true);
            assert.equal(box.label, label);
            assert.equal(box.id, id);
            assert.ok(box.hash);
            assert.equal(BinaryHelper.toHexString(box.hash), hashString);
            assert.equal(box.privateBoxes.length, 0);
        });
    });

    describe('With Private Boxes', function () {
        const uuidString = '6332637300110010800000aa00389b71';
        const serializedString =
            '000000316a756d646332637300110010800000aa00389b711000000018757569646332637300110010800000aa00389b71';

        it('serialization', async function () {
            const box = new DescriptionBox();
            box.uuid = BinaryHelper.fromHexString(uuidString);
            box.requestable = false;

            const nestedBox = new UUIDBox();
            nestedBox.uuid = BinaryHelper.fromHexString(uuidString);
            box.privateBoxes.push(nestedBox);

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
            const schema = DescriptionBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof DescriptionBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.uuid);
            assert.equal(BinaryHelper.toHexString(box.uuid), uuidString);
            assert.equal(box.requestable, false);
            assert.equal(box.label, undefined);
            assert.equal(box.id, undefined);
            assert.equal(box.hash, undefined);
            assert.equal(box.privateBoxes.length, 1);
            assert(box.privateBoxes[0] instanceof UUIDBox);
        });
    });
});
