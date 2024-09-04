import { TimeStampReq, TimeStampResp } from 'pkijs';

export interface TimestampProvider {
    getSignedTimestamp(request: TimeStampReq): Promise<TimeStampResp | undefined>;
}
