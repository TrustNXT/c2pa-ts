import { AssetSource } from '../types';
import { AssetDataReader } from './AssetDataReader';
import { BlobDataReader } from './BlobDataReader';
import { BufferDataReader } from './BufferDataReader';

export function createReader(source: AssetSource): AssetDataReader {
    if (source instanceof Blob) return BlobDataReader.fromBlob(source);
    return new BufferDataReader(source);
}
