import { BinaryHelper } from '../util';
import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

interface JXLBox {
    type: string;
    offset: number;
    size: number;
    data: Uint8Array;
}

export class JPEGXL extends BaseAsset implements Asset {
    public readonly mimeType = 'image/jxl';
    public static readonly signature = new Uint8Array([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20]);

    private readonly boxes: JXLBox[] = [];
    private manifestBoxIndex?: number;

    constructor(data: Uint8Array) {
        super(data);
        this.parseBoxes();
    }

    public static canRead(buf: Uint8Array): boolean {
        if (buf.length < JPEGXL.signature.length) return false;
        return BinaryHelper.bufEqual(buf.subarray(0, JPEGXL.signature.length), JPEGXL.signature);
    }

    private parseBoxes(): void {
        let offset = 0;
        while (offset < this.data.length) {
            // Need at least 8 bytes for box header
            if (offset + 8 > this.data.length) {
                throw new Error('Incomplete box header at end of file');
            }

            const size = BinaryHelper.readUInt32(this.data, offset);
            if (size < 8) {
                throw new Error(`Invalid box size ${size} at offset ${offset}`);
            }

            // Check if box extends beyond file boundary
            if (offset + size > this.data.length) {
                throw new Error(`Box at offset ${offset} extends beyond end of file`);
            }

            const type = BinaryHelper.readString(this.data, offset + 4, 4);

            // Check for C2PA manifest box
            if (type === 'Capa') {
                if (this.manifestBoxIndex !== undefined) {
                    throw new Error('Multiple manifest boxes found');
                }
                this.manifestBoxIndex = this.boxes.length;
            }

            this.boxes.push({
                type,
                offset,
                size,
                data: this.data.subarray(offset + 8, offset + size),
            });

            offset += size;
        }
    }

    public getManifestJUMBF(): Uint8Array | undefined {
        if (this.manifestBoxIndex === undefined) return undefined;
        const box = this.boxes[this.manifestBoxIndex];
        return box.data;
    }

    public async ensureManifestSpace(length: number): Promise<void> {
        const requiredSize = length + 8; // Add 8 bytes for box header

        if (this.manifestBoxIndex !== undefined) {
            const currentBox = this.boxes[this.manifestBoxIndex];
            if (currentBox.size === requiredSize) return;
        }

        // Calculate new buffer size
        const oldSize = this.manifestBoxIndex !== undefined ? this.boxes[this.manifestBoxIndex].size : 0;
        const sizeDiff = requiredSize - oldSize;
        const newData = new Uint8Array(this.data.length + sizeDiff);

        // Write signature box
        newData.set(this.data.subarray(0, 12), 0);
        let writeOffset = 12;

        if (this.manifestBoxIndex === undefined) {
            // Insert new manifest box after signature
            this.manifestBoxIndex = 1;

            // Write manifest box header
            const view = new DataView(newData.buffer);
            view.setUint32(writeOffset, requiredSize, false); // false for big-endian
            newData.set(new TextEncoder().encode('Capa'), writeOffset + 4);
            writeOffset += requiredSize;

            // Copy remaining boxes
            newData.set(this.data.subarray(12), writeOffset);

            // Update box list
            this.boxes.splice(this.manifestBoxIndex, 0, {
                type: 'Capa',
                offset: 12,
                size: requiredSize,
                data: newData.subarray(20, 12 + requiredSize),
            });

            // Update offsets of following boxes
            for (let i = this.manifestBoxIndex + 1; i < this.boxes.length; i++) {
                this.boxes[i].offset += requiredSize;
                this.boxes[i].data = newData.subarray(
                    this.boxes[i].offset + 8,
                    this.boxes[i].offset + this.boxes[i].size,
                );
            }
        } else {
            // Resize existing manifest box
            const manifestBox = this.boxes[this.manifestBoxIndex];

            // Write manifest box header
            const view = new DataView(newData.buffer);
            view.setUint32(writeOffset, requiredSize, false);
            newData.set(new TextEncoder().encode('Capa'), writeOffset + 4);
            writeOffset += requiredSize;

            // Copy boxes after manifest
            if (this.manifestBoxIndex < this.boxes.length - 1) {
                const afterManifest = this.data.subarray(manifestBox.offset + manifestBox.size);
                newData.set(afterManifest, writeOffset);
            }

            // Update manifest box
            manifestBox.size = requiredSize;
            manifestBox.data = newData.subarray(manifestBox.offset + 8, manifestBox.offset + requiredSize);

            // Update offsets of following boxes
            for (let i = this.manifestBoxIndex + 1; i < this.boxes.length; i++) {
                this.boxes[i].offset += sizeDiff;
                this.boxes[i].data = newData.subarray(
                    this.boxes[i].offset + 8,
                    this.boxes[i].offset + this.boxes[i].size,
                );
            }
        }

        this.data = newData;
    }

    public async writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        if (this.manifestBoxIndex === undefined) {
            throw new Error('No manifest storage reserved');
        }

        const box = this.boxes[this.manifestBoxIndex];
        if (box.data.length !== jumbf.length) {
            throw new Error('Wrong amount of space in asset');
        }

        // Write JUMBF data
        this.data.set(jumbf, box.offset + 8);
    }

    public getHashExclusionRange(): { start: number; length: number } {
        if (this.manifestBoxIndex === undefined) {
            throw new Error('No manifest storage reserved');
        }

        const box = this.boxes[this.manifestBoxIndex];
        return { start: box.offset, length: box.size };
    }

    public dumpInfo(): string {
        return `JPEG-XL image (${this.data.length} bytes, ${this.boxes.length} boxes)`;
    }
}
