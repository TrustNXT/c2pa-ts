/**
 * Base class for an asset based on a Uint8Array as its data buffer.
 */
export abstract class BaseAsset {
    constructor(protected data: Uint8Array) {}

    public getDataLength(): number {
        return this.data.length;
    }

    public async getDataRange(start?: number | undefined, length?: number | undefined): Promise<Uint8Array> {
        if (start === undefined) {
            return this.data;
        }
        if (length === undefined) {
            return this.data.subarray(start);
        }
        length = Math.min(length, this.data.length - start);
        return this.data.subarray(start, start + length);
    }
}
