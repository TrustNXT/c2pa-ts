import { default as crc32 } from 'crc-32';
import { BinaryHelper } from '../util/BinaryHelper';
import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

class Chunk {
    public get payloadOffset() {
        return this.offset + 8;
    }
    public get payloadLength() {
        return this.length - 12;
    }

    constructor(
        public offset: number,
        public length: number,
        public readonly type: string,
        public crc: number,
    ) {}

    public getSubBuffer(buf: Uint8Array) {
        return buf.subarray(this.payloadOffset, this.payloadOffset + this.payloadLength);
    }

    public checkCRC(buf: Uint8Array) {
        return this.crc === this.generateCRC(buf);
    }

    public updateCRC(buf: Uint8Array) {
        this.crc = this.generateCRC(buf);
    }

    private generateCRC(buf: Uint8Array) {
        return crc32.buf(buf.subarray(this.offset + 4, this.offset + this.length - 4)) >>> 0;
    }
}

export class PNG extends BaseAsset implements Asset {
    private static pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    private chunks: Chunk[] = [];
    private manifestChunkIndex: number | undefined;

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

        const manifestChunkIndices: number[] = [];

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

            if (chunkType === 'caBX') manifestChunkIndices.push(this.chunks.length - 1);

            pos += chunkLength;
        }

        this.manifestChunkIndex = manifestChunkIndices.length === 1 ? manifestChunkIndices[0] : undefined;
    }

    /**
     * Extracts the manifest store in raw JUMBF format from caBX type chunks.
     */
    public getManifestJUMBF(): Uint8Array | undefined {
        if (this.manifestChunkIndex === undefined) return undefined;
        return this.chunks[this.manifestChunkIndex].getSubBuffer(this.data);
    }

    public async ensureManifestSpace(length: number): Promise<void> {
        let shiftAmount = 0; // The number of bytes that everything after the manifest chunk will need to be moved forward
        let manifestChunk: Chunk;

        if (this.manifestChunkIndex !== undefined) {
            // There is already a manifest chunk: Make sure it is large enough and shift remaining chunks by the
            // number of bytes the chunk needs to be enlarged (if any)
            manifestChunk = this.chunks[this.manifestChunkIndex];
            shiftAmount = Math.max(length - manifestChunk.payloadLength, 0);
            manifestChunk.length += shiftAmount;
        } else {
            // Insert the manifest chunk just before the first IDAT chunk
            this.manifestChunkIndex = this.chunks.findIndex(c => c.type === 'IDAT');
            if (this.manifestChunkIndex === -1) {
                // There is no IDAT – probably not a valid PNG anyway but let's just put the manifest at the end
                this.manifestChunkIndex = this.chunks.length;
            }

            // Find the byte position for the new chunk
            let offset = 0;
            if (this.manifestChunkIndex > 0) {
                const previousChunk = this.chunks[this.manifestChunkIndex - 1];
                offset = previousChunk.offset + previousChunk.length;
            }

            // Create a manifest chunk and shift remaining chunks by the full length of the new chunk
            manifestChunk = new Chunk(offset, length + 12, 'caBX', 0);
            shiftAmount = manifestChunk.length;
            this.chunks.splice(this.manifestChunkIndex, 0, manifestChunk);
        }

        // If nothing needs to be moved there's no need to write anything to the file
        if (shiftAmount === 0) return;

        // Create a new buffer and fill it with everything before the manifest chunk
        const newData = new Uint8Array(this.data.length + shiftAmount);
        newData.set(this.data.subarray(0, this.chunks[this.manifestChunkIndex].offset));

        // Fill in manifest chunk header
        const dataView = new DataView(newData.buffer);
        dataView.setUint32(manifestChunk.offset, manifestChunk.payloadLength);
        manifestChunk.type
            .split('')
            .forEach((c, i) => dataView.setUint8(manifestChunk.offset + 4 + i, c.charCodeAt(0)));
        // Manifest chunk content and CRC are left blank here – will be patched in later

        // Copy over remaining chunks at new position
        for (let i = this.manifestChunkIndex + 1; i < this.chunks.length; i++) {
            const newOffset = this.chunks[i].offset + shiftAmount;
            newData.set(
                this.data.subarray(this.chunks[i].offset, this.chunks[i].offset + this.chunks[i].length),
                newOffset,
            );
            this.chunks[i].offset = newOffset;
        }

        this.data = newData;
    }

    public async writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        if (
            this.manifestChunkIndex === undefined ||
            this.chunks[this.manifestChunkIndex].payloadLength < jumbf.length
        ) {
            throw new Error('Not enough space in asset file');
        }

        const manifestChunk = this.chunks[this.manifestChunkIndex];
        const dataBuffer = manifestChunk.getSubBuffer(this.data);
        dataBuffer.set(jumbf);

        // If the chunk is larger than the manifest, zero out the remainder
        if (manifestChunk.payloadLength > jumbf.length) {
            dataBuffer.fill(0, jumbf.length);
        }

        // Update CRC
        manifestChunk.updateCRC(this.data);
        new DataView(this.data.buffer, manifestChunk.offset).setUint32(manifestChunk.length - 4, manifestChunk.crc);
    }
}
