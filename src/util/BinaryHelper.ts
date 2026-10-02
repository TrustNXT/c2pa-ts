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

    /**
     * Read a synchsafe integer from 4 bytes.
     * Synchsafe integers use only 7 bits per byte (MSB is 0) to avoid
     * confusion with MP3 frame sync bytes in ID3 tags.
     * @param buf The buffer to read from
     * @param offset The offset to start reading from
     * @returns The decoded integer value
     */
    public static readSynchsafe(buf: Uint8Array, offset: number): number {
        const b1 = buf[offset];
        const b2 = buf[offset + 1];
        const b3 = buf[offset + 2];
        const b4 = buf[offset + 3];
        return (b1 << 21) | (b2 << 14) | (b3 << 7) | b4;
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
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    }

    /**
     * Write a synchsafe integer to 4 bytes.
     * Synchsafe integers use only 7 bits per byte (MSB is 0) to avoid
     * confusion with MP3 frame sync bytes in ID3 tags.
     * @param view The DataView to write to
     * @param offset The offset to start writing at
     * @param value The integer value to encode
     */
    public static writeSynchsafe(view: DataView, offset: number, value: number) {
        view.setUint8(offset + 0, (value >> 21) & 0x7f);
        view.setUint8(offset + 1, (value >> 14) & 0x7f);
        view.setUint8(offset + 2, (value >> 7) & 0x7f);
        view.setUint8(offset + 3, value & 0x7f);
    }

    /**
     * Convert CBOR byte strings to base64 for JSON representation
     * @param bytes The byte array to convert
     * @returns The base64 encoded string
     */
    public static bytesToBase64(bytes: Uint8Array): string {
        const bufferCtor = (globalThis as { Buffer?: typeof Buffer }).Buffer;
        if (bufferCtor?.from) {
            return bufferCtor.from(bytes).toString('base64');
        }
        if (typeof globalThis.btoa === 'function') {
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return globalThis.btoa(binary);
        }
        throw new Error('No base64 encoder available in this runtime');
    }

    /**
     * Convert base64 string to byte array
     * @param base64 The base64 encoded string or byte array
     * @returns The decoded byte array
     */
    public static base64ToBytes(base64: string | Uint8Array | number[]): Uint8Array {
        // If input is already a number array, convert directly to Uint8Array
        let base64String: string;
        if (Array.isArray(base64)) {
            base64String = new TextDecoder().decode(new Uint8Array(base64));
        } else if (base64 instanceof Uint8Array) {
            base64String = new TextDecoder().decode(base64);
        } else {
            base64String = base64;
        }

        const bufferCtor = (globalThis as { Buffer?: typeof Buffer }).Buffer;
        if (bufferCtor?.from) {
            return new Uint8Array(bufferCtor.from(base64String, 'base64'));
        }

        if (typeof globalThis.atob === 'function') {
            const binary = globalThis.atob(base64String);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }

        throw new Error('No base64 decoder available in this runtime');
    }

    /**
     * Convert byte array to base64url string
     * @param bytes The byte array to convert
     * @returns The base64url encoded string
     */
    public static bytesToBase64Url(bytes: Uint8Array): string {
        return BinaryHelper.bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }
}
