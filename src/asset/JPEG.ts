import { BinaryHelper } from '../util/BinaryHelper';
import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

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
    private segments: Segment[];
    private manifestSegments?: { segmentIndex: number; skipBytes: number }[];

    constructor(data: Uint8Array) {
        super(data);
        if (!JPEG.canRead(data)) throw new Error('Not a JPEG file');
        this.segments = Array.from(this.readSegments());
        this.manifestSegments = this.findJUMBFSegments();
    }

    public static canRead(buf: Uint8Array): boolean {
        return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
    }

    public dumpInfo() {
        return [
            'JPEG file:',
            ...this.segments.map(s => `Segment of type ${s.type.toString(16)} (payload length: ${s.payloadLength})`),
        ].join('\n');
    }

    private *readSegments() {
        let pos = 2;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (pos + 2 > this.data.length) {
                throw new Error('Malformed JPEG (buffer underrun before end marker)');
            }

            if (this.data[pos] !== 0xff) {
                throw new Error('Malformed JPEG (invalid marker)');
            }
            const type = this.data[pos + 1];

            let length: number;

            if (type === 0xda) {
                // Start of scan
                length = 2;
            } else {
                if (pos + 4 > this.data.length) {
                    throw new Error('Malformed JPEG (buffer underrun during length scan)');
                }

                length = BinaryHelper.readUInt16(this.data, pos + 2) + 2;
            }

            yield new Segment(pos, length, type);

            if (type === 0xda) {
                // Stop after start of scan
                break;
            }

            pos += length;
        }
    }

    private findJUMBFSegments(): typeof this.manifestSegments {
        let currentBoxInstance: number | undefined;
        let currentSequence: number | undefined;
        let jumbfLength: number | undefined;

        let manifestSegments: typeof this.manifestSegments;

        for (let i = 0; i < this.segments.length; i++) {
            const segment = this.segments[i];
            if (segment.type !== 0xeb) continue;
            if (segment.payloadLength < 16) continue;

            const buf = segment.getSubBuffer(this.data);
            if (buf[0] !== 0x4a || buf[1] !== 0x50) continue;

            const boxInstance = BinaryHelper.readUInt16(buf, 2);
            const sequenceNumber = BinaryHelper.readUInt32(buf, 4);
            const lBox = BinaryHelper.readUInt32(buf, 8);
            const tBox = BinaryHelper.readString(buf, 12, 4);
            if (tBox !== 'jumb') continue;

            if (boxInstance === currentBoxInstance) {
                // This is a continuation of the previous segment
                if (
                    currentSequence === undefined ||
                    sequenceNumber !== currentSequence + 1 || // Out of order sequence number
                    lBox !== jumbfLength // Length mismatch between segments
                ) {
                    // Malformed content – ignore and start over
                    currentBoxInstance = undefined;
                    currentSequence = undefined;
                    manifestSegments = [];
                    continue;
                }

                if (!manifestSegments) {
                    throw new Error('Manifest continuation without start. This should never happen.');
                }
                manifestSegments.push({ segmentIndex: i, skipBytes: 16 });
                currentSequence = sequenceNumber;

                continue;
            }

            // We found a superbox!
            if (lBox <= 8) {
                // Box is too short to be useful
                continue;
            }

            // First inside the superbox should be a jumd box – check if it's a valid c2pa descriptor
            const jumdLBox = BinaryHelper.readUInt32(buf, 16);
            if (jumdLBox < 17) continue; // Must be at least 4 bytes LBox + 4 bytes TBox + 8 bytes UUID + 1 byte toggles
            const jumdTBox = BinaryHelper.readString(buf, 20, 4);
            if (jumdTBox !== 'jumd') continue;
            const jumdMarker = BinaryHelper.readString(buf, 24, 4);
            if (jumdMarker !== 'c2pa') continue; // Only check first 4 bytes of UUID here, they all start with 'c2pa'

            if (sequenceNumber !== 1) {
                // Sequence does not start with 1
                continue;
            }

            if (manifestSegments) {
                // There was already a valid manifest store started before. If there are multiple stores in an asset,
                // according to C2PA spec they should be treated as invalid and missing.
                return undefined;
            }

            currentBoxInstance = boxInstance;
            currentSequence = sequenceNumber;
            jumbfLength = lBox;
            manifestSegments = [{ segmentIndex: i, skipBytes: 8 }];
        }

        if (!manifestSegments) return undefined;

        // Does the length of the combined payloads match the expected total JUMBF length?
        if (this.getJUMBFLength(manifestSegments) !== jumbfLength) return undefined;

        return manifestSegments;
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
    public getManifestJUMBF(): Uint8Array | undefined {
        if (!this.manifestSegments) return undefined;

        const jumbfLength = this.getJUMBFLength(this.manifestSegments);
        const jumbfBuffer = new Uint8Array(jumbfLength);

        let offset = 0;
        for (const segment of this.manifestSegments) {
            const payload = this.segments[segment.segmentIndex].getSubBuffer(this.data).subarray(segment.skipBytes);
            jumbfBuffer.set(payload, offset);
            offset += payload.length;
        }

        return jumbfBuffer;
    }

    public async ensureManifestSpace(length: number): Promise<void> {
        if (this.getJUMBFLength(this.manifestSegments) === length) return;

        const maxPayloadSize = 0xffff - 4;

        // Build a new list of segments (and their original location if applicable), removing all existing manifest
        // segments in the process and adding the new ones
        const newSegments: {
            segment: Segment;
            originalOffset?: number;
            sequence?: number;
        }[] = [];

        // Put the new APP11 segments after the APP0 segment – or at the beginning as a fallback
        const newSegmentsIndex = this.segments.findIndex(s => s.type === 0xe0) + 1;
        const newManifestSegments: typeof this.manifestSegments = [];

        let shiftAmount = 0;

        for (let i = 0; i < this.segments.length; i++) {
            const segment = this.segments[i];

            if (i === newSegmentsIndex) {
                // This is where the new APP11 segments go
                let remainingLengthNeeded = length;
                let pos = segment.offset;
                let sequence = 1;
                while (remainingLengthNeeded > 0) {
                    // The first 8 bytes of the JUMBF header are copied over to the beginning of each APP11 segment,
                    // so any segments after the first one hold 8 bytes less payload
                    const headerLength = sequence === 1 ? 8 : 16;

                    const segmentPayloadLength = Math.min(remainingLengthNeeded + headerLength, maxPayloadSize);

                    const newSegment = new Segment(pos, segmentPayloadLength + 4, 0xeb);
                    newSegments.push({ segment: newSegment, sequence });

                    newManifestSegments.push({
                        segmentIndex: newSegments.length - 1,
                        skipBytes: headerLength,
                    });

                    sequence++;
                    pos += newSegment.length;
                    shiftAmount += newSegment.length;
                    remainingLengthNeeded -= segmentPayloadLength - headerLength;
                }
            }

            if (this.manifestSegments?.some(s => s.segmentIndex === i)) {
                // Is this one of the existing manifest segments? Splice it out
                shiftAmount -= segment.length;
            } else {
                // Otherwise, keep it and shift position as needed
                newSegments.push({ segment: segment, originalOffset: segment.offset });
                segment.offset += shiftAmount;
            }
        }

        // Assemble the new file based on the list of segments
        const newData = new Uint8Array(this.data.length + shiftAmount);
        newData[0] = 0xff;
        newData[1] = 0xd8;

        for (const segment of newSegments) {
            if (segment.originalOffset) {
                // This is a segment copied from the original file, copy it over entirely
                newData.set(
                    this.data.subarray(segment.originalOffset, segment.originalOffset + segment.segment.length),
                    segment.segment.offset,
                );
            } else {
                // This is a newly created segment, write its header
                const dataView = new DataView(newData.buffer, segment.segment.offset, segment.segment.length);
                dataView.setUint8(0, 0xff);
                dataView.setUint8(1, segment.segment.type);
                dataView.setUint16(2, segment.segment.length - 2);
                dataView.setUint16(4, 0x4a50); // Common Identifier
                dataView.setUint16(6, 0x0211); // Instance Number – just needs to be non-conflicting; this is what other implementations use
                dataView.setUint32(8, segment.sequence!);
            }
        }

        // Fill buffer with remainder of original image data
        const lastSegment = newSegments[newSegments.length - 1];
        newData.set(
            this.data.subarray(lastSegment.originalOffset! + lastSegment.segment.length),
            lastSegment.segment.offset + lastSegment.segment.length,
        );

        this.segments = newSegments.map(s => s.segment);
        this.manifestSegments = newManifestSegments;
        this.data = newData;
    }

    public async writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        // For JPEG, the segments' payload length needs to match the JUMBF length exactly
        if (this.getJUMBFLength(this.manifestSegments) !== jumbf.length)
            throw new Error('Wrong amount of space in asset');

        let offset = 0;
        for (const segmentReference of this.manifestSegments!) {
            const segment = this.segments[segmentReference.segmentIndex];
            const payload = segment.getSubBuffer(this.data);

            // Continuation segments also start with the beginning of the JUMBF header
            if (segmentReference.skipBytes > 8) {
                payload.set(jumbf.subarray(0, segmentReference.skipBytes - 8), 8);
            }

            payload.set(
                jumbf.subarray(offset, offset + segment.payloadLength - segmentReference.skipBytes),
                segmentReference.skipBytes,
            );
            offset += segment.payloadLength - segmentReference.skipBytes;
        }
    }
}
