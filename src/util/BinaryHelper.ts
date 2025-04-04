export class BinaryHelper {
    private static readonly textDecoder = new TextDecoder();

    public static readUInt16(buf: Uint8Array, offset: number): number {
        return (buf[offset] << 8) | buf[offset + 1];
    }

    public static readUInt32(buf: Uint8Array, offset: number): number {
        return buf[offset] * 0x1000000 + ((buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]);
    }

    public static readUInt64(buf: Uint8Array, offset: number): bigint {
        const gsb = BigInt(this.readUInt32(buf, offset));
        const lsb = BigInt(this.readUInt32(buf, offset + 4));
        return lsb + 4294967296n * gsb;
    }

    public static readString(buf: Uint8Array, offset: number, length: number): string {
        return this.textDecoder.decode(buf.subarray(offset, offset + length));
    }

    public static readNullTerminatedString(
        buf: Uint8Array,
        offset: number,
        end?: number,
    ): { string: string; bytesRead: number } {
        if (typeof end === 'undefined') end = buf.length;

        let stringEnd = offset;
        while (stringEnd < end) {
            if (buf[stringEnd] == 0) {
                return {
                    string: this.textDecoder.decode(buf.subarray(offset, stringEnd)),
                    bytesRead: stringEnd - offset + 1,
                };
            }
            stringEnd++;
        }
        return {
            string: this.textDecoder.decode(buf.subarray(offset, end)),
            bytesRead: end - offset,
        };
    }

    public static bufEqual(buf1: Uint8Array | number[], buf2: Uint8Array | number[]): boolean {
        if (buf1.length != buf2.length) return false;
        for (let i = 0; i < buf1.length; i++) {
            if (buf1[i] !== buf2[i]) return false;
        }
        return true;
    }

    public static fromUUID(input: string): Uint8Array {
        input = input.replace(/-/g, '');
        const buf = new Uint8Array(Math.ceil(input.length / 2));
        for (let i = 0; i < input.length; i += 2) {
            buf[i / 2] = parseInt(input.substring(i, i + 2), 16);
        }
        return buf;
    }

    /**
     * convert bytes to their hex representation
     * @see fromHexString
     */
    public static toHexString(buf: Uint8Array): string {
        let hexString = '';
        for (const b of buf) {
            hexString += b.toString(16).padStart(2, '0');
        }
        return hexString;
    }

    /**
     * convert hex representation to bytes
     * @see toHexString
     */
    public static fromHexString(hex: string): Uint8Array {
        const bytes = hex.match(/.{1,2}/g);
        if (!bytes) throw new Error('not a valid hex string');
        return new Uint8Array(bytes.map(byte => parseInt(byte, 16)));
    }

    public static toUUIDString(buf: Uint8Array): string {
        if (buf.length != 16) {
            return `invalid UUID length=${buf.length}`;
        }

        let hexString = '';
        for (const b of buf) {
            hexString += b.toString(16).padStart(2, '0');
        }
        hexString = hexString.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
        return hexString;
    }

    public static toArrayBuffer(buf: Uint8Array): ArrayBuffer {
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
}
