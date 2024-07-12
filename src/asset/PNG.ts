import { default as crc32 } from 'crc-32';
import { BinaryHelper } from '../util/BinaryHelper';
import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

class Chunk {
    public readonly payloadOffset: number;
    public readonly payloadLength: number;

    constructor(
        public readonly offset: number,
        public readonly length: number,
        public readonly type: string,
        public readonly crc: number,
    ) {
        this.payloadOffset = offset + 8;
        this.payloadLength = length - 12;
    }

    public getSubBuffer(buf: Uint8Array) {
        return buf.subarray(this.payloadOffset, this.payloadOffset + this.payloadLength);
    }

    public checkCRC(buf: Uint8Array) {
        const calculated = crc32.buf(buf.subarray(this.offset + 4, this.offset + this.length - 4)) >>> 0;
        return calculated === this.crc;
    }
}

export class PNG extends BaseAsset implements Asset {
    private static pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    private chunks: Chunk[] = [];

    constructor(data: Uint8Array) {
        super(data);
        if (!PNG.canRead(data)) throw new Error('Not a PNG file');
        this.readChunks();
    }

    public static canRead(buf: Uint8Array): boolean {
        return (
            buf.length >= this.pngSignature.length &&
            BinaryHelper.bufEqual(buf.subarray(0, this.pngSignature.length), this.pngSignature)
        );
    }

    public dumpInfo() {
        return [
            'PNG file:',
            ...this.chunks.map(c => `Chunk of type ${c.type} (payload length: ${c.payloadLength})`),
        ].join('\n');
    }

    private readChunks() {
        let pos = PNG.pngSignature.length;

        // Read until we found an IEND chunk
        while (!this.chunks.length || this.chunks[this.chunks.length - 1].type !== 'IEND') {
            // We need at least 4 bytes length + 4 bytes chunk type + 4 bytes CRC
            if (pos + 12 > this.data.length) {
                throw new Error('Malformed PNG (buffer underrun before end marker)');
            }

            const dataLength = BinaryHelper.readUInt32(this.data, pos);
            const chunkLength = dataLength + 12;
            if (pos + chunkLength > this.data.length) {
                throw new Error('Malformed PNG (chunk length too large)');
            }

            const chunkType = BinaryHelper.readString(this.data, pos + 4, 4);
            const crc = BinaryHelper.readUInt32(this.data, pos + 8 + dataLength);

            this.chunks.push(new Chunk(pos, chunkLength, chunkType, crc));

            pos += chunkLength;
        }
    }

    /**
     * Extracts the manifest store in raw JUMBF format from caBX type chunks.
     */
    public getManifestJUMBF(): Uint8Array | undefined {
        return this.chunks.find(c => c.type === 'caBX')?.getSubBuffer(this.data);
    }
}
