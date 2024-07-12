export interface IBox {
    type: string;
    parse(buf: Uint8Array, urlPrefix?: string): void;
    toString(prefix?: string): string;
}
