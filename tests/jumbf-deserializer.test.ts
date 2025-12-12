import assert from 'assert';
import { describe, it } from 'bun:test';
import {
    BoxReader,
    DescriptionBox,
    EmbeddedFileBox,
    EmbeddedFileDescriptionBox,
    JSONBox,
    SuperBox,
} from '../src/jumbf';
import { UUIDBox } from '../src/jumbf/UUIDBox';
import { BinaryHelper } from '../src/util';

describe('JUMBF Deserializer Tests', function () {
    it('description box', async () => {
        const jumbf = BinaryHelper.fromHexString(
            '000000266a756d640000000000000000000000000000000003746573742e64657363626f7800',
        );

        // deserialize raw data
        const { box, lBox } = BoxReader.readFromBuffer(jumbf);
        assert.equal(lBox, jumbf.length, 'buffer contains superfluous data');

        // validate resulting box
        if (!(box instanceof DescriptionBox)) assert.fail('resulting box has wrong type');
        assert.ok(box.requestable);
        assert.equal(box.label, 'test.descbox');
    });

    it('super box', async () => {
        const jumbf = BinaryHelper.fromHexString(
            '0000002f6a756d62000000276a756d640000000000000000000000000000000003746573742e7375706572626f7800',
        );

        // deserialize raw data
        const box = SuperBox.fromBuffer(jumbf);

        // validate resulting box
        assert(box instanceof SuperBox, 'resulting box has wrong type');
        assert.equal(box.uri, 'self#jumbf=/test.superbox');
        assert.ok(box.descriptionBox);
        assert.ok(box.descriptionBox.requestable);
        assert.equal(box.descriptionBox.label, 'test.superbox');
        assert.equal(box.contentBoxes.length, 0);
    });

    it('super box with one data box', async () => {
        const jumbf = BinaryHelper.fromHexString(
            '000000656a756d620000002f6a756d640000000000000000000000000000000003746573742e7375706572626f785f64617461626f78000000002e6a756d62000000266a756d640000000000000000000000000000000003746573742e64617461626f7800',
        );

        // deserialize raw data
        const box = SuperBox.fromBuffer(jumbf);

        // validate resulting box
        assert(box instanceof SuperBox, 'resulting box has wrong type');
        assert.equal(box.uri, 'self#jumbf=/test.superbox_databox');
        assert.ok(box.descriptionBox);
        assert.ok(box.descriptionBox.requestable);
        assert.equal(box.descriptionBox.label, 'test.superbox_databox');
        assert.equal(box.contentBoxes.length, 1);
        const nestedBox1 = box.contentBoxes[0];
        assert(nestedBox1 instanceof SuperBox, 'resulting box has wrong type');
        assert.equal(nestedBox1.uri, 'self#jumbf=/test.superbox_databox/test.databox');
        assert.equal(nestedBox1.contentBoxes.length, 0);
    });

    it('cai signature box', async () => {
        const jumbf = BinaryHelper.fromHexString(
            '000000776a756d62000000286a756d646332637300110010800000aa00389b7103633270612e7369676e61747572650000000047757569646332637300110010800000aa00389b717468697320776f756c64206e6f726d616c6c792062652062696e617279207369676e617475726520646174612e2e2e',
        );

        // deserialize raw data
        const box = SuperBox.fromBuffer(jumbf);

        // validate resulting box
        assert(box instanceof SuperBox, 'resulting box has wrong type');
        assert.equal(box.uri, 'self#jumbf=/c2pa.signature');
        assert.equal(box.contentBoxes.length, 1);
        const nestedBox = box.contentBoxes[0];
        assert(nestedBox instanceof UUIDBox, 'nested box has wrong type');
        assert.equal(BinaryHelper.toHexString(nestedBox.uuid), '6332637300110010800000aa00389b71');
        assert.ok(nestedBox.content);
        assert.equal(nestedBox.content.length, 47);
    });

    it('cai location assertion box', async () => {
        const jumbf = BinaryHelper.fromHexString(
            '0000005b6a756d620000002d6a756d646a736f6e00110010800000aa00389b7103633270612e6c6f636174696f6e2e62726f616400000000266a736f6e7b20226c6f636174696f6e223a202253616e204672616e636973636f227d',
        );

        // deserialize raw data
        const box = SuperBox.fromBuffer(jumbf);

        // validate resulting box
        assert(box instanceof SuperBox, 'resulting box has wrong type');
        assert.equal(box.uri, 'self#jumbf=/c2pa.location.broad');
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.location.broad');
        assert.equal(BinaryHelper.toHexString(box.descriptionBox.uuid), '6a736f6e00110010800000aa00389b71');
        assert.equal(box.contentBoxes.length, 1);
        const nestedBox = box.contentBoxes[0];
        assert(nestedBox instanceof JSONBox, 'resulting box has wrong type');
    });

    it('assertion store', async () => {
        const jumbf = BinaryHelper.fromHexString(
            '000000f86a756d62000000296a756d646332617300110010800000aa00389b7103633270612e617373657274696f6e7300000000686a756d620000002e6a756d6440cb0c32bb8a489da70b2ad6f47f436903633270612e636c61696d2e7468756d626e61696c00000000146266646200696d6167652f6a706567000000001e626964623c696d616765206461746120676f657320686572653e0000005f6a756d62000000276a756d646a736f6e00110010800000aa00389b7103633270612e6964656e7469747900000000306a736f6e7b2022757269223a20226469643a61646f62653a6c726f73656e74684061646f62652e636f6d227d',
        );

        // deserialize raw data
        const box = SuperBox.fromBuffer(jumbf);

        // validate resulting box
        assert(box instanceof SuperBox, 'resulting box has wrong type');
        assert.equal(box.uri, 'self#jumbf=/c2pa.assertions');
        assert.equal(box.contentBoxes.length, 2);
        const nestedBox1 = box.contentBoxes[0];
        assert(nestedBox1 instanceof SuperBox, 'resulting box has wrong type');
        assert.equal(nestedBox1.uri, 'self#jumbf=/c2pa.assertions/c2pa.claim.thumbnail');
        assert.equal(nestedBox1.contentBoxes.length, 2);
        const nestedBox11 = nestedBox1.contentBoxes[0];
        assert(nestedBox11 instanceof EmbeddedFileDescriptionBox, 'resulting box has wrong type');
        assert.equal(nestedBox11.mediaType, 'image/jpeg');
        const nestedBox12 = nestedBox1.contentBoxes[1];
        assert(nestedBox12 instanceof EmbeddedFileBox, 'resulting box has wrong type');
        const nestedBox2 = box.contentBoxes[1];
        assert(nestedBox2 instanceof SuperBox, 'resulting box has wrong type');
        assert.equal(nestedBox2.uri, 'self#jumbf=/c2pa.assertions/c2pa.identity');
        assert.equal(nestedBox2.contentBoxes.length, 1);
        const nestedBox21 = nestedBox2.contentBoxes[0];
        assert(nestedBox21 instanceof JSONBox, 'resulting box has wrong type');
    });
});
