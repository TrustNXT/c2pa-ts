export interface AssetDataReader {
    getDataLength(): number;
    getDataRange(start?: number, length?: number): Promise<Uint8Array>;
    getSyncData(): Uint8Array;
    setSyncData(data: Uint8Array): void;
}
