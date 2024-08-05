import assert from 'node:assert/strict';
import * as bin from 'typed-binary';
import { CBORBox, SuperBox } from '../../src/jumbf';
import { Claim } from '../../src/manifest';
import { BinaryHelper } from '../../src/util';

describe('Claim Tests', function () {
    this.timeout(0);

    // claim data taken from adobe-20220124-C.jpg
    const serializedString =
        '000002796a756d62000000246a756d646332636c00110010800000aa00389b7103633270612e636c61696d000000024d63626f72a76864633a7469746c6565432e6a70676964633a666f726d61746a696d6167652f6a7065676a696e7374616e63654944782c786d703a6969643a66376261313334622d386465632d343333342d393131642d6133303430396533326438656f636c61696d5f67656e657261746f7278266d616b655f746573745f696d616765732f302e31362e3120633270612d72732f302e31362e31697369676e6174757265781973656c66236a756d62663d633270612e7369676e61747572656a617373657274696f6e7384a26375726c783473656c66236a756d62663d633270612e617373657274696f6e732f633270612e7468756d626e61696c2e636c61696d2e6a706567646861736858206393342df333ae34b1218b0857b350873667ef0100b9dceed63b65f3729fe381a26375726c783773656c66236a756d62663d633270612e617373657274696f6e732f737464732e736368656d612d6f72672e4372656174697665576f726b64686173685820bb75c4f721a9ed45d6201d9876c8d2f377d7ec3b5cae3c95b1939771289439a3a26375726c782773656c66236a756d62663d633270612e617373657274696f6e732f633270612e616374696f6e7364686173685820e36974992b78b9ed21224e58499dd0f1cc1ca2d369856b12730bc3caafaac8ffa26375726c782973656c66236a756d62663d633270612e617373657274696f6e732f633270612e686173682e6461746164686173685820b293014f8868184dc4cc0524a8220a2e793a6cc8e0472d6dff588248c6f7695b63616c6766736861323536';

    let superBox: SuperBox;
    it('read a JUMBF box', function () {
        const buffer = BinaryHelper.fromHexString(serializedString);

        // fetch schema from the box class
        const schema = SuperBox.schema;

        // read the box from the buffer
        const reader = new bin.BufferReader(buffer, { endianness: 'big' });
        const box = schema.read(reader);
        assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

        // verify box content
        assert.ok(box.contentBoxes);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);

        superBox = box;
    });

    let claim: Claim;
    it('construct a claim from the JUMBF box', function () {
        if (!superBox) this.skip();

        claim = Claim.read(superBox);

        assert.equal(claim.sourceBox, superBox);
        assert.equal(claim.assertions.length, 4);
        assert.equal(claim.defaultAlgorithm, 'SHA-256');
        assert.equal(claim.signatureRef, 'self#jumbf=c2pa.signature');
    });

    it('construct a JUMBF box from the claim', function () {
        if (!claim) this.skip();

        claim.generateJUMBFBox();

        assert.ok(claim.sourceBox);
        assert.notEqual(claim.sourceBox, superBox);

        assert.deepEqual(
            (claim.sourceBox.contentBoxes[0] as CBORBox).content,
            (superBox.contentBoxes[0] as CBORBox).content,
        );
    });
});
