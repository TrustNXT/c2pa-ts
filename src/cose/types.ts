import * as pkijs from 'pkijs';

export interface TstContainer {
    tstTokens: {
        val: Uint8Array;
    }[];
}

export interface HeaderBucket {
    [key: string]: unknown;
    '1'?: number; // alg
    '33'?: Uint8Array[] | Uint8Array; // x5chain
    x5chain?: Uint8Array[] | Uint8Array; // legacy named x5chain
    sigTst?: TstContainer;
    sigTst2?: TstContainer;
    rVals?: {
        ocspVals?: Uint8Array[];
    };
}

export type ProtectedBucket = HeaderBucket;

export type UnprotectedBucket = HeaderBucket & {
    pad?: Uint8Array;
};

export type CoseSignature = [
    Uint8Array, // Protected bucket (CBOR encoded)
    UnprotectedBucket,
    Uint8Array | null, // External AAD
    Uint8Array, // Signature
];

export enum AdditionalEKU {
    any = '2.5.29.37.0',
    documentSigning = '1.3.6.1.5.5.7.3.36',
}

export enum TimestampVersion {
    V1 = 1,
    V2 = 2,
}

export interface TimestampToken {
    response: pkijs.TimeStampResp;
    version: TimestampVersion;
}
