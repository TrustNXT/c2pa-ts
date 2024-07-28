import { BinaryHelper } from '../util';
import { Box } from './Box';
import { C2PASaltBox } from './C2PASaltBox';
import { CBORBox } from './CBORBox';
import { CodestreamBox } from './CodestreamBox';
import { DescriptionBox } from './DescriptionBox';
import { EmbeddedFileBox } from './EmbeddedFileBox';
import { EmbeddedFileDescriptionBox } from './EmbeddedFileDescriptionBox';
import { IBox } from './IBox';
import { JSONBox } from './JSONBox';
import { fallback } from './schemata';
import { SuperBox } from './SuperBox';
import { UUIDBox } from './UUIDBox';

export class BoxReader {
    private static readonly HEADER_LENGTH = 8;

    public static readFromBuffer(buf: Uint8Array, urlPrefix?: string) {
        if (buf.length < this.HEADER_LENGTH) {
            throw new Error('JUMBFBox: Data too short');
        }

        // LBox: Box length including LBox itself
        const lBox = BinaryHelper.readUInt32(buf, 0);
        if (lBox > buf.length || lBox < 8) {
            // There are special (low) values for LBox but we don't support them
            throw new Error('JUMBFBox: Invalid box length');
        }

        const tBox = BinaryHelper.readString(buf, 4, 4);
        const box = this.createBox(tBox);

        box.parse(buf.subarray(this.HEADER_LENGTH, lBox), urlPrefix);
        return { box, lBox };
    }

    private static createBox(boxType: string): IBox {
        switch (boxType) {
            case SuperBox.typeCode:
                return new SuperBox();
            case DescriptionBox.typeCode:
                return new DescriptionBox();
            case C2PASaltBox.typeCode:
                return new C2PASaltBox();
            case CBORBox.typeCode:
                return new CBORBox();
            case CodestreamBox.typeCode:
                return new CodestreamBox();
            case EmbeddedFileBox.typeCode:
                return new EmbeddedFileBox();
            case EmbeddedFileDescriptionBox.typeCode:
                return new EmbeddedFileDescriptionBox();
            case JSONBox.typeCode:
                return new JSONBox();
            case UUIDBox.typeCode:
                return new UUIDBox();
            default:
                return new Box(boxType, fallback);
        }
    }
}
