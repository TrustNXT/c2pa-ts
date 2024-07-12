import { IBox } from './IBox';

export class Box implements IBox {
    public readonly type: string;

    constructor(type: string) {
        this.type = type;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    public parse(buf: Uint8Array) {}

    public toString(prefix?: string | undefined) {
        return `${prefix ?? ''}${this.type}`;
    }
}
