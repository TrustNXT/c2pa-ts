import { BinaryHelper } from '../util/BinaryHelper';
import { BaseAsset } from './BaseAsset';
import { AssemblePart } from './reader/AssetDataReader';
import { createReader } from './reader/createReader';
import { Asset, AssetSource } from './types';

interface JUMBFHeader {
    boxInstance: number;
    sequenceNumber: number;
    lBox: number;
    buf: Uint8Array;
}

interface JUMBFParseState {
    currentBoxInstance?: number;
    currentSequence?: number;
    jumbfLength?: number;
    manifestSegments?: { segmentIndex: number; skipBytes: number }[];
}

class Segment {
    public get payloadOffset() {
        return this.length >= 4 ? this.offset + 4 : this.offset + 2;
    }
    public get payloadLength() {
        return this.length >= 4 ? this.length - 4 : 0;
    }

    constructor(
        public offset: number,
        public readonly length: number,
        public readonly type: number,
    ) {}

    public getSubBuffer(buf: Uint8Array) {
        return buf.subarray(this.payloadOffset, this.payloadOffset + this.payloadLength);
    }
}

export class JPEG extends BaseAsset implements Asset {
    public readonly mimeType = 'image/jpeg';

    private static readonly jpegSignature = new Uint8Array([0xff, 0xd8]);

    private segments: Segment[] = [];
    private manifestSegments?: { segmentIndex: number; skipBytes: number }[];

    private constructor(source: AssetSource) {
        super(source);
    }

    public static async create(source: AssetSource): Promise<JPEG> {
        const asset = new JPEG(source);
        const header = await asset.reader.getDataRange(0, JPEG.jpegSignature.length);
        if (!JPEG.hasSignature(header)) throw new Error('Not a JPEG file');
        await asset.parse();
        return asset;
    }

    public static async canRead(source: AssetSource): Promise<boolean> {
        const reader = createReader(source);
        const header = await reader.getDataRange(0, JPEG.jpegSignature.length);
        return JPEG.hasSignature(header);
    }

    private static hasSignature(buf: Uint8Array): boolean {
        return (
            buf.length >= JPEG.jpegSignature.length &&
            BinaryHelper.bufEqual(buf.subarray(0, JPEG.jpegSignature.length), JPEG.jpegSignature)
        );
    }

    private async parse(): Promise<void> {
        const data = await this.reader.getDataRange();
        this.segments = Array.from(this.readSegments(data));
        this.manifestSegments = this.findJUMBFSegments(data);
    }

    public dumpInfo() {
        return [
            'JPEG file:',
            ...this.segments.map(s => `Segment of type ${s.type.toString(16)} (payload length: ${s.payloadLength})`),
        ].join('\n');
    }

    private *readSegments(data: Uint8Array) {
        let pos = 2;

        while (true) {
            if (pos + 2 > data.length) {
                throw new Error('Malformed JPEG (buffer underrun before end marker)');
            }

            if (data[pos] !== 0xff) {
                throw new Error('Malformed JPEG (invalid marker)');
            }
            const type = data[pos + 1];

            let length: number;

            if (type === 0xda) {
                length = 2;
            } else {
                if (pos + 4 > data.length) {
                    throw new Error('Malformed JPEG (buffer underrun during length scan)');
                }

                length = BinaryHelper.readUInt16(data, pos + 2) + 2;
            }

            yield new Segment(pos, length, type);

            if (type === 0xda) {
                // Stop after start of scan
                break;
            }

            pos += length;
        }
    }

    private getJUMBFHeader(segment: Segment, data: Uint8Array) {
        if (segment.type !== 0xeb) return null;
        if (segment.payloadLength < 16) return null;

        const buf = segment.getSubBuffer(data);
        if (buf[0] !== 0x4a || buf[1] !== 0x50) return null;

        const tBox = BinaryHelper.readString(buf, 12, 4);
        if (tBox !== 'jumb') return null;

        return {
            boxInstance: BinaryHelper.readUInt16(buf, 2),
            sequenceNumber: BinaryHelper.readUInt32(buf, 4),
            lBox: BinaryHelper.readUInt32(buf, 8),
            buf,
        };
    }

