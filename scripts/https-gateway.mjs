import { createEnrollmentServer, createHttpsGateway, loadGatewayFiles } from '../utils/httpsGateway.js';

function required(name) {
    const value = String(process.env[name] || '').trim();
    if (!value) throw new Error(`${name} is required.`);
    return value;
}

function port(name) {
    const value = Number.parseInt(required(name), 10);
    if (!Number.isInteger(value) || value < 1024 || value > 65535) {
        throw new Error(`${name} must be between 1024 and 65535.`);
    }
    return value;
}

const httpsPort = port('HOMEINVENTORY_HTTPS_PORT');
const enrollmentPort = port('HOMEINVENTORY_ENROLLMENT_PORT');
const targetPort = port('HOMEINVENTORY_HTTPS_TARGET_PORT');
const localIp = required('HOMEINVENTORY_HTTPS_LOCAL_IP');
const token = required('HOMEINVENTORY_ENROLLMENT_TOKEN');
const caName = required('HOMEINVENTORY_CA_NAME');
const publicOrigin = `https://${localIp}:${httpsPort}`;
const files = loadGatewayFiles({
    keyPath: required('HOMEINVENTORY_HTTPS_KEY_PATH'),
    certificatePath: required('HOMEINVENTORY_HTTPS_CERT_PATH'),
    caPath: required('HOMEINVENTORY_CA_CERT_PATH')
});

const httpsServer = createHttpsGateway({
    keyPem: files.keyPem,
    certificateChainPem: files.certificateChainPem,
    targetPort,
    publicOrigin
});
const enrollmentServer = createEnrollmentServer({
    caPem: files.caPem,
    caName,
    token,
    expiresAt: Date.now() + 10 * 60 * 1000
});

httpsServer.listen(httpsPort, '0.0.0.0', () => {
    console.log(`[HTTPS] Secure LAN gateway ready on ${publicOrigin}`);
});
enrollmentServer.listen(enrollmentPort, '0.0.0.0', () => {
    console.log(`[HTTPS] Certificate enrollment is available for 10 minutes on port ${enrollmentPort}`);
});

const enrollmentTimer = setTimeout(() => enrollmentServer.close(), 10 * 60 * 1000);
enrollmentTimer.unref();

function shutdown() {
    clearTimeout(enrollmentTimer);
    enrollmentServer.close();
    httpsServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
