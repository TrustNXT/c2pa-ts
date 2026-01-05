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
        await asset.parse();
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

    private async parse(): Promise<void> {
        const data = await this.reader.getDataRange();
        this.readChunksFromBuffer(data);
    }

    public dumpInfo() {
        return [
            'PNG file:',
            ...this.chunks.map(c => `Chunk of type ${c.type} (payload length: ${c.payloadLength})`),
        ].join('\n');
    }

    private readChunksFromBuffer(data: Uint8Array) {
        let pos = PNG.pngSignature.length;
        const manifestChunkIndices: number[] = [];

        // Read until we found an IEND chunk
        while (!this.chunks.length || this.chunks[this.chunks.length - 1].type !== 'IEND') {
            // We need at least 4 bytes length + 4 bytes chunk type + 4 bytes CRC
            if (pos + 12 > data.length) {
                throw new Error('Malformed PNG (buffer underrun before end marker)');
            }

            const dataLength = BinaryHelper.readUInt32(data, pos);
            const chunkLength = dataLength + 12;
            if (pos + chunkLength > data.length) {
                throw new Error('Malformed PNG (chunk length too large)');
            }

            const chunkType = BinaryHelper.readString(data, pos + 4, 4);
            const crc = BinaryHelper.readUInt32(data, pos + 8 + dataLength);

            this.chunks.push(new Chunk(pos, chunkLength, chunkType, crc));
            if (chunkType === 'caBX') manifestChunkIndices.push(this.chunks.length - 1);
            pos += chunkLength;
        }

        this.manifestChunkIndex = manifestChunkIndices.length === 1 ? manifestChunkIndices[0] : undefined;
    }

    /**
     * Extracts the manifest store in raw JUMBF format from caBX type chunks.
     */
    public async getManifestJUMBF(): Promise<Uint8Array | undefined> {
        if (this.manifestChunkIndex === undefined) return undefined;
        const chunk = this.chunks[this.manifestChunkIndex];
        return this.getDataRange(chunk.payloadOffset, chunk.payloadLength);
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

        const parts: AssemblePart[] = [{ position: 0, data: PNG.pngSignature }];

        // Go through all chunks, update their positions, and gather payload for the new PNG
        let targetPosition = PNG.pngSignature.length;
        for (let i = 0; i < this.chunks.length; i++) {
            const chunk = this.chunks[i];
            const chunkOffset = chunk.offset;

            if (i === this.manifestChunkIndex) {
                chunk.length = length + 12;
                const header = new Uint8Array(8);
                const dv = new DataView(header.buffer);
                dv.setUint32(0, chunk.payloadLength);
                chunk.type.split('').forEach((c, j) => dv.setUint8(4 + j, c.codePointAt(0)!));
                chunk.offset = targetPosition;
                parts.push({ position: targetPosition, data: header, length: chunk.length });
            } else {
                chunk.offset = targetPosition;
                parts.push(this.sourceRef(targetPosition, chunkOffset, chunk.length));
            }
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

        const chunk = this.chunks[this.manifestChunkIndex];

        // Calculate CRC over type + data
        const crcInput = new Uint8Array(4 + jumbf.length);
        chunk.type.split('').forEach((c, i) => (crcInput[i] = c.codePointAt(0)!));
        crcInput.set(jumbf, 4);
        const crc = crc32.buf(crcInput) >>> 0;

        // Build chunk payload + CRC
        const chunkData = new Uint8Array(jumbf.length + 4);
        chunkData.set(jumbf, 0);
        new DataView(chunkData.buffer).setUint32(jumbf.length, crc);

        this.replaceRange(chunk.payloadOffset, chunkData);
    }
}