    private isC2PAStore(buf: Uint8Array, sequenceNumber: number): boolean {
        // First inside the superbox should be a jumd box – check if it's a valid c2pa descriptor
        const jumdLBox = BinaryHelper.readUInt32(buf, 16);
        if (jumdLBox < 17) return false; // Must be at least 4 bytes LBox + 4 bytes TBox + 8 bytes UUID + 1 byte toggles
        const jumdTBox = BinaryHelper.readString(buf, 20, 4);
        if (jumdTBox !== 'jumd') return false;
        const jumdMarker = BinaryHelper.readString(buf, 24, 4);
        if (jumdMarker !== 'c2pa') return false; // Only check first 4 bytes of UUID here, they all start with 'c2pa'

        if (sequenceNumber !== 1) {
            // Sequence does not start with 1
            return false;
        }

        return true;
    }

    private findJUMBFSegments(data: Uint8Array): typeof this.manifestSegments {
        const state: JUMBFParseState = {};

        for (let i = 0; i < this.segments.length; i++) {
            const header = this.getJUMBFHeader(this.segments[i], data);
            if (!header) continue;

            if (!this.processJumbfSegment(state, header, i)) {
                return undefined;
            }
        }

        if (!state.manifestSegments || state.manifestSegments.length === 0) return undefined;

        // Does the length of the combined payloads match the expected total JUMBF length?
        if (this.getJUMBFLength(state.manifestSegments) !== state.jumbfLength) return undefined;

        return state.manifestSegments;
    }

    private processJumbfSegment(state: JUMBFParseState, header: JUMBFHeader, index: number): boolean {
        if (header.boxInstance === state.currentBoxInstance) {
            // This is a continuation of the previous segment
            if (
                state.currentSequence !== undefined &&
                header.sequenceNumber === state.currentSequence + 1 && // Out of order sequence number
                header.lBox === state.jumbfLength // Length mismatch between segments
            ) {
                state.manifestSegments!.push({ segmentIndex: index, skipBytes: 16 });
                state.currentSequence = header.sequenceNumber;
            } else {
                // Malformed content – ignore and start over
                state.currentBoxInstance = undefined;
                state.currentSequence = undefined;
                state.manifestSegments = [];
            }
            return true;
        }

        // We found a superbox!
        // Check if box is too short to be useful (<= 8)
        if (header.lBox > 8 && this.isC2PAStore(header.buf, header.sequenceNumber)) {
            if (state.manifestSegments) {
                // There was already a valid manifest store started before. If there are multiple stores in an asset,
                // according to C2PA spec they should be treated as invalid and missing.
                return false;
            }

            state.currentBoxInstance = header.boxInstance;
            state.currentSequence = header.sequenceNumber;
            state.jumbfLength = header.lBox;
            state.manifestSegments = [{ segmentIndex: index, skipBytes: 8 }];
        }

        return true;
    }

    private getJUMBFLength(manifestSegments: typeof this.manifestSegments): number {
        return (
            manifestSegments?.reduce(
                (acc, cur) => acc + this.segments[cur.segmentIndex].payloadLength - cur.skipBytes,
                0,
            ) ?? 0
        );
    }

    /**
     * Extracts the manifest store in raw JUMBF format from JPEG XT style APP11 segments.
     */
    public async getManifestJUMBF(): Promise<Uint8Array | undefined> {
        if (!this.manifestSegments) return undefined;

        const jumbfLength = this.getJUMBFLength(this.manifestSegments);
        const jumbfBuffer = new Uint8Array(jumbfLength);

        let offset = 0;
        for (const segmentRef of this.manifestSegments) {
            const segment = this.segments[segmentRef.segmentIndex];
            const segmentData = await this.getDataRange(segment.payloadOffset, segment.payloadLength);
            jumbfBuffer.set(segmentData.subarray(segmentRef.skipBytes), offset);
            offset += segment.payloadLength - segmentRef.skipBytes;
        }

        return jumbfBuffer;
    }

