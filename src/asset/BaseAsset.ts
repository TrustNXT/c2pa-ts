/**
 * Base class for an asset based on a Uint8Array as its data buffer.
 */
export abstract class BaseAsset {
    constructor(protected data: Uint8Array) {}

    public getDataLength(): number {
        return this.data.length;
    }

    public async getDataRange(start?: number, length?: number): Promise<Uint8Array> {
        if (start === undefined) {
            return this.data;
        }
        if (length === undefined) {
            return this.data.subarray(start);
        }
        length = Math.min(length, this.data.length - start);
        return this.data.subarray(start, start + length);
    }

    /**
     * Assembles a data buffer based on a list of parts with an optional source buffer.
     * Each part has a target position and an optional data source. If there should be space left in the resulting
     * buffer for more bytes than the provided data source, or no data source is provided, a length can also
     * be specified.
     */
    protected assembleBuffer(parts: { position: number; data?: Uint8Array; length?: number }[]): Uint8Array {
        const totalLength = parts.reduce(
            (acc, cur) => Math.max(acc, cur.position + (cur.length ?? cur.data?.length ?? 0)),
            0,
        );
        const result = new Uint8Array(totalLength);

        for (const part of parts) {
            if (part.data) {
                result.set(part.data, part.position);
            }
        }
        return result;
    }
}
