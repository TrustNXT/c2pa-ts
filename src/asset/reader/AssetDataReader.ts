export interface AssetDataReader {
    load(): Promise<void>;
    getDataLength(): number;
    getDataRange(start?: number, length?: number): Promise<Uint8Array>;
    getData(): Uint8Array;
    /**
     * Sets the synchronous data, if supported
     */
    setData(data: Uint8Array): void;

    /**
     * Returns the underlying Blob, if available
     */
    getBlob(): Blob | undefined;

    /**
     * Assembles a new reader based on a list of parts with an optional source buffer.
     * Each part has a target position and an optional data source.
     */
    assemble(parts: { position: number; data?: Uint8Array; length?: number }[]): AssetDataReader;
}
