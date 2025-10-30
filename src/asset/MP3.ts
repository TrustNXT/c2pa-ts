import { BinaryHelper } from '../util/BinaryHelper';
import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

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

    private tagHeader?: {
        version: number;
        size: number; // size of tag data, excluding header
    };

    private frames: Frame[] = [];
    private manifestFrameIndex?: number;
    private hasUnsupportedTag = false;

    constructor(data: Uint8Array) {
        super(data);
        if (!MP3.canRead(data)) {
            throw new Error('Not a valid MP3 file');
        }
        this.parse();
    }

    public static canRead(buf: Uint8Array): boolean {
        if (buf.length < 3) {
            return false;
        }
        // Check for ID3 tag
        if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
            return true;
        }
        // Check for MP3 frame sync
        if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
            return true;
        }
        return false;
    }

    private parse() {
        this.frames = [];
        this.manifestFrameIndex = undefined;
        this.tagHeader = undefined;
        this.hasUnsupportedTag = false;

        // Check for ID3 tag
        if (this.data.length < 10 || this.data[0] !== 0x49 || this.data[1] !== 0x44 || this.data[2] !== 0x33) {
            return;
        }

        const versionMajor = this.data[3];
        if (versionMajor < 2 || versionMajor > 4) {
            // Unsupported version, we can't safely parse or modify this tag.
            this.hasUnsupportedTag = true;
            return;
        }

        const size = BinaryHelper.readSynchsafe(this.data, 6);
        this.tagHeader = { version: versionMajor, size };

        let offset = 10;
        const end = 10 + size;

        while (offset < end && offset + 10 <= this.data.length) {
            const frameId = BinaryHelper.readString(this.data, offset, 4);
            if (frameId.codePointAt(0) === 0) {
                break; // Padding
            }

            let frameSize: number;
            if (versionMajor >= 4) {
                frameSize = BinaryHelper.readSynchsafe(this.data, offset + 4);
            } else {
                frameSize = BinaryHelper.readUInt32(this.data, offset + 4);
            }

            if (offset + 10 + frameSize > end) {
                break; // Malformed frame size
            }

            const frame = new Frame(frameId, frameSize, offset);
            this.frames.push(frame);

            if (frameId === 'GEOB') {
                this.checkManifestFrame(this.frames.length - 1);
            }

            offset += 10 + frameSize;
        }
    }

    private checkManifestFrame(index: number) {
        const frame = this.frames[index];
        let offset = frame.dataOffset;

        // encoding byte
        offset += 1;

        const mime = BinaryHelper.readNullTerminatedString(this.data, offset);
        if (mime.string === C2PA_MIME) {
            if (this.manifestFrameIndex !== undefined) {
                // Multiple manifests not allowed, invalidate by unsetting index
                this.manifestFrameIndex = undefined;
                throw new Error('Multiple C2PA manifests found in MP3 file');
            }
            this.manifestFrameIndex = index;
        }
    }

    private getManifestFramePayload(): Uint8Array | undefined {
        if (this.manifestFrameIndex === undefined) return undefined;

        const frame = this.frames[this.manifestFrameIndex];
        let offset = frame.dataOffset;

        // encoding
        offset += 1;

        // mime type
        const mime = BinaryHelper.readNullTerminatedString(this.data, offset);
        offset += mime.bytesRead;

        // filename
        const filename = BinaryHelper.readNullTerminatedString(this.data, offset);
        offset += filename.bytesRead;

        // description
        const description = BinaryHelper.readNullTerminatedString(this.data, offset);
        offset += description.bytesRead;

        return this.data.subarray(offset, frame.dataOffset + frame.size);
    }

    public getManifestJUMBF(): Uint8Array | undefined {
        return this.getManifestFramePayload();
    }

    public getHashExclusionRange(): { start: number; length: number } {
        if (!this.tagHeader) {
            return { start: 0, length: 0 };
        }
        return { start: 0, length: 10 + this.tagHeader.size };
    }

    public async ensureManifestSpace(length: number): Promise<void> {
        if (this.getManifestJUMBF()?.length === length) {
            return;
        }

        if (this.hasUnsupportedTag) {
            throw new Error('Cannot add a manifest to an MP3 with an unsupported ID3 tag version.');
        }

        const otherFrames = this.frames.filter((_, i) => i !== this.manifestFrameIndex);

        const newFramesConfig: {
            id: string;
            size: number;
            isC2pa: boolean;
            originalFrame: Frame | undefined;
        }[] = otherFrames.map(f => ({ id: f.id, size: f.size, isC2pa: false, originalFrame: f }));

        let c2paGeobHeader: Uint8Array | undefined;
        if (length > 0) {
            c2paGeobHeader = this.createC2paGeobHeader();
            const newC2paFrameSize = c2paGeobHeader.length + length;
            newFramesConfig.unshift({ id: 'GEOB', size: newC2paFrameSize, isC2pa: true, originalFrame: undefined });
        }

        const newTagSize = newFramesConfig.reduce((sum, f) => sum + 10 + f.size, 0);

        const parts: { position: number; data?: Uint8Array; length?: number }[] = [];

        // Part 1: New ID3 tag header
        const newTagHeader = new Uint8Array(10);
        const newTagHeaderView = new DataView(newTagHeader.buffer);
        newTagHeader.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]); // ID3 v2.4.0
        BinaryHelper.writeSynchsafe(newTagHeaderView, 6, newTagSize);
        parts.push({ position: 0, data: newTagHeader });

        let currentPosition = 10;

        // Part 2: All frames
        for (const frameInfo of newFramesConfig) {
            const frameHeader = new Uint8Array(10);
            const textEncoder = new TextEncoder();
            const idBytes = textEncoder.encode(frameInfo.id);
            frameHeader.set(idBytes.subarray(0, 4));
            const frameHeaderView = new DataView(frameHeader.buffer);
            BinaryHelper.writeSynchsafe(frameHeaderView, 4, frameInfo.size);
            // Flags = 0
            parts.push({ position: currentPosition, data: frameHeader });
            currentPosition += 10;

            if (frameInfo.isC2pa) {
                parts.push({ position: currentPosition, data: c2paGeobHeader, length: frameInfo.size });
                currentPosition += frameInfo.size;
            } else {
                const originalFrame = frameInfo.originalFrame!;
                parts.push({
                    position: currentPosition,
                    data: originalFrame.getFrameData(this.data),
                });
                currentPosition += frameInfo.size;
            }
        }

        // Part 3: Audio data
        const audioDataOffset = this.tagHeader ? 10 + this.tagHeader.size : 0;
        parts.push({
            position: 10 + newTagSize,
            data: this.data.subarray(audioDataOffset),
        });

        this.data = this.assembleBuffer(parts);
        this.parse();
    }

    private createC2paGeobHeader(): Uint8Array {
        const textEncoder = new TextEncoder();
        const mimeBytes = textEncoder.encode(C2PA_MIME);
        const filenameBytes = textEncoder.encode('c2pa');
        const descriptionBytes = textEncoder.encode('c2pa manifest store');

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
            if (jumbf.length === 0) {
                return;
            }
            throw new Error('No manifest storage reserved');
        }
        if (this.getManifestJUMBF()?.length !== jumbf.length) {
            throw new Error('Wrong amount of space in asset');
        }

        const frame = this.frames[this.manifestFrameIndex];
        let offset = frame.dataOffset;

        // encoding
        offset += 1;
        // mime type
        const mime = BinaryHelper.readNullTerminatedString(this.data, offset);
        offset += mime.bytesRead;
        // filename
        const filename = BinaryHelper.readNullTerminatedString(this.data, offset);
        offset += filename.bytesRead;
        // description
        const description = BinaryHelper.readNullTerminatedString(this.data, offset);
        offset += description.bytesRead;

        this.data.set(jumbf, offset);
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
