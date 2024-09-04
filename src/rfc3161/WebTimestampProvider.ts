import { TimeStampReq, TimeStampResp } from 'pkijs';
import { TimestampProvider } from './TimestampProvider';

export class WebTimestampProvider implements TimestampProvider {
    private readonly url: string;
    public timeoutMs = 5000;

    constructor(url: string) {
        this.url = url;
    }

    async getSignedTimestamp(request: TimeStampReq): Promise<TimeStampResp | undefined> {
        const response = await fetch(this.url, {
            method: 'POST',
            body: request.toSchema().toBER(),
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
            return TimeStampResp.fromBER(await response.arrayBuffer());
        }
    }
}
