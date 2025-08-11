import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

class Parser {
    private pos: number;

    constructor(private readonly data: Uint8Array) {
        this.pos = 0;
    }

    public readUInt8(): number {
        if (this.pos + 1 > this.data.length) throw new Error('Buffer underrun');
        return this.data[this.pos++];
    }

    public readUInt16(): number {
        if (this.pos + 2 > this.data.length) throw new Error('Buffer underrun');
        return this.data[this.pos++] + (this.data[this.pos++] << 8);
    }

    public skip(length: number) {
        if (this.pos + length > this.data.length) throw new Error('Buffer underrun');
        this.pos += length;
    }
}

export class GIF extends BaseAsset implements Asset {
    constructor(data: Uint8Array) {
        super(data);
        if (!GIF.canRead(data)) throw new Error('Not a GIF file');
        this.readChunks();
    }

    public static canRead(buf: Uint8Array): boolean {
        return (
            buf.length > 6 &&
            buf[0] === 0x47 && // G
            buf[1] === 0x49 && // I
            buf[2] === 0x46 && // F
            buf[3] === 0x38 && // 8
            (buf[4] === 0x39 || buf[4] === 0x37) && // 9 or 7
            buf[5] === 0x61 // a
        );
    }

    public dumpInfo() {
        return ['GIF file'].join('\n');
    }

    private readChunks() {
        const parser = new Parser(this.data);

        // skip over the GIF87a or GIF89a signature header
        parser.skip(6);

        // read the "Logical Screen Descriptor"
        const logicalScreenWidth = parser.readUInt16();
        const logicalScreenHeight = parser.readUInt16();
        const packedFields = parser.readUInt8();
        const backgroundColorIndex = parser.readUInt8();
        const pixelAspectRatio = parser.readUInt8();

        // unpack the packed fields
        const globalColorTableFlag = packedFields & 0x80;
        const colorResolution = (packedFields & 0x70) >> 4;
        const sortFlag = packedFields & 0x08;
        const globalColorTableSize = 1 << ((packedFields & 0x07) + 1);

        // skip over the "Global Color Table" if it is present
        if (globalColorTableFlag) {
            parser.skip(3 * globalColorTableSize);

            if (backgroundColorIndex >= globalColorTableSize)
                throw new Error('Malformed GIF (invalid background color index)');
        }

        // iterate over blocks:
        // Every block starts with an exclamation mark ("!") or comma (",").
        // The end of the image is marked with a semicolon (";").
        for (;;) {
            const blockType = parser.readUInt8();
            switch (blockType) {
                case 0x21: // Extension block ("!")
                    {
                        const extensionBlockType = parser.readUInt8();
                        if (extensionBlockType !== 0xf9)
                            throw new Error('Malformed GIF (invalid extension block type)');
                        const extensionBlockDataLength = parser.readUInt8();
                        parser.skip(extensionBlockDataLength);
                        if (parser.readUInt8() !== 0) throw new Error('Malformed GIF (invalid block terminator)');
                    }
                    break;
                case 0x2c: // Image Descriptor (",")
                    {
                        // skipping size and position
                        parser.skip(8);

                        // decode packed fields
                        const packedImageDescriptorFields = parser.readUInt8();

                        const localColorTableFlag = packedImageDescriptorFields & 0x80;
                        const interlaceFlag = packedImageDescriptorFields & 0x40;
                        const sortFlag = packedImageDescriptorFields & 0x20;
                        const localColorTableSize = 1 << ((packedImageDescriptorFields & 0x07) + 1);

                        // skip over the "Local Color Table" if it is present
                        if (localColorTableFlag) {
                            parser.skip(3 * localColorTableSize);
                        }

                        const lzwCodeSize = parser.readUInt8();

                        // decode the image data blocks
                        for (;;) {
                            const blockSize = parser.readUInt8();
                            if (blockSize === 0) break; // terminator
                            parser.skip(blockSize);
                        }
                    }
                    break;
                case 0x3b: // Trailer (";")
                    return;
                default:
                    throw new Error('Malformed GIF (invalid block type)');
            }
        }
    }

    public getManifestJUMBF(): Uint8Array | undefined {
        return undefined;
    }
}
