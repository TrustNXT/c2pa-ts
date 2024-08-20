import { X509Certificate } from '@peculiar/x509';
import * as COSE from '../cose';
import * as JUMBF from '../jumbf';
import { MalformedContentError } from '../util';
import { Claim } from './Claim';
import * as raw from './rawTypes';
import { ManifestComponent, ValidationStatusCode } from './types';
import { ValidationError } from './ValidationError';
import { ValidationResult } from './ValidationResult';

export class Signature implements ManifestComponent {
    public readonly label: string = 'c2pa.signature';
    public signatureData: COSE.Signature;
    public sourceBox?: JUMBF.SuperBox;

    public constructor(signatureData: COSE.Signature) {
        this.signatureData = signatureData;
    }

    public static read(box: JUMBF.SuperBox): Signature {
        if (!box.contentBoxes.length || !(box.contentBoxes[0] instanceof JUMBF.CBORBox))
            throw new ValidationError(
                ValidationStatusCode.ClaimSignatureMissing,
                box,
                'Signature has invalid content boxes',
            );

        if (box.descriptionBox?.label !== 'c2pa.signature')
            throw new ValidationError(ValidationStatusCode.ClaimSignatureMissing, box, 'Signature has invalid label');

        if (box.contentBoxes[0].tag !== undefined && box.contentBoxes[0].tag !== 18) {
            throw new ValidationError(
                ValidationStatusCode.ClaimSignatureMissing,
                box,
                'Signature has invalid CBOR tag',
            );
        }
        const content = box.contentBoxes[0].content as COSE.CoseSignature;
        if (!Array.isArray(content) || content.length !== 4) {
            throw new ValidationError(
                ValidationStatusCode.ClaimSignatureMissing,
                box,
                'Signature has invalid CBOR content',
            );
        }

        let signatureData: COSE.Signature;
        try {
            signatureData = COSE.Signature.readFromJUMBFData(content);
        } catch (e) {
            if (e instanceof MalformedContentError) {
                throw new ValidationError(
                    ValidationStatusCode.SigningCredentialInvalid,
                    box,
                    'Failed to deserialize signature content',
                );
            } else {
                throw e;
            }
        }

        const signature = new Signature(signatureData);
        signature.sourceBox = box;
        return signature;
    }

    public generateJUMBFBox(): JUMBF.SuperBox {
        const box = new JUMBF.SuperBox();
        box.descriptionBox = new JUMBF.DescriptionBox();
        box.descriptionBox.label = this.label;
        box.descriptionBox.uuid = raw.UUIDs.signature;
        const contentBox = new JUMBF.CBORBox();
        contentBox.tag = 18;
        contentBox.content = this.signatureData.writeJUMBFData();
        box.contentBoxes.push(contentBox);

        this.sourceBox = box;
        return this.sourceBox;
    }

    public async validate(payload: Uint8Array): Promise<ValidationResult> {
        try {
            return this.signatureData.validate(payload, this.sourceBox);
        } catch (e) {
            if (e instanceof MalformedContentError) {
                return ValidationResult.error(ValidationStatusCode.SigningCredentialInvalid, this.sourceBox);
            } else {
                return ValidationResult.fromError(e as Error);
            }
        }
    }

    public static createFromCertificate(
        certificate: X509Certificate,
        algorithm: COSE.CoseAlgorithmIdentifier,
        chainCertificates: X509Certificate[] = [],
        initialPaddingLength = 1000,
    ) {
        const coseSignature = new COSE.Signature();
        coseSignature.paddingLength = initialPaddingLength;
        coseSignature.certificate = certificate;
        coseSignature.chainCertificates = chainCertificates;
        coseSignature.algorithm = COSE.Algorithms.getAlgorithm(algorithm);
        return new Signature(coseSignature);
    }

    public async sign(privateKey: Uint8Array, payload: Uint8Array): Promise<void> {
        const schema = JUMBF.SuperBox.schema;

        // Measure the size before adding the signature
        const previousLength = schema.measure(this.generateJUMBFBox()).size;

        await this.signatureData.sign(privateKey, payload);

        // Measure the new length after signature is added and adjust padding as necessary
        const adjust = schema.measure(this.generateJUMBFBox()).size - previousLength;
        if (adjust > this.signatureData.paddingLength) throw new Error('Not enough padding for signature');
        this.signatureData.paddingLength -= adjust;
    }

    public getBytes(claim: Claim, rebuild = false): Uint8Array | undefined {
        if (rebuild) this.generateJUMBFBox();
        return this.sourceBox?.toBuffer();
    }
}
