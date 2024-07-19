import * as bin from 'typed-binary';
import { IBox } from './IBox';

export class Box implements IBox {
    public readonly type: string;
    public readonly schema: bin.ISchema<Box>;

    constructor(type: string, schema: bin.ISchema<Box>) {
        this.type = type;
        this.schema = schema;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    public parse(buf: Uint8Array) {}

    public toString(prefix?: string | undefined) {
        return `${prefix ?? ''}${this.type}`;
    }
}