    public async ensureManifestSpace(length: number): Promise<void> {
        // Nothing to do?
        if (this.getJUMBFLength(this.manifestSegments) === length) return;

        const maxPayloadSize = 0xffff - 4;

        const lastSegment = this.segments[this.segments.length - 1];
        const originalEndOfLastSegment = lastSegment.offset + lastSegment.length;

        // Remove any existing manifest segments
        if (this.manifestSegments) {
            this.segments = this.segments.filter((_, i) => !this.manifestSegments?.some(s => s.segmentIndex === i));
        }

        // Put the new APP11 segments after the APP0 segment – or at the beginning as a fallback
        let newSegmentIndex = this.segments.findIndex(s => s.type === 0xe0) + 1;
        this.manifestSegments = [];

        // Insert new manifest segment stubs
        let remainingLengthNeeded = length;
        while (remainingLengthNeeded > 0) {
            // The first 8 bytes of the JUMBF header are copied over to the beginning of each manifest segment,
            // so any segments after the first one hold 8 bytes less payload
            const headerLength = this.manifestSegments.length === 0 ? 8 : 16;

            const segmentPayloadLength = Math.min(remainingLengthNeeded + headerLength, maxPayloadSize);

            const newSegment = new Segment(0, segmentPayloadLength + 4, 0xeb);
            this.segments.splice(newSegmentIndex, 0, newSegment);

            this.manifestSegments.push({ segmentIndex: newSegmentIndex, skipBytes: headerLength });
            newSegmentIndex++;
            remainingLengthNeeded -= segmentPayloadLength - headerLength;
        }

        const parts: AssemblePart[] = [{ position: 0, data: new Uint8Array([0xff, 0xd8]) }];

        // Go through all segments, update their positions, and gather payload for the new JPEG
        let targetPosition = 2;
        let sequence = 1;
        for (let i = 0; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const segOffset = segment.offset;

            if (this.manifestSegments.some(s => s.segmentIndex === i)) {
                // This is a newly created segment, write its header
                const data = new Uint8Array(12);
                const dv = new DataView(data.buffer);
                dv.setUint8(0, 0xff);
                dv.setUint8(1, segment.type);
                dv.setUint16(2, segment.length - 2);
                dv.setUint16(4, 0x4a50); // Common Identifier
                dv.setUint16(6, 0x0211); // Instance Number – just needs to be non-conflicting; this is what other implementations use
                dv.setUint32(8, sequence++);
                segment.offset = targetPosition;
                parts.push({ position: targetPosition, data, length: segment.length });
            } else {
                segment.offset = targetPosition;
                parts.push(this.sourceRef(targetPosition, segOffset, segment.length));
            }
            targetPosition += segment.length;
        }

        // Append remainder of original image data
        const remainderLength = this.getDataLength() - originalEndOfLastSegment;
        if (remainderLength > 0) {
            parts.push(this.sourceRef(targetPosition, originalEndOfLastSegment, remainderLength));
        }

        this.assembleAsset(parts);
    }

    public getHashExclusionRange(): { start: number; length: number } {
        if (!this.manifestSegments) throw new Error('No manifest storage reserved');

        const segments = this.manifestSegments.map(s => this.segments[s.segmentIndex]);
        const start = segments[0].offset;
        const end = segments[segments.length - 1].offset + segments[segments.length - 1].length;
        return { start, length: end - start };
    }

    public async writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        if (this.getJUMBFLength(this.manifestSegments) !== jumbf.length)
            throw new Error('Wrong amount of space in asset');

        let jumbfOffset = 0;
        for (const segmentRef of this.manifestSegments!) {
            const segment = this.segments[segmentRef.segmentIndex];
            const payloadLength = segment.payloadLength;

            // Read existing payload to preserve the JP header bytes (0-7)
            const payloadData = await this.getDataRange(segment.payloadOffset, payloadLength);

            // Continuation segments start with JUMBF header duplicate
            if (segmentRef.skipBytes > 8) {
                payloadData.set(jumbf.subarray(0, segmentRef.skipBytes - 8), 8);
            }

            const contentLength = payloadLength - segmentRef.skipBytes;
            payloadData.set(jumbf.subarray(jumbfOffset, jumbfOffset + contentLength), segmentRef.skipBytes);
            jumbfOffset += contentLength;

            this.replaceRange(segment.payloadOffset, payloadData);
        }
    }
}
