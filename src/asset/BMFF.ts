import { BinaryHelper } from '../util';
import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

export class BMFF extends BaseAsset implements Asset {
    /** Currently supported major brand identifiers */
    private static canReadBrands = new Set(['heic', 'mif1']);

    /** Non-exhaustive list of boxes that may not appear before a FileType box, otherwise it's not a valid file */
    private static mustBePrecededByFtyp = new Set(['free', 'mdat', 'meta', 'moof', 'moov', 'uuid']);

    public readonly mimeType = 'image/heic'; // Could technically also be image/heif if the brand is mif1

    private boxes: Box<object>[] = [];

    public constructor(data: Uint8Array) {
        super(data);
        if (!BMFF.canRead(data)) {
            throw new Error('Not a readable BMFF file');
        }
        this.boxes = Array.from(BoxReader.read(data, 0, data.length));
    }

    public static canRead(buf: Uint8Array) {
        try {
            // BoxReader.read() is a generator function so this will only read as far into the file as necessary
            for (const box of BoxReader.read(buf, 0, buf.length)) {
                if (box instanceof FileTypeBox) {
                    return (
                        this.canReadBrands.has(box.payload.majorBrand) ||
                        box.payload.compatibleBrands.some(brand => this.canReadBrands.has(brand))
                    );
                }
                if (this.mustBePrecededByFtyp.has(box.type)) return false;
            }

            return false;
        } catch {
            return false;
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
    public getManifestJUMBF(): Uint8Array | undefined {
        return (this.getManifestStoreBox()?.payload as C2PAManifestBoxPayload | undefined)?.manifestContent;
    }

    private getManifestStoreBox(): C2PABox | undefined {
        const manifestStores = this.boxes.filter(box => box instanceof C2PABox && box.payload.purpose === 'manifest');
        return manifestStores.length === 1 ? (manifestStores[0] as C2PABox) : undefined;
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
        if (((this.getManifestStoreBox()?.payload as C2PAManifestBoxPayload)?.manifestContent.length ?? 0) === length)
            return;

        const parts: {
            position: number;
            data: Uint8Array;
            length?: number;
        }[] = [];

        let targetPosition = 0;
        let shiftAmount = 0;

        // Go through boxes, remove any existing C2PA box, and add a new one right after ftyp,
        // assembling them into a new file structure as we go. We currently only care about
        // top-level boxes. (`box.shiftPosition()` does update child boxes recursively.)
        for (let i = 0; i < this.boxes.length; i++) {
            const box = this.boxes[i];

            // Remove existing C2PABox
            if (box instanceof C2PABox) {
                shiftAmount -= box.size;
                this.boxes.splice(i, 1);
                i--;
                continue;
            }

            // Add box (and its child boxes) to new file
            parts.push({
                position: targetPosition,
                data: this.data.subarray(box.offset, box.offset + box.size),
            });
            targetPosition += box.size;
            box.shiftPosition(shiftAmount, this.data);

            // Insert new C2PABox after FileTypeBox
            if (box instanceof FileTypeBox) {
                const c2paBox = C2PABox.createManifestBox(targetPosition, length);
                this.boxes.splice(i + 1, 0, c2paBox);
                i++;
                parts.push({
                    position: targetPosition,
                    data: c2paBox.getHeader(),
                    length: c2paBox.size,
                });
                targetPosition += c2paBox.size;
                shiftAmount += c2paBox.size;
            }
        }

        this.data = this.assembleBuffer(parts);
    }

    public getHashExclusionRange(): { start: number; length: number } {
        const box = this.getManifestStoreBox();
        if (box === undefined) throw new Error('No manifest storage reserved');

        return { start: box.offset, length: box.size };
    }

    public async writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        const box = this.getManifestStoreBox();
        if (!box || (box.payload as C2PAManifestBoxPayload).manifestContent.length !== jumbf.length)
            throw new Error('Wrong amount of space in asset');

        box.fillManifestContent(this.data, jumbf);
    }
}

class BoxReader {
    private constructor() {}

