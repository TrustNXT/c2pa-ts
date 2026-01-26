import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

// helper class to move around the file and read values
class Parser {
    private pos: number;

    constructor(
        private readonly data: Uint8Array,
        private readonly little_endian: boolean,
    ) {
        this.pos = 0;
    }

    public readUInt8(): number {
        if (this.pos + 1 > this.data.length) throw new Error('Buffer underrun');
        return this.data[this.pos++];
    }

    public readUInt16(): number {
        if (this.pos + 2 > this.data.length) throw new Error('Buffer underrun');
        if (this.little_endian) {
            return this.data[this.pos++] + (this.data[this.pos++] << 8);
        } else {
            return (this.data[this.pos++] << 8) + this.data[this.pos++];
        }
    }

    public readUInt32(): number {
        if (this.pos + 4 > this.data.length) throw new Error('Buffer underrun');
        if (this.little_endian) {
            return (
                this.data[this.pos++] +
                (this.data[this.pos++] << 8) +
                (this.data[this.pos++] << 16) +
                (this.data[this.pos++] << 24)
            );
        } else {
            return (
                (this.data[this.pos++] << 24) +
                (this.data[this.pos++] << 16) +
                (this.data[this.pos++] << 8) +
                this.data[this.pos++]
            );
        }
    }

    public seekTo(offset: number) {
        if (offset > this.data.length) throw new Error('invalid offset');
        this.pos = offset;
    }

    public skip(length: number) {
        if (this.pos + length > this.data.length) throw new Error('Buffer underrun');
        this.pos += length;
    }
}

export class TIFF extends BaseAsset implements Asset {
    private jumbf: Uint8Array | undefined;

    constructor(data: Uint8Array) {
        super(data);
        if (!TIFF.canRead(data)) throw new Error('Not a TIFF file');
        this.readChunks();
    }

    public static canRead(buf: Uint8Array): boolean {
        if (buf.length < 4) return false;

        // first two bytes contain either "II" or "MM" and serve as
        // BOM (byte order mark) for endianness of the TIFF file
        const bom = buf[0] + (buf[1] << 8);

        // third and fourth bytes contain the value 42, in little or big
        // endian representation, depending on the BOM.
        let signature: number;
        switch (bom) {
            case 0x4949: // little endian
                signature = buf[2] + (buf[3] << 8);
                break;
            case 0x4d4d: // big endian
                signature = (buf[2] << 8) + buf[3];
                break;
            default:
                return false;
        }
        if (signature !== 0x002a) return false;

        return true;
    }

    public dumpInfo() {
        return ['TIFF file'].join('\n');
    }

    private readChunks() {
        // The first two bytes contain either "II" or "MM" and serve as
        // BOM (byte order mark) for the endianness of the TIFF file.
        const bom = this.data[0] + (this.data[1] << 8);
        if (bom !== 0x4949 && bom !== 0x4d4d) throw new Error('Invalid TIFF file');

        const parser = new Parser(this.data, bom == 0x4949);

        // skip BOM
        parser.skip(2);

        // verify magic number (42)
        const magic = parser.readUInt16();
        if (magic != 0x002a) throw new Error('Invalid TIFF file');

        // locate first IFD ("Image File Directory")
        const ifdPosition = parser.readUInt32();
        parser.seekTo(ifdPosition);

        const ifdCount = parser.readUInt16();
        if (ifdCount < 1) throw new Error('Invalid TIFF file');
        for (let i = 0; i < ifdCount; i++) {
            const tag = parser.readUInt16();
            const type = parser.readUInt16();
            const count = parser.readUInt32();
            const value_offset = parser.readUInt32();

            let size: number;
            switch (type) {
                case 1: // BYTE
                case 2: // ASCII
                case 6: // SIGNED BYTE
                case 17: // SIGNED SHORT
                    size = 1;
                    break;
                case 3: // SHORT
                case 16: // UNSIGNED SHORT
                    size = 2;
                    break;
                case 4: // LONG
                case 5: // UNSIGNED LONG
                case 11: // FLOAT
                case 12: // DOUBLE
                    size = 4;
                    break;
                case 7: // UNDEFINED
                case 10: // DOUBLE
                    size = 8;
                    break;
                default:
                    throw new Error(`Unknown TIFF type ${type}`);
            }

            // The C2PA Manifest Store is embedded into the TIFF as a tag
            // with ID 52545 (0xcd41) and type UNDEFINED (7).
            const manifestStoreTag = 0xcd41;
            const manifestStoreType = 7;
            if (type === manifestStoreType && tag === manifestStoreTag) {
                const jumbf = this.data.slice(value_offset, value_offset + count * size);

                // Extract and validate the length stored in the JUMBF
                // (JPEG Universal Media Fragment) itself. Note that it
                // always uses big endian notation, regardless of the
                // TIFF's endianess.
                const jumbfParser = new Parser(jumbf, false);
                if (jumbfParser.readUInt32() != count)
                    throw new Error('Mismatch between TIFF IDF length and JUMBF length');

                this.jumbf = jumbf;
            }
        }
    }

    public getManifestJUMBF(): Uint8Array | undefined {
        return this.jumbf;
    }
}
