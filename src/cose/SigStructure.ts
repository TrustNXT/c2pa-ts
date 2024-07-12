import cbor from 'cbor-js';

export class SigStructure {
    public readonly externalAAD: Uint8Array = new Uint8Array(0);

    constructor(
        public context: 'Signature1' | 'CounterSignature',
        public protectedBucket: Uint8Array,
        public payload: Uint8Array,
    ) {}

    public encode(): Uint8Array {
        return new Uint8Array(cbor.encode([this.context, this.protectedBucket, this.externalAAD, this.payload]));
    }
}
