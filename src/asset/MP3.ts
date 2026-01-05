import { BinaryHelper } from '../util/BinaryHelper';
import { BaseAsset } from './BaseAsset';
import { AssemblePart } from './reader/AssetDataReader';
import { createReader } from './reader/createReader';
import { Asset, AssetSource } from './types';

const C2PA_MIME = 'application/x-c2pa-manifest-store';

class Frame {
    constructor(
        public id: string,
        public size: number,
        public offset: number, // offset of frame start in the file
    ) {}

    get dataOffset() {
        return this.offset + 10;
    }

    getFrameData(buffer: Uint8Array) {
        return buffer.subarray(this.dataOffset, this.dataOffset + this.size);
    }
}

export class MP3 extends BaseAsset implements Asset {
    public readonly mimeType = 'audio/mpeg';

    private static readonly id3Signature = new Uint8Array([0x49, 0x44, 0x33]); // "ID3"
    private static readonly frameSyncSignature = new Uint8Array([0xff, 0xfb]);
    private static readonly textEncoder = new TextEncoder();

    private tagHeader?: {
        version: number;
        size: number; // size of tag data, excluding header
    };

    private frames: Frame[] = [];
    private manifestFrameIndex?: number;
    private hasUnsupportedTag = false;

    private constructor(source: AssetSource) {
        super(source);
    }

    public static async create(source: AssetSource): Promise<MP3> {
        const asset = new MP3(source);
        const header = await asset.reader.getDataRange(0, MP3.id3Signature.length);
        if (!MP3.hasSignature(header)) throw new Error('Not a valid MP3 file');
        await asset.parse();
        return asset;
    }

    public static async canRead(source: AssetSource): Promise<boolean> {
        const reader = createReader(source);
        const header = await reader.getDataRange(0, MP3.id3Signature.length);
        return MP3.hasSignature(header);
    }

    private static hasSignature(buf: Uint8Array): boolean {
        if (buf.length < 3) {
            return false;
        }
        // Check for ID3 tag
        if (BinaryHelper.bufEqual(buf.subarray(0, MP3.id3Signature.length), MP3.id3Signature)) {
            return true;
        }
        // Check for MP3 frame sync
        if (
            buf.length >= MP3.frameSyncSignature.length &&
            BinaryHelper.bufEqual(buf.subarray(0, MP3.frameSyncSignature.length), MP3.frameSyncSignature)
        ) {
            return true;
        }
        return false;
    }

    private async parse(): Promise<void> {
        const data = await this.reader.getDataRange();
        this.parseFromBuffer(data);
    }

    private parseFromBuffer(data: Uint8Array) {
        this.frames = [];
        this.manifestFrameIndex = undefined;
        this.tagHeader = undefined;
        this.hasUnsupportedTag = false;

        const versionMajor = data[3];
        if (versionMajor < 2 || versionMajor > 4) {
            // Unsupported version, we can't safely parse or modify this tag.
            this.hasUnsupportedTag = true;
            return;
        }

        const size = BinaryHelper.readSynchsafe(data, 6);
        this.tagHeader = { version: versionMajor, size };

        let offset = 10;
        const end = 10 + size;

        while (offset < end && offset + 10 <= data.length) {
            const frameId = BinaryHelper.readString(data, offset, 4);
            if (frameId.codePointAt(0) === 0) {
                break; // Padding
            }

            let frameSize: number;
            if (versionMajor >= 4) {
                frameSize = BinaryHelper.readSynchsafe(data, offset + 4);
            } else {
                frameSize = BinaryHelper.readUInt32(data, offset + 4);
            }

            if (offset + 10 + frameSize > end) {
                break; // Malformed frame size
            }

            const frame = new Frame(frameId, frameSize, offset);
            this.frames.push(frame);

            if (frameId === 'GEOB') {
                this.checkManifestFrame(this.frames.length - 1, data);
            }
            offset += 10 + frameSize;
        }
    }

    private checkManifestFrame(index: number, data: Uint8Array) {
        const frame = this.frames[index];
        const offset = frame.dataOffset + 1; // skip encoding byte

        const mime = BinaryHelper.readNullTerminatedString(data, offset);
        if (mime.string === C2PA_MIME) {
            if (this.manifestFrameIndex !== undefined) {
                // Multiple manifests not allowed, invalidate by unsetting index
                this.manifestFrameIndex = undefined;
                throw new Error('Multiple C2PA manifests found in MP3 file');
            }
            this.manifestFrameIndex = index;
        }
    }

    public async getManifestJUMBF(): Promise<Uint8Array | undefined> {
        if (this.manifestFrameIndex === undefined) return undefined;
        const frame = this.frames[this.manifestFrameIndex];
        const frameData = await this.getDataRange(frame.dataOffset, frame.size);

        let offset = 1; // skip encoding
        const mime = BinaryHelper.readNullTerminatedString(frameData, offset);
        offset += mime.bytesRead;
        const filename = BinaryHelper.readNullTerminatedString(frameData, offset);
        offset += filename.bytesRead;
        const description = BinaryHelper.readNullTerminatedString(frameData, offset);
        offset += description.bytesRead;

        return frameData.subarray(offset);
    }

