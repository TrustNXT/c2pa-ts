import * as cbor from 'cbor-x';
import * as bin from 'typed-binary';
import { Box } from './Box';
import { BoxSchema } from './BoxSchema';

/**
 * Schema for CBOR boxes
 *
 * Note: A full round-trip during encoding and decoding is not always
 * possible, because there are sometimes multiple representations for
 * the same data. Try e.g. decoding the byte sequences [a1 61 61 01]
 * and [b9 00 01 61 61 01] in https://cbor.me, they both represent
 * the same data.
 */
class CBORBoxSchema extends BoxSchema<CBORBox> {
    readContent(input: bin.ISerialInput, type: string, length: number): CBORBox {
        if (type != CBORBox.typeCode) throw new Error(`CBORBox: Unexpected type ${type}`);

        const data = [];
        for (let i = 0; i < length - 8; i++) {
            data.push(input.readByte());
        }

        const box = new CBORBox();
        box.rawContent = new Uint8Array(data);
        try {
            // If the data is tagged, store content and tag separately,
            // but ignore the tag otherwise.
            const decoded: unknown = cbor.decode(box.rawContent);
            if (decoded instanceof cbor.Tag) {
                box.tag = decoded.tag;
                box.content = decoded.value;
            } else {
                box.tag = undefined;
                box.content = decoded;
            }
        } catch {
            // TODO This needs to be properly reported as a validation error
            throw new Error('CBORBox: Invalid CBOR data');
        }

        return box;
    }

    writeContent(output: bin.ISerialOutput, value: CBORBox): void {
        if (!value.rawContent) {
            if (value.tag !== undefined) {
                value.rawContent = cbor.encode(new cbor.Tag(value.content, value.tag));
            } else {
                value.rawContent = cbor.encode(value.content);
            }
        }

        value.rawContent.forEach(byte => output.writeByte(byte));
    }

    measureContent(value: CBORBox, measurer: bin.IMeasurer): bin.IMeasurer {
        if (!value.rawContent) {
            if (value.tag === undefined) {
                value.rawContent = cbor.encode(value.content);
            } else {
                value.rawContent = cbor.encode(new cbor.Tag(value.content, value.tag));
            }
        }

        return measurer.add(value.rawContent.length);
    }
}

export class CBORBox extends Box {
    public static readonly typeCode = 'cbor';
    public static readonly schema = new CBORBoxSchema();
    // see https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml for assigned tag numbers
    public tag?: number;
    public content: unknown;
    public rawContent: Uint8Array | undefined;

    constructor() {
        super(CBORBox.typeCode, CBORBox.schema);
    }

    public toString(prefix?: string): string {
        return (prefix ?? '') + 'CBOR content';
    }
}
