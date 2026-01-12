export interface AssetDataReader {
    getDataLength(): number;
    getDataRange(start?: number, length?: number): Promise<Uint8Array>;

    /**
     * Replaces a range of bytes at the given position with new data.
     * For streaming readers, this updates segments without loading the entire file.
     */
    replaceRange(position: number, data: Uint8Array): void;

    /**
     * Returns the underlying Blob, if available.
     * For BlobDataReader, this composes all segments into a single Blob using lazy references.
     */
    getBlob(): Promise<Blob | undefined>;

    /**
     * Writes the reader's data to a WHATWG WritableStream.
     * This is the preferred method for large files as it avoids loading everything into memory.
     *
     * @param stream The WritableStream to write to
     */
    writeToStream(stream: WritableStream<Uint8Array>): Promise<void>;

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
    /** Explicit data to include at this position */
    data?: Uint8Array;
    /** Total length to reserve. If data is shorter, remaining space is zero-filled */
    length?: number;
    /** Reference to source reader data at this offset (for lazy blob slicing) */
    sourceOffset?: number;
}
