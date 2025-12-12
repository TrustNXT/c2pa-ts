import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { SuperBox } from '../../src/jumbf';
import { ActionAssertion, AssertionStore, Claim, DataHashAssertion, UnknownAssertion } from '../../src/manifest';
import * as raw from '../../src/manifest/rawTypes';
import { BinaryHelper } from '../../src/util';

describe('AssertionStore Tests', function () {
    // assertion store data taken from adobe-20220124-C.jpg but modified
    const serializedString =
        '000001606a756d62000000296a756d646332617300110010800000aa00389b7103633270612e617373657274696f6e7300' +
        '000000846a756d62000000266a756d6463626f7200110010800000aa00389b7103633270612e616374696f6e73000000005663626f72a167616374696f6e7382a166616374696f6e6c633270612e63726561746564a266616374696f6e6c633270612e64726177696e676a706172616d6574657273a1646e616d65686772616469656e74' +
        '000000ab6a756d62000000286a756d6463626f7200110010800000aa00389b7103633270612e686173682e64617461000000007b63626f72a56a6578636c7573696f6e7381a265737461727414666c656e67746819c7ba646e616d656e6a756d6266206d616e696665737463616c6766736861323536646861736858205b9361f6f790e98c2b95db7d89cc378c7bfd3326eae4e4dbe3c6b9b40c55e6896370616449000000000000000000';

    let superBox: SuperBox;
    it('read a JUMBF box', function () {
        const buffer = BinaryHelper.fromHexString(serializedString);

        // fetch schema from the box class
        const schema = SuperBox.schema;

        // read the box from the buffer
        const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
        const box = schema.read(reader);
        assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.assertions');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.assertionStore);
        assert.equal(box.contentBoxes.length, 2);
        assert.ok(box.contentBoxes[0] instanceof SuperBox);
        assert.ok(box.contentBoxes[1] instanceof SuperBox);

        superBox = box;
    });

    const claim = new Claim();

    let assertionStore: AssertionStore;
    it('construct an assertion store from the JUMBF box', function () {
        if (!superBox) return;

        const s = AssertionStore.read(superBox, claim);

        assert.equal(s.sourceBox, superBox);
        assert.equal(s.label, 'c2pa.assertions');
        assert.equal(s.assertions.length, 2);
        assert.ok(s.assertions.every(assertion => !(assertion instanceof UnknownAssertion)));
        assert.ok(s.assertions[0] instanceof ActionAssertion);
        assert.ok(s.assertions[1] instanceof DataHashAssertion);

        assertionStore = s;
    });

    it('construct a JUMBF box from the assertion store', function () {
        if (!assertionStore) return;

        const box = assertionStore.generateJUMBFBox(claim);

        // check that the source box was regenerated
        assert.notEqual(box, superBox);
        assert.equal(box, assertionStore.sourceBox);

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.assertions');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.assertionStore);
        assert.equal(box.contentBoxes.length, 2);
        assert.ok(box.contentBoxes[0] instanceof SuperBox);
        assert.ok(box.contentBoxes[1] instanceof SuperBox);
        // TODO: further validate generated box' content
    });
});
