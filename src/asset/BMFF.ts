import { BinaryHelper } from '../util';
import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

export class BMFF extends BaseAsset implements Asset {
    /** Currently supported major brand identifiers */
    private static canReadBrands = new Set(['heic', 'mif1']);

    /** Non-exhaustive list of boxes that may not appear before a FileType box, otherwise it's not a valid file */
    private static mustBePrecededByFtyp = new Set(['free', 'mdat', 'meta', 'moof', 'moov', 'uuid']);

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
        const manifestStores = this.boxes
            .filter(box => box instanceof C2PABox && box.payload.purpose === 'manifest')
            .map(box => (box.payload as C2PAManifestBoxPayload).manifestContent);
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
}

class BoxReader {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
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
        public readonly offset: number,
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
}
