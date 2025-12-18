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
     * Each part has a target position and an optional data source. If there should be space left in the resulting
     * buffer for more bytes than the provided data source, or no data source is provided, a length can also
     * be specified.
     */
    assemble(parts: AssemblePart[]): AssetDataReader;
}

export interface AssemblePart {
    position: number;
    data?: Uint8Array;
    length?: number;
}
