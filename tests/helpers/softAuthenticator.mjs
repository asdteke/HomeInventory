// A tiny software WebAuthn authenticator (ES256, "none" attestation) for tests.
import crypto from 'node:crypto';

function encodeHead(major, length) {
    if (length < 24) return Buffer.from([(major << 5) | length]);
    if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
    if (length < 0x10000) {
        const head = Buffer.alloc(3);
        head[0] = (major << 5) | 25;
        head.writeUInt16BE(length, 1);
        return head;
    }
    const head = Buffer.alloc(5);
    head[0] = (major << 5) | 26;
    head.writeUInt32BE(length, 1);
    return head;
}

export function cborEncode(value) {
    if (Number.isInteger(value)) {
        return value >= 0 ? encodeHead(0, value) : encodeHead(1, -1 - value);
    }
    if (typeof value === 'string') {
        const bytes = Buffer.from(value, 'utf8');
        return Buffer.concat([encodeHead(3, bytes.length), bytes]);
    }
    if (value instanceof Uint8Array) {
        return Buffer.concat([encodeHead(2, value.length), Buffer.from(value)]);
    }
    if (value instanceof Map) {
        const parts = [encodeHead(5, value.size)];
        for (const [key, entry] of value) {
            parts.push(cborEncode(key), cborEncode(entry));
        }
        return Buffer.concat(parts);
    }
    throw new Error(`Unsupported CBOR value: ${value}`);
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

export class SoftAuthenticator {
    constructor({ userVerification = true } = {}) {
        this.userVerification = userVerification;
        this.credentials = new Map();
    }

    flags(attested) {
        let flags = 0x01; // user present
        if (this.userVerification) flags |= 0x04;
        if (attested) flags |= 0x40;
        return flags;
    }

    create(options, origin) {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const jwk = publicKey.export({ format: 'jwk' });
        const credentialId = crypto.randomBytes(32);
        const coseKey = cborEncode(new Map([
            [1, 2],
            [3, -7],
            [-1, 1],
            [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
            [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]
        ]));
        const credentialIdLength = Buffer.alloc(2);
        credentialIdLength.writeUInt16BE(credentialId.length);
        const authData = Buffer.concat([
            sha256(options.rp.id),
            Buffer.from([this.flags(true)]),
            Buffer.alloc(4),
            Buffer.alloc(16),
            credentialIdLength,
            credentialId,
            coseKey
        ]);
        const clientDataJSON = Buffer.from(JSON.stringify({
            type: 'webauthn.create',
            challenge: options.challenge,
            origin,
            crossOrigin: false
        }));
        const attestationObject = cborEncode(new Map([
            ['fmt', 'none'],
            ['attStmt', new Map()],
            ['authData', new Uint8Array(authData)]
        ]));
        const id = credentialId.toString('base64url');
        this.credentials.set(id, { privateKey, rpId: options.rp.id, userHandle: options.user.id, counter: 0 });

        return {
            id,
            rawId: id,
            type: 'public-key',
            clientExtensionResults: {},
            authenticatorAttachment: 'platform',
            response: {
                clientDataJSON: clientDataJSON.toString('base64url'),
                attestationObject: attestationObject.toString('base64url'),
                transports: ['internal']
            }
        };
    }

    get(options, origin, { credentialId, counter } = {}) {
        const id = credentialId || this.credentials.keys().next().value;
        const credential = this.credentials.get(id);
        credential.counter = counter ?? credential.counter + 1;
        const signCount = Buffer.alloc(4);
        signCount.writeUInt32BE(credential.counter);
        const authData = Buffer.concat([
            sha256(options.rpId || credential.rpId),
            Buffer.from([this.flags(false)]),
            signCount
        ]);
        const clientDataJSON = Buffer.from(JSON.stringify({
            type: 'webauthn.get',
            challenge: options.challenge,
            origin,
            crossOrigin: false
        }));
        const signature = crypto.sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), credential.privateKey);

        return {
            id,
            rawId: id,
            type: 'public-key',
            clientExtensionResults: {},
            authenticatorAttachment: 'platform',
            response: {
                clientDataJSON: clientDataJSON.toString('base64url'),
                authenticatorData: authData.toString('base64url'),
                signature: signature.toString('base64url'),
                userHandle: credential.userHandle
            }
        };
    }
}