    public static *read(buf: Uint8Array, offset: number, length: number) {
        let pos = offset;
        const end = offset + length;

        while (pos < end) {
            if (end - pos < 8) throw new Error('Malformed BMFF (buffer underrun)');

            let size = BinaryHelper.readUInt32(buf, pos);
            let payloadSize = size - 8;
            let payloadPos = pos + 8;

            const boxType = BinaryHelper.readString(buf, pos + 4, 4);

            if (size === 0) {
                size = end - pos;
            } else if (size === 1) {
                if (end - pos < 16) throw new Error('Malformed BMFF (buffer underrun)');

                const largeSize = BinaryHelper.readUInt64(buf, pos + 8);
                if (largeSize > Number.MAX_SAFE_INTEGER)
                    throw new Error(
                        `BMFF read error: Box sizes larger than ${Number.MAX_SAFE_INTEGER} are not supported`,
                    );

                size = Number(largeSize);
                payloadSize = size - 16;
                payloadPos += 8;
            } else if (size < 8) {
                throw new Error('Malformed BMFF (box size too small)');
            }

            if (end < pos + size) {
                throw new Error('Malformed BMFF (box length too large)');
            }

            // Handle any special box types first
            let box: Box<object>;
            if (boxType === 'ftyp') {
                box = new FileTypeBox(pos, size, payloadPos, payloadSize, boxType);
            } else if (boxType === 'meta') {
                box = new MetaBox(pos, size, payloadPos, payloadSize, boxType);
            } else if (boxType === 'iloc') {
                box = new ItemLocationBox(pos, size, payloadPos, payloadSize, boxType);
            } else if (SimpleContainerBox.boxTypes.has(boxType)) {
                box = new SimpleContainerBox(pos, size, payloadPos, payloadSize, boxType);
            } else {
                box = new Box(pos, size, payloadPos, payloadSize, boxType);
            }

            box.readContents(buf);

            // Now that the box header is fully read, we know that it might be a UUID box (== has a userType),
            // so handle those cases as well (currently only C2PABox)
            if (box.userType && BinaryHelper.bufEqual(box.userType, C2PABox.c2paUserType)) {
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
     * Shifts the position of the box by the specified number of bytes. This does not
     * actually move the data around, it only adjusts the box's properties.
     * It does, however, patch any values contained inside the box at the box's original
     * position in `buf`.
     */
    public shiftPosition(amount: number, buf: Uint8Array) {
        if (amount === 0) return;

        this.offset += amount;
        this.payloadOffset += amount;
        for (const box of this.childBoxes) box.shiftPosition(amount, buf);
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
    public static boxTypes = new Set([
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

class MetaBox extends FullBox<MetaBoxPayload> {
    public readContents(buf: Uint8Array): void {
        super.readContents(buf);
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

    public shiftPosition(amount: number, buf: Uint8Array): void {
        const dataView = new DataView(buf.buffer, this.payloadOffset);
        let pos = this.payload.version === 2 ? 6 : 4;

        for (const item of this.payload.items) {
            pos += this.payload.version === 2 ? 4 : 2; // item_ID
            if (this.payload.version > 0) pos += 2; // reserved, construction_method
            pos += 2; // data_reference_index
            if (this.payload.baseOffsetSize === 8) {
                item.baseOffset = (item.baseOffset as bigint) + BigInt(amount);
                dataView.setBigUint64(pos, item.baseOffset);
            } else if (this.payload.baseOffsetSize === 4) {
                item.baseOffset = (item.baseOffset as number) + amount;
                dataView.setUint32(pos, item.baseOffset);
            }
            pos += this.payload.baseOffsetSize;

            pos += 2; // extent_count
            for (const extent of item.extents) {
                if (this.payload.indexSize) pos += this.payload.indexSize;
                if (
                    (item.constructionMethod ?? ItemLocationConstructionMethod.file) ===
                        ItemLocationConstructionMethod.file &&
                    item.baseOffset === 0 &&
                    extent.offset !== 0
                ) {
                    if (this.payload.offsetSize === 8) {
                        extent.offset = (extent.offset as bigint) + BigInt(amount);
                        dataView.setBigUint64(pos, extent.offset);
                    } else if (this.payload.offsetSize === 4) {
                        extent.offset = (extent.offset as number) + amount;
                        dataView.setUint32(pos, extent.offset);
                    }
                }
                pos += this.payload.offsetSize;
                pos += this.payload.lengthSize;
            }
        }

        super.shiftPosition(amount, buf);
    }
}

interface C2PABoxPayload extends FullBoxPayload {
    purpose: string;
}

interface C2PAManifestBoxPayload extends C2PABoxPayload {
    purpose: 'manifest';
    merkleOffset: bigint;
    manifestContent: Uint8Array;
}

class C2PABox extends FullBox<C2PABoxPayload> {
    public static c2paUserType = [
        0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
    ];

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
            const manifestPayload: C2PAManifestBoxPayload = {
                ...this.payload,
                purpose: 'manifest',
                merkleOffset: BinaryHelper.readUInt64(buf, this.payloadOffset + purpose.bytesRead),
                manifestContent: buf.subarray(
                    this.payloadOffset + purpose.bytesRead + 8,
                    this.payloadOffset + this.payloadSize,
                ),
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

        box.userType = new Uint8Array(C2PABox.c2paUserType);
        const payload: C2PAManifestBoxPayload = {
            version: 0,
            flags: 0,
            purpose: 'manifest',
            merkleOffset: 0n,
            manifestContent: new Uint8Array(manifestLength),
        };
        box.payload = payload;

        return box;
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
     * Takes the given manifest content and writes the box payload into buf.
     */
    public fillManifestContent(buf: Uint8Array, manifest: Uint8Array): void {
        const payload = this.payload as C2PAManifestBoxPayload;
        payload.manifestContent.set(manifest);

        const dataView = new DataView(buf.buffer, this.payloadOffset, this.payloadSize);
        // Write purpose string
        payload.purpose.split('').forEach((c, i) => dataView.setUint8(i, c.charCodeAt(0)));
        // Write null terminator
        dataView.setUint8(payload.purpose.length, 0);
        // Write Merkle offset
        dataView.setBigUint64(payload.purpose.length + 1, payload.merkleOffset);
        // Write content
        buf.set(manifest, this.payloadOffset + payload.purpose.length + 9);
    }
}
