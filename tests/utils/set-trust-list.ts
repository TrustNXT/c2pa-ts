import * as fs from 'node:fs/promises';
import { X509Certificate } from '@peculiar/x509';
import { TrustList } from '../../src/cose';

export const DEFAULT_TRUST_LIST_PATH = 'tests/fixtures/trust-list.pem';
export const DEFAULT_TIMESTAMP_TRUST_LIST_PATH = 'tests/fixtures/timestamp-trust-list.pem';

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
