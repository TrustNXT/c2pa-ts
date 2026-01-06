import { BinaryHelper } from '../util';
import { BaseAsset } from './BaseAsset';
import { AssemblePart } from './reader/AssetDataReader';
import { createReader } from './reader/createReader';
import { Asset, AssetSource } from './types';

export class BMFF extends BaseAsset implements Asset {
    public static readonly c2paBoxUserType = [
        0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
    ];

    /** Non-exhaustive list of boxes that may not appear before a FileType box, otherwise it's not a valid file */
    private static readonly mustBePrecededByFtyp = new Set(['free', 'mdat', 'meta', 'moof', 'moov', 'uuid']);

    private static readonly canReadPeekLength = 4096;

    /** Supported brand to MIME type mapping */
    private static readonly supportedBrandMimeTypes: Record<string, string> = {
        heic: 'image/heic',
        mif1: 'image/heif',
        avif: 'image/avif',
        mp41: 'video/mp4',
        mp42: 'video/mp4',
        isom: 'video/mp4',
    };

    public readonly mimeType: string;

    private boxes: Box<object>[] = [];

    private constructor(source: AssetSource, mimeType: string) {
        super(source);
        this.mimeType = mimeType;
    }

    public static async create(source: AssetSource): Promise<BMFF> {
        const reader = createReader(source);
        const header = await reader.getDataRange(0, Math.min(BMFF.canReadPeekLength, reader.getDataLength()));
        const mimeType = BMFF.detectMimeType(header);
        if (!mimeType) throw new Error('Not a readable BMFF file');

        const asset = new BMFF(source, mimeType);
        await asset.parse();
        return asset;
    }

    public static async canRead(source: AssetSource): Promise<boolean> {
        const reader = createReader(source);
        const header = await reader.getDataRange(0, Math.min(BMFF.canReadPeekLength, reader.getDataLength()));
        return BMFF.detectMimeType(header) !== undefined;
    }

