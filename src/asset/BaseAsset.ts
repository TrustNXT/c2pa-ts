export class BaseAsset {
    constructor(protected readonly data: Uint8Array) {}

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
