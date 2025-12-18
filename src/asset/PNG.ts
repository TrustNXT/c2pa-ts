import { default as crc32 } from 'crc-32';
import { BinaryHelper } from '../util/BinaryHelper';
import { BaseAsset } from './BaseAsset';
import { AssemblePart } from './reader/AssetDataReader';
import { createReader } from './reader/createReader';
import { Asset, AssetSource } from './types';

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
    public readonly mimeType = 'image/png';

    private static readonly pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    private readonly chunks: Chunk[] = [];
    private manifestChunkIndex: number | undefined;

    private constructor(source: AssetSource) {
        super(source);
    }

    public static async create(source: AssetSource): Promise<PNG> {
        const asset = new PNG(source);
        const header = await asset.reader.getDataRange(0, PNG.pngSignature.length);
        if (!PNG.hasSignature(header)) throw new Error('Not a PNG file');
        await asset.reader.load();
        asset.parse();
        return asset;
    }

    public static async canRead(source: AssetSource): Promise<boolean> {
        const reader = createReader(source);
        const header = await reader.getDataRange(0, PNG.pngSignature.length);
        return PNG.hasSignature(header);
    }

    private static hasSignature(buf: Uint8Array): boolean {
        return (
            buf.length >= PNG.pngSignature.length &&
            BinaryHelper.bufEqual(buf.subarray(0, PNG.pngSignature.length), PNG.pngSignature)
        );
    }

    private parse(): void {
        this.readChunks();
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
        // Nothing to do?
        if (this.manifestChunkIndex !== undefined && this.chunks[this.manifestChunkIndex].payloadLength === length)
            return;

        // Ensure there is a manifest chunk in the list of chunks
        if (this.manifestChunkIndex === undefined) {
            // Insert the manifest chunk just before the first IDAT chunk
            this.manifestChunkIndex = this.chunks.findIndex(c => c.type === 'IDAT');
            if (this.manifestChunkIndex === -1) {
                // There is no IDAT – probably not a valid PNG anyway but let's just put the manifest at the end
                this.manifestChunkIndex = this.chunks.length;
            }
            // Insert manifest chunk stub into chunks array
            this.chunks.splice(this.manifestChunkIndex, 0, new Chunk(0, 0, 'caBX', 0));
        }

        const parts: AssemblePart[] = [
            {
                position: 0,
                data: PNG.pngSignature,
            },
        ];

        // Go through all chunks, update their positions, and gather payload for the new PNG
        let targetPosition = PNG.pngSignature.length;
        for (let i = 0; i < this.chunks.length; i++) {
            const chunk = this.chunks[i];
            let data: Uint8Array;

            if (i === this.manifestChunkIndex) {
                chunk.length = length + 12;
                data = new Uint8Array(8);
                // Write manifest chunk header
                const dataView = new DataView(data.buffer);
                dataView.setUint32(0, chunk.payloadLength);
                chunk.type.split('').forEach((c, i) => dataView.setUint8(4 + i, c.charCodeAt(0)));
                // Chunk content and CRC are left blank here – will be patched in later
            } else {
                data = this.data.subarray(chunk.offset, chunk.offset + chunk.length);
            }

            chunk.offset = targetPosition;
            parts.push({ position: targetPosition, data, length: chunk.length });
            targetPosition += chunk.length;
        }

        this.assembleAsset(parts);
    }

    public getHashExclusionRange(): { start: number; length: number } {
        if (this.manifestChunkIndex === undefined) throw new Error('No manifest storage reserved');

        const chunk = this.chunks[this.manifestChunkIndex];

        return { start: chunk.offset, length: chunk.length };
    }

    public async writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        if (
            this.manifestChunkIndex === undefined ||
            this.chunks[this.manifestChunkIndex].payloadLength !== jumbf.length
        ) {
            throw new Error('Wrong amount of space in asset');
        }

        const manifestChunk = this.chunks[this.manifestChunkIndex];
        const dataBuffer = manifestChunk.getSubBuffer(this.data);
        dataBuffer.set(jumbf);

        // Update CRC
        manifestChunk.updateCRC(this.data);
        new DataView(this.data.buffer, manifestChunk.offset).setUint32(manifestChunk.length - 4, manifestChunk.crc);
    }
}
