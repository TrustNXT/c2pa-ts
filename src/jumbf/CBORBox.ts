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

        const data = bin.u8Array(length - 8).read(input);

        const box = new CBORBox();
        box.rawContent = data;
        try {
            // If the data is tagged, store content and tag separately,
            // but ignore the tag otherwise.
            const decoded: unknown = CBORBox.decoder.decode(box.rawContent);
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
        if (!value.rawContent) value.generateRawContent();

        output.writeSlice(value.rawContent!);
    }

    measureContent(value: CBORBox, measurer: bin.IMeasurer): bin.IMeasurer {
        if (!value.rawContent) value.generateRawContent();

        return measurer.add(value.rawContent!.length);
    }
}

export class CBORBox extends Box {
    public static readonly typeCode = 'cbor';
    public static readonly schema = new CBORBoxSchema();

    private static readonly cborOptions: cbor.Options = {
        useRecords: false,
        tagUint8Array: false,
        // This is a workaround for the keys in our COSE header structures being strings, to make sure
        // they are being serialized as integers. A better way would be to use named identifiers and map
        // those to the corresponding integers.
        keyMap: {
            '1': 1,
            '33': 33,
        },
    };
    public static readonly decoder = new cbor.Decoder(this.cborOptions);
    public static readonly encoder = new cbor.Encoder(this.cborOptions);

    // see https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml for assigned tag numbers
    public tag?: number;
    public content: unknown;
    public rawContent: Uint8Array | undefined;

    constructor() {
        super(CBORBox.typeCode, CBORBox.schema);
    }

    public toString(prefix?: string): string {
        if (this.content === undefined) return (prefix ?? '') + 'CBOR content (empty)';

        try {
            const s = JSON.stringify(this.content, (key: string, value) => {
                if (value instanceof Uint8Array) {
                    // represent as JSON array, not as JSON object
                    return [...value];
                }
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return value;
            });
            return (prefix ?? '') + 'CBOR content ' + s;
        } catch {
            return (prefix ?? '') + 'CBOR content (unserializable)';
        }
    }

    public generateRawContent(): void {
        this.rawContent = CBORBox.encoder.encode(
            this.tag !== undefined ? new cbor.Tag(this.content, this.tag) : this.content,
        );
    }
}
