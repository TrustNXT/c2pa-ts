import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { DescriptionBox, JSONBox, SuperBox } from '../../../src/jumbf';
import { Assertion, Claim, DigitalSourceType, MetadataAssertion, MetadataNamespace } from '../../../src/manifest';
import * as raw from '../../../src/manifest/rawTypes';

describe('MetadataAssertion Tests', function () {
    const exampleMetadataJsonLD = {
        '@context': {
            exif: 'http://ns.adobe.com/exif/1.0/',
            exifEX: 'http://cipa.jp/exif/2.32/',
            tiff: 'http://ns.adobe.com/tiff/1.0/',
            Iptc4xmpExt: 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/',
            photoshop: 'http://ns.adobe.com/photoshop/1.0/',
        },
        'photoshop:DateCreated': 'Aug 31, 2022',
        'Iptc4xmpExt:DigitalSourceType': 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
        'Iptc4xmpExt:LocationCreated': {
            'Iptc4xmpExt:City': 'San Francisco',
        },
        'exif:GPSLatitude': '39,21.102N',
        'exif:GPSLongitude': '74,26.5737W',
        'exif:GPSTimeStamp': '2019-09-22T18:22:57Z',
        'exif:FNumber': 4.0,
        'exif:ColorSpace': 1,
        'exif:DigitalZoomRatio': 2.0,
        'tiff:Make': 'CameraCompany',
        'tiff:Model': 'Shooter S1',
        'exifEX:LensMake': 'CameraCompany',
        'exifEX:LensModel': '17.0-35.0 mm',
        'exifEX:LensSpecification': { '@list': [1.55, 4.2, 1.6, 2.4] },
    };

    const claim = new Claim();
    let assertion: Assertion;
    let superBox: SuperBox;

    it('construct an assertion from a JUMBF box', function () {
        superBox = new SuperBox();
        superBox.descriptionBox = new DescriptionBox();
        superBox.descriptionBox.label = 'c2pa.metadata';
        superBox.descriptionBox.uuid = raw.UUIDs.jsonAssertion;

        const jsonBox = new JSONBox();
        jsonBox.content = exampleMetadataJsonLD;
        superBox.contentBoxes.push(jsonBox);

        const metadataAssertion = new MetadataAssertion();
        metadataAssertion.readFromJUMBF(superBox, claim);

        assert.equal(metadataAssertion.sourceBox, superBox);
        assert.equal(metadataAssertion.label, 'c2pa.metadata');
        assert.deepEqual(metadataAssertion.uuid, raw.UUIDs.jsonAssertion);
        assert.deepEqual(metadataAssertion.entries, [
            {
                name: 'DateCreated',
                namespace: MetadataNamespace.Photoshop,
                value: 'Aug 31, 2022',
            },
            {
                name: 'DigitalSourceType',
                namespace: MetadataNamespace.IPTCExtension,
                value: DigitalSourceType.DigitalCapture,
            },
            {
                name: 'LocationCreated',
                namespace: MetadataNamespace.IPTCExtension,
                value: {
                    City: 'San Francisco',
                },
            },
            {
                name: 'GPSLatitude',
                namespace: MetadataNamespace.Exif,
                value: '39,21.102N',
            },
            {
                name: 'GPSLongitude',
                namespace: MetadataNamespace.Exif,
                value: '74,26.5737W',
            },
            {
                name: 'GPSTimeStamp',
                namespace: MetadataNamespace.Exif,
                value: '2019-09-22T18:22:57Z',
            },
            {
                name: 'FNumber',
                namespace: MetadataNamespace.Exif,
                value: 4,
            },
            {
                name: 'ColorSpace',
                namespace: MetadataNamespace.Exif,
                value: 1,
            },
            {
                name: 'DigitalZoomRatio',
                namespace: MetadataNamespace.Exif,
                value: 2,
            },
            {
                name: 'Make',
                namespace: MetadataNamespace.TIFF,
                value: 'CameraCompany',
            },
            {
                name: 'Model',
                namespace: MetadataNamespace.TIFF,
                value: 'Shooter S1',
            },
            {
                name: 'LensMake',
                namespace: MetadataNamespace.ExifEx_2_32,
                value: 'CameraCompany',
            },
            {
                name: 'LensModel',
                namespace: MetadataNamespace.ExifEx_2_32,
                value: '17.0-35.0 mm',
            },
            {
                name: 'LensSpecification',
                namespace: MetadataNamespace.ExifEx_2_32,
                value: [1.55, 4.2, 1.6, 2.4],
            },
        ]);

        assertion = metadataAssertion;
    });

    it('construct a JUMBF box from the assertion', function () {
        if (!assertion) return;

        const box = assertion.generateJUMBFBox(claim);

        // check that the source box was regenerated
        assert.notEqual(box, superBox);
        assert.equal(box, assertion.sourceBox);

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.metadata');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.jsonAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof JSONBox);
        assert.deepEqual(box.contentBoxes[0].content, exampleMetadataJsonLD);
    });
});
