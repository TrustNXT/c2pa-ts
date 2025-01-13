import { BinaryHelper } from '../util';
import { DataSourceType, ReviewCode, ValidationStatusCode } from './types';

export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512';

export interface HashedURI {
    alg?: HashAlgorithm;
    hash: Uint8Array;
    url: string;
}

export interface ClaimGeneratorInfo {
    name: string;
    version?: string;
    icon?: HashedURI;
    operating_system?: string;
}

export interface Claim {
    alg?: HashAlgorithm;
    alg_soft?: string;
    redacted_assertions?: HashedURI[];
    instanceID: string;
    'dc:title'?: string;
    signature: string;
    metadata?: AssertionMetadataMap;
}

export type ClaimV1 = Claim & {
    claim_generator: string;
    claim_generator_info: ClaimGeneratorInfo[];
    'dc:format': string;
    assertions: HashedURI[];
};

export type ClaimV2 = Claim & {
    claim_generator_info: ClaimGeneratorInfo;
    created_assertions: HashedURI[];
    gathered_assertions?: HashedURI[];
    redacted_assertions?: HashedURI[];
};

export const UUIDs = {
    manifestStore: BinaryHelper.fromUUID('63327061-0011-0010-8000-00AA00389B71'),
    manifest: BinaryHelper.fromUUID('63326D61-0011-0010-8000-00AA00389B71'),
    updateManifest: BinaryHelper.fromUUID('6332756D-0011-0010-8000-00AA00389B71'),
    compressedManifest: BinaryHelper.fromUUID('6332636D-0011-0010-8000-00AA00389B71'),
    compressedBox: BinaryHelper.fromUUID('62726F62-0011-0010-8000-00AA00389B71'),
    assertionStore: BinaryHelper.fromUUID('63326173-0011-0010-8000-00AA00389B71'),
    jsonAssertion: BinaryHelper.fromUUID('6A736F6E-0011-0010-8000-00AA00389B71'),
    cborAssertion: BinaryHelper.fromUUID('63626F72-0011-0010-8000-00AA00389B71'),
    ingredientStore: BinaryHelper.fromUUID('63616973-0011-0010-8000-00AA00389B71'),
    codestreamAssertion: BinaryHelper.fromUUID('6579D6FB-DBA2-446B-B2AC-1B82FEEB89D1'),
    ingredient: BinaryHelper.fromUUID('6361696E-0011-0010-8000-00AA00389B71'),
    claim: BinaryHelper.fromUUID('6332636C-0011-0010-8000-00AA00389B71'),
    signature: BinaryHelper.fromUUID('63326373-0011-0010-8000-00AA00389B71'),
    embeddedFile: BinaryHelper.fromUUID('40CB0C32-BB8A-489D-A70B-2AD6F47F4369'),
    embeddedFileDescription: BinaryHelper.fromUUID('62666462-0011-0010-8000-00AA00389B71'),
    embeddedFileData: BinaryHelper.fromUUID('62696462-0011-0010-8000-00AA00389B71'),
    verifiableCredentialsStore: BinaryHelper.fromUUID('63327663-0011-0010-8000-00AA00389B71'),
    uuidAssertion: BinaryHelper.fromUUID('75756964-0011-0010-8000-00AA00389B71'),
    databoxesStore: BinaryHelper.fromUUID('63326462-0011-0010-8000-00AA00389B71'),
};

export interface StatusMap {
    code: ValidationStatusCode;
    url?: string;
    explanation?: string;
    success?: boolean; // Deprecated in v2.1
}

export interface AssertionMetadataMap {
    [key: string]: unknown;
    dateTime?: string; // TODO check the data type we receive from CBOR
    reviewRatings?: {
        value: number;
        code?: ReviewCode;
        explanation?: string;
    }[];
    reference?: HashedURI;
    dataSource?: {
        type: DataSourceType;
        details?: string;
    };
    localizations?: Record<string, string>;
    // regionOfInterest currently not implemented
}
