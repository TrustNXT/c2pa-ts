import * as bin from 'typed-binary';

export interface IBox {
    type: string;
    schema: bin.ISchema<IBox>;
    toString(prefix?: string): string;
}
