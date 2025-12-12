import * as bin from 'typed-binary';
import { BinaryHelper } from '../util';
import { GenericBoxSchema } from './GenericBoxSchema';

export class BoxReader {
    private static readonly schema = new GenericBoxSchema();
    public static readFromBuffer(buf: Uint8Array) {
        const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buf), { endianness: 'big' });
        const box = BoxReader.schema.read(reader);

        return { box, lBox: reader.currentByteOffset };
    }
}