    /**
     * Detects the MIME type from the ftyp box brands.
     * Returns undefined if no supported brand is found.
     */
    private static detectMimeType(buf: Uint8Array): string | undefined {
        try {
            for (const box of BoxReader.read(buf, 0, buf.length)) {
                if (box instanceof FileTypeBox) return this.getMimeTypeFromFtyp(box.payload);
                if (this.mustBePrecededByFtyp.has(box.type)) return undefined;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    /** Returns the MIME type for the given ftyp payload, checking major brand first, then compatible brands. */
    private static getMimeTypeFromFtyp(ftyp: FileTypeBoxPayload): string | undefined {
        if (this.supportedBrandMimeTypes[ftyp.majorBrand]) {
            return this.supportedBrandMimeTypes[ftyp.majorBrand];
        }
        const compatibleBrand = ftyp.compatibleBrands.find(brand => this.supportedBrandMimeTypes[brand]);
        return compatibleBrand ? this.supportedBrandMimeTypes[compatibleBrand] : undefined;
    }

    private async parse(): Promise<void> {
        const fileLength = this.reader.getDataLength();
        this.boxes = [];
        let pos = 0;

        while (pos < fileLength) {
            // Read enough for extended size header (16 bytes)
            const headerSize = Math.min(16, fileLength - pos);
            if (headerSize < 8) throw new Error('Malformed BMFF (buffer underrun)');

            const header = await this.reader.getDataRange(pos, headerSize);
            const { size, payloadPos, payloadSize, boxType } = BoxReader.readHeader(header, pos, fileLength);

            // For large non-critical boxes, just record position without reading content
            const isLargeBox = payloadSize > 1024 * 1024;
            let box: Box<object>;

            if (isLargeBox && boxType !== 'uuid') {
                box = new Box(pos, size, payloadPos, payloadSize, boxType);
            } else {
                // Read full box and parse with BoxReader
                const boxData = await this.reader.getDataRange(pos, size);
                box = BoxReader.read(boxData, 0, size).next().value as Box<object>;
                if (!box) throw new Error('Failed to parse box');
                // Adjust all box offsets to be file-absolute (BoxReader returns 0-based offsets)
                box.adjustOffset(pos);
            }

            this.boxes.push(box);
            pos += size;
        }
    }

    public dumpInfo() {
        const lines = ['BMFF file:'];
        this.dumpBoxArray(this.boxes, '/', lines);
        return lines.join('\n');
    }

    private dumpBoxArray(boxes: Box<object>[], prefix: string, into: string[]) {
        for (const box of boxes) {
            const xpath = prefix + box.type;
            into.push(xpath);
            this.dumpBoxArray(box.childBoxes, xpath + '/', into);
        }
    }

    /**
     * Extracts the manifest store in raw JUMBF format from a UUID box
     */
    public async getManifestJUMBF(): Promise<Uint8Array | undefined> {
        const box = this.getManifestStoreBox();
        if (!box) return undefined;
        const payload = box.payload as C2PAManifestBoxPayload;

        // Read the JUMBF box size from its header (first 4 bytes)
        // The manifest area may include padding bytes, so we need to get the actual size
        const jumbfHeader = await this.getDataRange(payload.manifestOffset, 4);
        const jumbfSize = BinaryHelper.readUInt32(jumbfHeader, 0);

        return this.getDataRange(payload.manifestOffset, jumbfSize);
    }

    private getManifestStoreBox(): C2PABox | undefined {
        const manifestStores = this.boxes.filter((box): box is C2PABox => box instanceof C2PABox && box.isManifest());
        return manifestStores.length === 1 ? manifestStores[0] : undefined;
    }

    /**
     * Retrieves a box based on the provided xpath
     * @param xpath
     */
    public getBoxByPath(xpath: string) {
        const pathParts = xpath.split('/');
        if (pathParts.length < 2 || pathParts[0] !== '') return undefined;

        let boxes = this.boxes;

        for (let i = 1; i < pathParts.length; i++) {
            let nextBox: Box<object>;

            const m = /^(.+)\[(\d+)\]$/.exec(pathParts[i]);
            if (m) {
                const index = Number(m[2]);
                const matchingBoxes = boxes.filter(box => box.type === m[1]);
                if (matchingBoxes.length === 0) return undefined;
                if (isNaN(index) || index < 0 || index > matchingBoxes.length - 1) return undefined;
                if (matchingBoxes.length <= index) return undefined;
                nextBox = matchingBoxes[index];
            } else {
                const matchingBoxes = boxes.filter(box => box.type === pathParts[i]);
                if (matchingBoxes.length !== 1) return undefined;
                nextBox = matchingBoxes[0];
            }

            if (i === pathParts.length - 1) return nextBox;

            boxes = nextBox.childBoxes;
        }

        return undefined;
    }

    /**
     * Retrieves all top level boxes (required for BMFF v2 hash assertions)
     */
    public getTopLevelBoxes() {
        return this.boxes;
    }

    public async ensureManifestSpace(length: number): Promise<void> {
        // Nothing to do?
        const manifestStoreBox = this.getManifestStoreBox();
        if (manifestStoreBox?.isManifest() && manifestStoreBox.payload.manifestLength === length) return;

        // First pass: calculate the C2PA box size and find existing C2PA box to remove
        let existingC2PASize = 0;
        for (const box of this.boxes) {
            if (box instanceof C2PABox) {
                existingC2PASize = box.size;
                break;
            }
        }

        // Calculate new C2PA box size (header + inner header + manifest)
        const newC2PABox = C2PABox.createManifestBox(0, length);
        const offsetAdjustment = newC2PABox.size - existingC2PASize;

        const parts: AssemblePart[] = [];
        let targetPosition = 0;
        let afterFtyp = false;

        // Go through boxes, remove any existing C2PA box, and add a new one right after ftyp,
        // assembling them into a new file structure as we go.
        for (let i = 0; i < this.boxes.length; i++) {
            const box = this.boxes[i];

            // Remove existing C2PABox
            if (box instanceof C2PABox) {
                this.boxes.splice(i, 1);
                i--;
                continue;
            }

            // For boxes after ftyp that contain offset-sensitive data, we need to patch
            // the binary data to adjust internal offsets. This is critical for iloc boxes
            // which store file offsets to mdat content.
            if (afterFtyp && offsetAdjustment !== 0 && this.containsOffsetSensitiveData(box)) {
                // Read the box data and patch it
                const boxData = await this.reader.getDataRange(box.offset, box.size);
                // Pass box.offset as bufferOffset since the buffer starts at that file position
                box.shiftPosition(offsetAdjustment, boxData, box.offset);
                // Use the patched data instead of a source reference
                parts.push({ position: targetPosition, data: boxData, length: box.size });
            } else {
                // Add box reference to new file structure
                parts.push(this.sourceRef(targetPosition, box.offset, box.size));
            }

            const oldOffset = box.offset;
            box.offset = targetPosition;
            box.payloadOffset += targetPosition - oldOffset;
            targetPosition += box.size;

            // Insert new C2PABox after FileTypeBox
            if (box instanceof FileTypeBox) {
                afterFtyp = true;
                const c2paBox = C2PABox.createManifestBox(targetPosition, length);
                this.boxes.splice(i + 1, 0, c2paBox);
                i++;
                parts.push({ position: targetPosition, data: c2paBox.getHeader(), length: c2paBox.size });
                targetPosition += c2paBox.size;
            }
        }

        this.assembleAsset(parts);
    }

    /**
     * Checks if a box contains offset-sensitive data that needs patching when
     * the file structure changes (e.g., iloc box which stores file offsets).
     */
    private containsOffsetSensitiveData(box: Box<object>): boolean {
        // Meta box contains iloc which has file offsets
        if (box instanceof MetaBox) return true;
        // Check child boxes recursively
        for (const child of box.childBoxes) {
            if (child instanceof ItemLocationBox) return true; // HEIF
            if (child instanceof StcoBox) return true; // MP4 32-bit chunk offsets
            if (child instanceof Co64Box) return true; // MP4 64-bit chunk offsets
            if (this.containsOffsetSensitiveData(child)) return true;
        }
        return false;
    }

    public getHashExclusionRange(): { start: number; length: number } {
        const box = this.getManifestStoreBox();
        if (box === undefined) throw new Error('No manifest storage reserved');

        return { start: box.offset, length: box.size };
    }

    public async writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        const box = this.getManifestStoreBox();
        if (!box || !box.isManifest() || box.payload.manifestLength !== jumbf.length) {
            throw new Error('Wrong amount of space in asset');
        }

        this.replaceRange(box.payloadOffset, box.getPayload(jumbf));
    }
}

class BoxReader {
    private constructor() {}

    /**
     * Parses a box header from the given buffer.
     * @param buf Buffer containing the header (at least 8 bytes, 16 for extended size)
     * @param pos Current position in the file (for calculating absolute offsets)
     * @param fileLength Total file length (for size=0 boxes that extend to EOF)
     */
    public static readHeader(
        buf: Uint8Array,
        pos: number,
        fileLength: number,
    ): { size: number; payloadPos: number; payloadSize: number; boxType: string } {
        if (buf.length < 8) throw new Error('Malformed BMFF (buffer underrun)');

        let size = BinaryHelper.readUInt32(buf, 0);
        let payloadPos = pos + 8;
        let payloadSize = size - 8;
        const boxType = BinaryHelper.readString(buf, 4, 4);

        if (size === 0) {
            size = fileLength - pos;
            payloadSize = size - 8;
        } else if (size === 1) {
            if (buf.length < 16) throw new Error('Malformed BMFF (buffer underrun for large box)');
            const largeSize = BinaryHelper.readUInt64(buf, 8);
            if (largeSize > Number.MAX_SAFE_INTEGER) {
                throw new Error(`BMFF read error: Box sizes larger than ${Number.MAX_SAFE_INTEGER} are not supported`);
            }
            size = Number(largeSize);
            payloadPos = pos + 16;
            payloadSize = size - 16;
        } else if (size < 8) {
            throw new Error('Malformed BMFF (box size too small)');
        }

        if (pos + size > fileLength) throw new Error('Malformed BMFF (box length too large)');

        return { size, payloadPos, payloadSize, boxType };
    }

    public static *read(buf: Uint8Array, offset: number, length: number) {
        let pos = offset;
        const end = offset + length;

        while (pos < end) {
            const headerBuf = buf.subarray(pos, Math.min(pos + 16, end));
            const { size, payloadPos, payloadSize, boxType } = this.readHeader(headerBuf, pos, end);

            // Handle any special box types first
            let box: Box<object>;
            if (boxType === 'ftyp') {
                box = new FileTypeBox(pos, size, payloadPos, payloadSize, boxType);
            } else if (boxType === 'meta') {
                box = new MetaBox(pos, size, payloadPos, payloadSize, boxType);
            } else if (boxType === 'iloc') {
                box = new ItemLocationBox(pos, size, payloadPos, payloadSize, boxType);
            } else if (boxType === 'stco') {
                box = new StcoBox(pos, size, payloadPos, payloadSize, boxType);
            } else if (boxType === 'co64') {
                box = new Co64Box(pos, size, payloadPos, payloadSize, boxType);
            } else if (SimpleContainerBox.boxTypes.has(boxType)) {
                box = new SimpleContainerBox(pos, size, payloadPos, payloadSize, boxType);
            } else {
                box = new Box(pos, size, payloadPos, payloadSize, boxType);
            }

            box.readContents(buf);

            // Now that the box header is fully read, we know that it might be a UUID box (== has a userType),
            // so handle those cases as well (currently only C2PABox)
            if (box.userType && BinaryHelper.bufEqual(box.userType, BMFF.c2paBoxUserType)) {
                box = new C2PABox(pos, size, payloadPos, payloadSize, boxType);
                box.readContents(buf);
            }

            yield box;
            pos += size;
        }
    }
}

export interface BMFFBox<T extends object> {
    offset: number;
    size: number;
    type: string;
    payload: T;
    userType: Uint8Array | undefined;
    childBoxes: Box<object>[];
}

class Box<T extends object> implements BMFFBox<T> {
    public payload: T;
    public userType: Uint8Array | undefined;
    public childBoxes: Box<object>[] = [];

    public constructor(
        public offset: number,
        public readonly size: number,
        public payloadOffset: number,
        public payloadSize: number,
        public readonly type: string,
    ) {
        this.payload = {} as T;
    }

    public readContents(buf: Uint8Array) {
        if (this.type === 'uuid') {
            if (this.payloadSize < 16) throw new Error('Malformed BMFF (uuid box too small)');
            this.userType = buf.subarray(this.payloadOffset, this.payloadOffset + 16);
            this.payloadOffset += 16;
            this.payloadSize -= 16;
        }
    }

    protected readChildBoxes(buf: Uint8Array) {
        if (this.payloadSize === 0) return;
        this.childBoxes = Array.from(BoxReader.read(buf, this.payloadOffset, this.payloadSize));
    }

    /**
     * Recursively adjusts all box offsets by the given amount.
     * This converts 0-based buffer offsets to file-absolute offsets.
     */
    public adjustOffset(amount: number): void {
        this.offset += amount;
        this.payloadOffset += amount;
        for (const child of this.childBoxes) child.adjustOffset(amount);
    }

    /**
     * Shifts the position of the box by the specified number of bytes. This does not
     * actually move the data around, it only adjusts the box's properties.
     * It does, however, patch any values contained inside the box at the box's original
     * position in `buf`.
     *
     * @param amount The number of bytes to shift by (positive = forward, negative = backward)
     * @param buf The buffer containing the box data to patch
     * @param bufferOffset The file position where the buffer starts (default 0 = buffer starts at file position 0)
     */
    public shiftPosition(amount: number, buf: Uint8Array, bufferOffset = 0) {
        if (amount === 0) return;

        this.offset += amount;
        this.payloadOffset += amount;
        for (const box of this.childBoxes) box.shiftPosition(amount, buf, bufferOffset);
    }
}

interface FullBoxPayload {
    version: number;
    flags: number;
}

class FullBox<T extends FullBoxPayload> extends Box<T> {
    public readContents(buf: Uint8Array) {
        super.readContents(buf);

        if (this.payloadSize < 4) throw new Error('Malformed BMFF (full box too small)');
        this.payload.version = buf[this.payloadOffset];
        this.payload.flags =
            (buf[this.payloadOffset + 1] << 16) | (buf[this.payloadOffset + 2] << 8) | buf[this.payloadOffset + 3];
        this.payloadOffset += 4;
        this.payloadSize -= 4;
    }
}

/**
 * Handles all simple container boxes that are relevant to resolve C2PA BMFF hash xpath,
 * i.e. container boxes that contain sub-boxes only and do not derive from FullBox or
 * have any other additional fields that need parsing.
 */
class SimpleContainerBox extends Box<never> {
    public static readonly boxTypes = new Set([
        'cinf',
        'dinf',
        'edts',
        'grp1',
        'mdia',
        'meco',
        'mfra',
        'minf',
        'moof',
        'moov',
        'mvex',
        'paen',
        'rinf',
        'sinf',
        'stbl',
        'strd',
        'strk',
        'traf',
        'trak',
        'udta',
    ]);

    public readContents(buf: Uint8Array): void {
        super.readContents(buf);
        this.readChildBoxes(buf);
    }
}

interface FileTypeBoxPayload {
    majorBrand: string;
    minorVersion: number;
    compatibleBrands: string[];
}

class FileTypeBox extends Box<FileTypeBoxPayload> {
    public readContents(buf: Uint8Array): void {
        super.readContents(buf);

        if (this.payloadSize < 8) throw new Error('Malformed BMFF (file type box too small)');
        this.payload.majorBrand = BinaryHelper.readString(buf, this.payloadOffset, 4);
        this.payload.minorVersion = BinaryHelper.readUInt32(buf, this.payloadOffset + 4);

        const compatibleBrands: string[] = [];
        let pos = this.payloadOffset + 8;
        while (pos < this.payloadOffset + this.payloadSize) {
            compatibleBrands.push(BinaryHelper.readString(buf, pos, 4));
            pos += 4;
        }
        this.payload.compatibleBrands = compatibleBrands;
    }
}

interface MetaBoxPayload extends FullBoxPayload {
    boxes: Box<object>[];
}

/**
 * MetaBox can be either:
 * - ISO BMFF style (FullBox with version/flags header) - used in HEIF/HEIC
 * - QuickTime style (no version/flags, directly contains child boxes) - used in MP4/MOV
 *
 * We detect which style by checking if the first 4 bytes after the header look like
 * a valid box size (>= 8 and <= remaining payload).
 */
class MetaBox extends FullBox<MetaBoxPayload> {
    public readContents(buf: Uint8Array): void {
        super.readContents(buf);
        if (this.payloadSize >= 8) {
            const potentialSize = BinaryHelper.readUInt32(buf, this.payloadOffset);
            if (potentialSize >= 8 && potentialSize <= this.payloadSize) {
                // QuickTime style - no version/flags, child boxes start immediately
                this.payload.version = 0;
                this.payload.flags = 0;
            } else {
                // ISO BMFF style - read version/flags
                if (this.payloadSize < 4) throw new Error('Malformed BMFF (full box too small)');
                this.payload.version = buf[this.payloadOffset];
                this.payload.flags =
                    (buf[this.payloadOffset + 1] << 16) |
                    (buf[this.payloadOffset + 2] << 8) |
                    buf[this.payloadOffset + 3];
                this.payloadOffset += 4;
                this.payloadSize -= 4;
            }
        }

        if (this.payload.version !== 0) {
            this.payload.boxes = [];
            return;
        }

        this.readChildBoxes(buf);
        if (!this.childBoxes.length) throw new Error('Malformed BMFF (empty meta box)');
    }
}

enum ItemLocationConstructionMethod {
    file = 0,
    idat = 1,
    item = 2,
}

interface ItemLocationExtent {
    index?: number | bigint;
    offset: number | bigint;
    length: number | bigint;
}

interface ItemLocationItem {
    itemID: number;
    constructionMethod?: ItemLocationConstructionMethod;
    dataReferenceIndex: number;
    baseOffset: number | bigint;
    extents: ItemLocationExtent[];
}

interface ItemLocationBoxPayload extends FullBoxPayload {
    offsetSize: 0 | 4 | 8;
    lengthSize: 0 | 4 | 8;
    baseOffsetSize: 0 | 4 | 8;
    indexSize?: 0 | 4 | 8;
    items: ItemLocationItem[];
}

class ItemLocationBox extends FullBox<ItemLocationBoxPayload> {
    private readNumber(buf: Uint8Array, pos: number, size: 0 | 4 | 8): number | bigint {
        switch (size) {
            case 8:
                return BinaryHelper.readUInt64(buf, pos);
            case 4:
                return BinaryHelper.readUInt32(buf, pos);
        }
        return 0;
    }

    public readContents(buf: Uint8Array): void {
        super.readContents(buf);

        if (this.payload.version > 2) return;
        if (this.payloadSize < 6 || (this.payload.version === 2 && this.payloadSize < 8))
            throw new Error('Malformed BMFF (item location box too small)');

        let pos = this.payloadOffset;
        const end = this.payloadOffset + this.payloadSize;

        this.payload.offsetSize = (buf[pos] >> 4) as 0 | 4 | 8;
        this.payload.lengthSize = (buf[pos] & 0x0f) as 0 | 4 | 8;
        pos++;
        this.payload.baseOffsetSize = (buf[pos] >> 4) as 0 | 4 | 8;
        if (this.payload.version === 1 || this.payload.version === 2) {
            this.payload.indexSize = (buf[pos] & 0x0f) as 0 | 4 | 8;
        }
        pos++;
        let itemCount: number;
        if (this.payload.version === 2) {
            itemCount = BinaryHelper.readUInt32(buf, pos);
            pos += 4;
        } else {
            itemCount = BinaryHelper.readUInt16(buf, pos);
            pos += 2;
        }

        const minimumItemSize =
            (this.payload.version === 2 ? 4 : 2) + // item_ID
            (this.payload.version > 0 ? 2 : 0) + // reserved, construction_method
            2 + // data_reference_index
            this.payload.baseOffsetSize + // base_offset
            2; // extent_count

        const extentSize =
            (this.payload.version > 0 ? this.payload.indexSize! : 0) + // extend_index
            this.payload.offsetSize + // extent_offset
            this.payload.lengthSize; // extent_length

        this.payload.items = [];
        for (let i = 0; i < itemCount; i++) {
            if (end - pos < minimumItemSize) throw new Error('Malformed BMFF (item location box too small)');

            let itemID: number;
            if (this.payload.version === 2) {
                itemID = BinaryHelper.readUInt32(buf, pos);
                pos += 4;
            } else {
                itemID = BinaryHelper.readUInt16(buf, pos);
                pos += 2;
            }

            let constructionMethod: ItemLocationConstructionMethod | undefined;
            if (this.payload.version > 0) {
                pos++;
                constructionMethod = (buf[pos++] & 0x0f) as ItemLocationConstructionMethod;
            }

            const dataReferenceIndex = BinaryHelper.readUInt16(buf, pos);
            pos += 2;

            const baseOffset = this.readNumber(buf, pos, this.payload.baseOffsetSize);
            pos += this.payload.baseOffsetSize;

            const extentCount = BinaryHelper.readUInt16(buf, pos);
            const extents: ItemLocationExtent[] = [];
            pos += 2;

            for (let j = 0; j < extentCount; j++) {
                if (end - pos < extentSize) throw new Error('Malformed BMFF (item location box too small)');

                let index: number | bigint | undefined;
                if (this.payload.version > 0) {
                    index = this.readNumber(buf, pos, this.payload.indexSize!);
                    pos += this.payload.indexSize!;
                }
                const offset = this.readNumber(buf, pos, this.payload.offsetSize);
                pos += this.payload.offsetSize;
                const length = this.readNumber(buf, pos, this.payload.lengthSize);
                pos += this.payload.lengthSize;
                extents.push({ index, offset, length });
            }

            this.payload.items.push({
                itemID,
                constructionMethod,
                dataReferenceIndex,
                baseOffset,
                extents,
            });
        }
    }

    public shiftPosition(amount: number, buf: Uint8Array, bufferOffset = 0): void {
        const relativePayloadOffset = this.payloadOffset - bufferOffset;
        const dataView = new DataView(buf.buffer, buf.byteOffset + relativePayloadOffset);
        let pos = this.payload.version === 2 ? 6 : 4;

        for (const item of this.payload.items) {
            pos = this.patchItemOffsets(item, amount, dataView, pos);
        }

        super.shiftPosition(amount, buf, bufferOffset);
    }

    private patchItemOffsets(item: ItemLocationItem, amount: number, dataView: DataView, pos: number): number {
        let currentPos = pos + (this.payload.version === 2 ? 4 : 2); // item_ID
        if (this.payload.version > 0) currentPos += 2; // reserved, construction_method
        currentPos += 2; // data_reference_index

        // Patch base offset
        if (this.payload.baseOffsetSize === 8) {
            item.baseOffset = (item.baseOffset as bigint) + BigInt(amount);
            dataView.setBigUint64(currentPos, item.baseOffset);
        } else if (this.payload.baseOffsetSize === 4) {
            item.baseOffset = (item.baseOffset as number) + amount;
            dataView.setUint32(currentPos, item.baseOffset);
        }
        currentPos += this.payload.baseOffsetSize;

        // Patch extents
        currentPos += 2; // extent_count field length
        for (const extent of item.extents) {
            currentPos = this.patchExtentOffsets(item, extent, amount, dataView, currentPos);
        }

        return currentPos;
    }

    private patchExtentOffsets(
        item: ItemLocationItem,
        extent: ItemLocationExtent,
        amount: number,
        dataView: DataView,
        pos: number,
    ): number {
        let currentPos = pos;
        if (this.payload.indexSize) currentPos += this.payload.indexSize;

        const isFileMethod =
            (item.constructionMethod ?? ItemLocationConstructionMethod.file) === ItemLocationConstructionMethod.file;

        if (isFileMethod && item.baseOffset === 0 && extent.offset !== 0) {
            if (this.payload.offsetSize === 8) {
                extent.offset = (extent.offset as bigint) + BigInt(amount);
                dataView.setBigUint64(currentPos, extent.offset);
            } else if (this.payload.offsetSize === 4) {
                extent.offset = (extent.offset as number) + amount;
                dataView.setUint32(currentPos, extent.offset);
            }
        }

        return currentPos + this.payload.offsetSize + this.payload.lengthSize;
    }
}

/**
 * Sample Table Chunk Offset box (stco) - contains 32-bit file offsets to chunks of media data.
 * These offsets point to data in the mdat box and need to be adjusted when content is inserted.
 */
interface StcoBoxPayload extends FullBoxPayload {
    entryCount: number;
    chunkOffsets: number[];
}

class StcoBox extends FullBox<StcoBoxPayload> {
    public readContents(buf: Uint8Array): void {
        super.readContents(buf);
        if (this.payloadSize < 4) throw new Error('Malformed BMFF (stco box too small)');

        this.payload.entryCount = BinaryHelper.readUInt32(buf, this.payloadOffset);
        this.payload.chunkOffsets = [];

        let pos = this.payloadOffset + 4;
        for (let i = 0; i < this.payload.entryCount; i++) {
            this.payload.chunkOffsets.push(BinaryHelper.readUInt32(buf, pos));
            pos += 4;
        }
    }

    public shiftPosition(amount: number, buf: Uint8Array, bufferOffset = 0): void {
        const relativePayloadOffset = this.payloadOffset - bufferOffset;
        const dataView = new DataView(buf.buffer, buf.byteOffset + relativePayloadOffset);

        // Patch each chunk offset (starts at offset 4 after entry_count)
        for (let i = 0; i < this.payload.entryCount; i++) {
            const pos = 4 + i * 4;
            this.payload.chunkOffsets[i] += amount;
            dataView.setUint32(pos, this.payload.chunkOffsets[i]);
        }

        super.shiftPosition(amount, buf, bufferOffset);
    }
}

/**
 * 64-bit Chunk Offset box (co64) - contains 64-bit file offsets to chunks of media data.
 * Used instead of stco when file offsets exceed 32-bit range.
 */
interface Co64BoxPayload extends FullBoxPayload {
    entryCount: number;
    chunkOffsets: bigint[];
}

class Co64Box extends FullBox<Co64BoxPayload> {
    public readContents(buf: Uint8Array): void {
        super.readContents(buf);
        if (this.payloadSize < 4) throw new Error('Malformed BMFF (co64 box too small)');

        this.payload.entryCount = BinaryHelper.readUInt32(buf, this.payloadOffset);
        this.payload.chunkOffsets = [];

        let pos = this.payloadOffset + 4;
        for (let i = 0; i < this.payload.entryCount; i++) {
            this.payload.chunkOffsets.push(BinaryHelper.readUInt64(buf, pos));
            pos += 8;
        }
    }

    public shiftPosition(amount: number, buf: Uint8Array, bufferOffset = 0): void {
        const relativePayloadOffset = this.payloadOffset - bufferOffset;
        const dataView = new DataView(buf.buffer, buf.byteOffset + relativePayloadOffset);

        // Patch each chunk offset (starts at offset 4 after entry_count)
        for (let i = 0; i < this.payload.entryCount; i++) {
            const pos = 4 + i * 8;
            this.payload.chunkOffsets[i] += BigInt(amount);
            dataView.setBigUint64(pos, this.payload.chunkOffsets[i]);
        }

        super.shiftPosition(amount, buf, bufferOffset);
    }
}

interface C2PABoxPayload extends FullBoxPayload {
    purpose: string;
}

interface C2PAManifestBoxPayload extends C2PABoxPayload {
    purpose: 'manifest';
    merkleOffset: bigint;
    manifestOffset: number;
    manifestLength: number;
}

class C2PABox extends FullBox<C2PABoxPayload> {
    private static readonly headerLength =
        4 + // size
        4 + // type
        16 + // uuid
        3 + // flags
        1; // version

    public readContents(buf: Uint8Array): void {
        super.readContents(buf);

        const purpose = BinaryHelper.readNullTerminatedString(
            buf,
            this.payloadOffset,
            this.payloadOffset + this.payloadSize,
        );
        this.payload.purpose = purpose.string;

        if (purpose.string === 'manifest') {
            const manifestOffset = this.payloadOffset + purpose.bytesRead + 8;
            const manifestPayload: C2PAManifestBoxPayload = {
                ...this.payload,
                purpose: 'manifest',
                merkleOffset: BinaryHelper.readUInt64(buf, this.payloadOffset + purpose.bytesRead),
                manifestOffset,
                manifestLength: this.payloadOffset + this.payloadSize - manifestOffset,
            };

            this.payload = manifestPayload;
        }

        // Merkle tree hashing currently not implemented
    }

    public static createManifestBox(position: number, manifestLength: number): C2PABox {
        const innerHeaderLength =
            'manifest'.length +
            1 + // null terminator
            8; // merkleOffset

        const box = new C2PABox(
            position,
            C2PABox.headerLength + innerHeaderLength + manifestLength,
            position + C2PABox.headerLength,
            manifestLength + innerHeaderLength,
            'uuid',
        );

        box.userType = new Uint8Array(BMFF.c2paBoxUserType);
        const manifestOffset = box.payloadOffset + 'manifest'.length + 1 + 8;
        const payload: C2PAManifestBoxPayload = {
            version: 0,
            flags: 0,
            purpose: 'manifest',
            merkleOffset: 0n,
            manifestOffset,
            manifestLength,
        };
        box.payload = payload;

        return box;
    }

    public isManifest(): this is C2PABox & { payload: C2PAManifestBoxPayload } {
        return this.payload.purpose === 'manifest';
    }

    public adjustOffset(amount: number): void {
        super.adjustOffset(amount);
        if (this.isManifest()) {
            this.payload.manifestOffset += amount;
        }
    }

    public shiftPosition(amount: number, buf: Uint8Array, bufferOffset = 0) {
        super.shiftPosition(amount, buf, bufferOffset);
        if (this.isManifest()) {
            this.payload.manifestOffset += amount;
        }
    }

    /**
     * Returns the box header for the FullBox, not including anything defined in C2PAPayload
     * (i.e., anything _before_ this.payloadOffset).
     */
    public getHeader(): Uint8Array {
        const header = new Uint8Array(C2PABox.headerLength);
        const dataView = new DataView(header.buffer);
        dataView.setUint32(0, this.size);
        this.type.split('').forEach((c, i) => dataView.setUint8(4 + i, c.charCodeAt(0)));
        header.set(this.userType!, 8);
        dataView.setUint8(24, this.payload.version);
        dataView.setUint8(25, this.payload.flags >> 16);
        dataView.setUint8(26, this.payload.flags >> 8);
        dataView.setUint8(27, this.payload.flags);

        return header;
    }

    /**
     * Takes the given manifest content and returns the serialized box payload.
     */
    public getPayload(manifest: Uint8Array): Uint8Array {
        const payload = this.payload as C2PAManifestBoxPayload;

        const buf = new Uint8Array(this.payloadSize);
        const dataView = new DataView(buf.buffer);

        // Write purpose string
        payload.purpose.split('').forEach((c, i) => dataView.setUint8(i, c.charCodeAt(0)));
        // Write null terminator
        dataView.setUint8(payload.purpose.length, 0);
        // Write Merkle offset
        dataView.setBigUint64(payload.purpose.length + 1, payload.merkleOffset);
        // Write content
        buf.set(manifest, payload.purpose.length + 9);

        return buf;
    }
}
