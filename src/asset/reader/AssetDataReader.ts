export interface AssetDataReader {
    load(): Promise<void>;
    getDataLength(): number;
    getDataRange(start?: number, length?: number): Promise<Uint8Array>;
    getData(): Uint8Array;
    setData(data: Uint8Array): void;
}
