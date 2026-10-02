import { Resolver } from 'did-resolver';
import { getResolver as keyResolver } from 'key-did-resolver';
import { getResolver as webResolver } from 'web-did-resolver';
import { getResolver as jwkResolver } from './jwk-did-resolver';

export const didResolver = new Resolver({
    ...webResolver(),
    ...jwkResolver(),
    ...keyResolver(),
});
