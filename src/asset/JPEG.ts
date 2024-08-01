import { BinaryHelper } from '../util/BinaryHelper';
import { BaseAsset } from './BaseAsset';
import { Asset } from './types';

class Segment {
    public readonly payloadOffset: number;
    public readonly payloadLength: number;

    constructor(
        public readonly offset: number,
        public readonly length: number,
        public readonly type: number,
    ) {
        if (length >= 4) {
            this.payloadOffset = offset + 4;
            this.payloadLength = length - 4;
        } else {
            this.payloadOffset = offset + 2;
            this.payloadLength = 0;
        }
    }

    public getSubBuffer(buf: Uint8Array) {
        return buf.subarray(this.payloadOffset, this.payloadOffset + this.payloadLength);
    }
}

export class JPEG extends BaseAsset implements Asset {
    private segments: Segment[];

    constructor(data: Uint8Array) {
        super(data);
        if (!JPEG.canRead(data)) throw new Error('Not a JPEG file');
        this.segments = Array.from(this.readSegments());
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

    /**
     * Extracts the manifest store in raw JUMBF format from JPEG XT style APP11 segments.
     */
    public getManifestJUMBF(): Uint8Array | undefined {
        let currentBoxInstance: number | undefined;
        let currentSequence: number | undefined;
        let jumbfBuffer: Uint8Array | undefined;
        let jumbfLength: number | undefined;
        let jumbfOffset = 0;

        this.segments
            .filter(s => s.type === 0xeb && s.payloadLength >= 16)
            .forEach(segment => {
                const buf = segment.getSubBuffer(this.data);
                if (buf[0] !== 0x4a || buf[1] !== 0x50) return;

                const boxInstance = BinaryHelper.readUInt16(buf, 2);
                const sequenceNumber = BinaryHelper.readUInt32(buf, 4);
                const lBox = BinaryHelper.readUInt32(buf, 8);
                const tBox = BinaryHelper.readString(buf, 12, 4);
                if (tBox !== 'jumb') return;

                if (boxInstance === currentBoxInstance) {
                    // This is a continuation of the previous segment
                    if (
                        currentSequence === undefined ||
                        sequenceNumber !== currentSequence + 1 || // Out of order sequence number
                        lBox !== jumbfLength || // Length mismatch between segments
                        buf.length - 16 > jumbfLength - jumbfOffset // Segment too long
                    ) {
                        // Malformed content – ignore and start over
                        currentBoxInstance = undefined;
                        currentSequence = undefined;
                        jumbfBuffer = undefined;
                        return;
                    }

                    if (jumbfBuffer === undefined) {
                        // We reached this point but there is no JUMBF buffer to fill – this should not happen
                        throw new Error('Internal error (JUMBF buffer not created)');
                    }

                    jumbfBuffer.set(buf.subarray(16), jumbfOffset);
                    jumbfOffset += buf.length - 16;
                    currentSequence = sequenceNumber;

                    return;
                }

                // We found a superbox!
                if (lBox <= 8) {
                    // Box is too short to be useful
                    return;
                }

                // First inside the superbox should be a jumd box – check if it's a valid c2pa descriptor
                const jumdLBox = BinaryHelper.readUInt32(buf, 16);
                if (jumdLBox < 17) return; // Must be at least 4 bytes LBox + 4 bytes TBox + 8 bytes UUID + 1 byte toggles
                const jumdTBox = BinaryHelper.readString(buf, 20, 4);
                if (jumdTBox !== 'jumd') return;
                const jumdMarker = BinaryHelper.readString(buf, 24, 4);
                if (jumdMarker !== 'c2pa') return; // Only check first 4 bytes of UUID here, they all start with 'c2pa'

                if (sequenceNumber !== 1) {
                    // Sequence does not start with 1
                    return;
                }

                if (jumbfBuffer !== undefined) {
                    // There was already a valid manifest store started before. If there are multiple stores in an asset,
                    // according to C2PA spec they should be treated as invalid and missing.
                    return undefined;
                }

                currentBoxInstance = boxInstance;
                currentSequence = sequenceNumber;
                jumbfLength = lBox;
                jumbfBuffer = new Uint8Array(jumbfLength);
                jumbfBuffer.set(buf.subarray(8));
                jumbfOffset = buf.length - 8;
            });

        if (jumbfBuffer !== undefined && jumbfOffset === jumbfLength) {
            return jumbfBuffer;
        }

        return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public ensureManifestSpace(length: number): Promise<void> {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    writeManifestJUMBF(jumbf: Uint8Array): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
