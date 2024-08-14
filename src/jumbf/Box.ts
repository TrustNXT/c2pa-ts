import * as bin from 'typed-binary';
import { IBox } from './IBox';

export class Box implements IBox {
    public readonly type: string;
    public readonly schema: bin.ISchema<Box>;

    constructor(type: string, schema: bin.ISchema<Box>) {
        this.type = type;
        this.schema = schema;
    }

    public toString(prefix?: string) {
        return `${prefix ?? ''}${this.type}`;
    }
}
