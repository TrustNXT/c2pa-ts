import * as fs from 'node:fs/promises';
import { X509Certificate } from '@peculiar/x509';
import { TrustList } from '../../src/cose';

// Test-only trust anchors: trust-list.pem holds the C2PA test root plus the signing roots of the signed sample
// assets (Truepic, Amazon, TrustNXT); timestamp-trust-list.pem holds TSA root/intermediate CAs of C2PA members.
// trust-list-wrong.pem intentionally lacks the roots of those assets, to test the untrusted path.
export const DEFAULT_TRUST_LIST_PATH = 'tests/fixtures/trust-list.pem';
export const DEFAULT_TIMESTAMP_TRUST_LIST_PATH = 'tests/fixtures/timestamp-trust-list.pem';

// Bun runs all test files in one process, so files that set the global trust lists must reset them afterwards.
export function resetTrustLists(): void {
    TrustList.setTrustAnchors([]);
    TrustList.setTimestampTrustAnchors([]);
}

export async function setTrustList(trustListFile: string = DEFAULT_TRUST_LIST_PATH): Promise<void> {
    const trustListData = (await fs.readFile(trustListFile)).toString();
    TrustList.setTrustAnchors([trustListData]);
}

export async function getTrustAnchors(trustListFile: string = DEFAULT_TRUST_LIST_PATH): Promise<X509Certificate[]> {
    const trustListData = (await fs.readFile(trustListFile)).toString();
    return TrustList.parseTrustAnchors([trustListData]);
}

export async function setTimestampTrustList(
    timestampTrustListFile: string = DEFAULT_TIMESTAMP_TRUST_LIST_PATH,
): Promise<void> {
    const trustListData = (await fs.readFile(timestampTrustListFile)).toString();
    TrustList.setTimestampTrustAnchors([trustListData]);
}

export async function getTimestampTrustAnchors(
    timestampTrustListFile: string = DEFAULT_TIMESTAMP_TRUST_LIST_PATH,
): Promise<X509Certificate[]> {
    const trustListData = (await fs.readFile(timestampTrustListFile)).toString();
    return TrustList.parseTrustAnchors([trustListData]);
}
