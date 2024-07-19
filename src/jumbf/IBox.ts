import * as bin from 'typed-binary';

export interface IBox {
    type: string;
    schema: bin.ISchema<IBox>;
    parse(buf: Uint8Array, urlPrefix?: string): void;
    toString(prefix?: string): string;
}