    public getHashExclusionRange(): { start: number; length: number } {
        if (!this.tagHeader) {
            return { start: 0, length: 0 };
        }
        return { start: 0, length: 10 + this.tagHeader.size };
    }

    public async ensureManifestSpace(length: number): Promise<void> {
        const currentManifest = await this.getManifestJUMBF();
        if (currentManifest?.length === length) return;

        if (this.hasUnsupportedTag) {
            throw new Error('Cannot add a manifest to an MP3 with an unsupported ID3 tag version.');
        }

        const otherFrames = this.frames.filter((_, i) => i !== this.manifestFrameIndex);

        const newFramesConfig: { id: string; size: number; isC2pa: boolean; originalFrame: Frame | undefined }[] =
            otherFrames.map(f => ({ id: f.id, size: f.size, isC2pa: false, originalFrame: f }));

        let c2paGeobHeader: Uint8Array | undefined;
        if (length > 0) {
            c2paGeobHeader = this.createC2paGeobHeader();
            newFramesConfig.unshift({
                id: 'GEOB',
                size: c2paGeobHeader.length + length,
                isC2pa: true,
                originalFrame: undefined,
            });
        }

        const newTagSize = newFramesConfig.reduce((sum, f) => sum + 10 + f.size, 0);
        const parts: AssemblePart[] = [];

        // ID3 header
        const newTagHeader = new Uint8Array(10);
        const newTagHeaderView = new DataView(newTagHeader.buffer);
        newTagHeader.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]); // ID3 v2.4.0
        BinaryHelper.writeSynchsafe(newTagHeaderView, 6, newTagSize);
        parts.push({ position: 0, data: newTagHeader });

        let currentPosition = 10;
        for (const frameInfo of newFramesConfig) {
            const frameHeader = new Uint8Array(10);
            const idBytes = MP3.textEncoder.encode(frameInfo.id);
            frameHeader.set(idBytes.subarray(0, 4));
            const frameHeaderView = new DataView(frameHeader.buffer);
            BinaryHelper.writeSynchsafe(frameHeaderView, 4, frameInfo.size);
            // Flags = 0
            parts.push({ position: currentPosition, data: frameHeader });
            currentPosition += 10;

            if (frameInfo.isC2pa) {
                parts.push({ position: currentPosition, data: c2paGeobHeader, length: frameInfo.size });
            } else {
                const origFrame = frameInfo.originalFrame!;
                parts.push(this.sourceRef(currentPosition, origFrame.dataOffset, origFrame.size));
            }
            currentPosition += frameInfo.size;
        }

        // Audio data
        const audioDataOffset = this.tagHeader ? 10 + this.tagHeader.size : 0;
        const audioLength = this.getDataLength() - audioDataOffset;
        parts.push(this.sourceRef(currentPosition, audioDataOffset, audioLength));

        this.assembleAsset(parts);

        // Re-parse after assembly
        const newData = await this.reader.getDataRange();
        this.parseFromBuffer(newData);
    }

    private createC2paGeobHeader(): Uint8Array {
        const mimeBytes = MP3.textEncoder.encode(C2PA_MIME);
        const filenameBytes = MP3.textEncoder.encode('c2pa');
        const descriptionBytes = MP3.textEncoder.encode('c2pa manifest store');

        const buffer = new Uint8Array(
            1 + mimeBytes.length + 1 + filenameBytes.length + 1 + descriptionBytes.length + 1,
        );
        let offset = 0;
        buffer[offset++] = 0x00; // Encoding: ISO-8559-1 – we actually encode as UTF-8 but solely constants containing ASCII letters only

        buffer.set(mimeBytes, offset);
        offset += mimeBytes.length;
        buffer[offset++] = 0x00;

        buffer.set(filenameBytes, offset);
        offset += filenameBytes.length;
        buffer[offset++] = 0x00;

        buffer.set(descriptionBytes, offset);

        return buffer;
    }

    public async writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        if (this.manifestFrameIndex === undefined) {
            if (jumbf.length === 0) return;
            throw new Error('No manifest storage reserved');
        }
        const currentManifest = await this.getManifestJUMBF();
        if (currentManifest?.length !== jumbf.length) {
            throw new Error('Wrong amount of space in asset');
        }

        const frame = this.frames[this.manifestFrameIndex];
        const frameData = await this.getDataRange(frame.dataOffset, frame.size);

        let offset = 1; // skip encoding
        const mime = BinaryHelper.readNullTerminatedString(frameData, offset);
        offset += mime.bytesRead;
        const filename = BinaryHelper.readNullTerminatedString(frameData, offset);
        offset += filename.bytesRead;
        const description = BinaryHelper.readNullTerminatedString(frameData, offset);
        offset += description.bytesRead;

        this.replaceRange(frame.dataOffset + offset, jumbf);
    }

    public dumpInfo(): string {
        const lines = ['MP3 file:'];
        if (this.tagHeader) {
            lines.push(`  ID3v2.${this.tagHeader.version} tag, size: ${this.tagHeader.size}`);
        }
        for (const frame of this.frames) {
            lines.push(`  Frame ${frame.id}, size: ${frame.size}`);
        }
        return lines.join('\n');
    }
}
