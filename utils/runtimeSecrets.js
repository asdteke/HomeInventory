function normalizeString(value) {
    return String(value || '').trim();
}

function parseBoolean(value, fallback = false) {
    const normalized = normalizeString(value).toLowerCase();

    if (!normalized) {
        return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    throw new Error(`Invalid boolean value "${value}"`);
}

function logInfo(logger, message) {
    if (logger && typeof logger.info === 'function') {
        logger.info(message);
    }
}

function logWarn(logger, message) {
    if (logger && typeof logger.warn === 'function') {
        logger.warn(message);
    }
}

function isSecretOcid(value) {
    return /^ocid1\.secret\./i.test(normalizeString(value));
}

function normalizeProvider(rawValue) {
    const value = normalizeString(rawValue).toLowerCase();

    if (!value) {
        return 'env';
    }

    if (value === 'env' || value === 'oci') {
        return value;
    }

    throw new Error('SECRET_PROVIDER must be either "env" or "oci".');
}

function normalizeSecretStage(rawValue) {
    const value = normalizeString(rawValue).toUpperCase();

    if (!value) {
        return 'CURRENT';
    }

    if (['CURRENT', 'PENDING', 'LATEST', 'PREVIOUS', 'DEPRECATED'].includes(value)) {
        return value;
    }

    throw new Error('OCI_SECRET_BUNDLE_STAGE must be one of CURRENT, PENDING, LATEST, PREVIOUS, or DEPRECATED.');
}

function normalizeAuthMode(rawValue) {
    const value = normalizeString(rawValue).toLowerCase();

    if (!value) {
        return 'instance_principal';
    }

    if (value === 'instance_principal') {
        return value;
    }

    throw new Error('OCI_AUTH_MODE must be "instance_principal".');
}

function normalizeEnvName(rawValue) {
    const value = normalizeString(rawValue);

    if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
        throw new Error(`Invalid environment variable name "${rawValue}" in OCI_SECRET_MAPPINGS.`);
    }

    return value;
}

export function getRuntimeSecretProvider(rawValue = process.env.SECRET_PROVIDER) {
    return normalizeProvider(rawValue);
}

export function parseOciSecretMappings(rawValue = process.env.OCI_SECRET_MAPPINGS) {
    const value = normalizeString(rawValue);

    if (!value) {
        return {};
    }

    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error('OCI_SECRET_MAPPINGS must be valid JSON mapping environment variable names to OCI secret OCIDs or secret names.');
    }

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('OCI_SECRET_MAPPINGS must be a JSON object mapping environment variable names to OCI secret OCIDs or secret names.');
    }

    const mappings = {};
    for (const [rawEnvName, rawSecretRef] of Object.entries(parsed)) {
        const envName = normalizeEnvName(rawEnvName);
        const secretRef = normalizeString(rawSecretRef);

        if (!secretRef) {
            throw new Error(`OCI_SECRET_MAPPINGS entry "${envName}" must not be empty.`);
        }

        mappings[envName] = secretRef;
    }

    return mappings;
}

function resolveConfiguredRegion(env) {
    return normalizeString(env.OCI_REGION || env.OCI_CLI_REGION);
}

function resolveProviderRegion(authenticationDetailsProvider) {
    const candidates = [
        authenticationDetailsProvider?.region,
        typeof authenticationDetailsProvider?.getRegion === 'function'
            ? authenticationDetailsProvider.getRegion()
            : null,
        authenticationDetailsProvider?._region
    ];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }

        if (typeof candidate === 'string') {
            const value = normalizeString(candidate);
            if (value) {
                return value;
            }
            continue;
        }

        if (typeof candidate.regionId === 'string' && normalizeString(candidate.regionId)) {
            return normalizeString(candidate.regionId);
        }

        if (typeof candidate.regionCode === 'string' && normalizeString(candidate.regionCode)) {
            return normalizeString(candidate.regionCode);
        }
    }

    return '';
}

async function loadOciSdk() {
    const module = await import('oci-sdk');
    return module.default || module;
}

function toOciRegion(oci, region) {
    const normalized = normalizeString(region);

    if (!normalized) {
        return null;
    }

    return oci.common.Region.fromRegionId(normalized);
}

async function createOciSecretsClient(env) {
    const authMode = normalizeAuthMode(env.OCI_AUTH_MODE);
    const oci = await loadOciSdk();

    if (authMode !== 'instance_principal') {
        throw new Error(`Unsupported OCI_AUTH_MODE "${authMode}".`);
    }

    const authenticationDetailsProvider = await new oci.common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
    const client = new oci.secrets.SecretsClient({
        authenticationDetailsProvider
    });

    const region = resolveConfiguredRegion(env) || resolveProviderRegion(authenticationDetailsProvider);
    if (region) {
        client.region = toOciRegion(oci, region);
    }

    return { client };
}

async function closeOciSecretsClient(client) {
    if (client && typeof client.close === 'function') {
        await client.close();
        return;
    }

    if (client && typeof client.closeProvider === 'function') {
        await client.closeProvider();
    }
}

export async function fetchSecretValueFromOci({ client, env, envName, secretRef }) {
    const stage = normalizeSecretStage(env.OCI_SECRET_BUNDLE_STAGE);
    let response;

    if (isSecretOcid(secretRef)) {
        response = await client.getSecretBundle({
            secretId: secretRef,
            stage
        });
    } else {
        const vaultId = normalizeString(env.OCI_VAULT_ID);

        if (!vaultId) {
            throw new Error(`OCI_VAULT_ID is required when OCI secret mapping "${envName}" uses a secret name instead of a secret OCID.`);
        }

        response = await client.getSecretBundleByName({
            secretName: secretRef,
            vaultId,
            stage
        });
    }

    const contentDetails = response?.secretBundle?.secretBundleContent;
    const content = contentDetails?.content;
    const contentType = normalizeString(contentDetails?.contentType).toUpperCase();

    if (content === undefined || content === null) {
        throw new Error(`OCI secret mapping "${envName}" returned an empty secret bundle.`);
    }

    if (contentType && contentType !== 'BASE64') {
        throw new Error(`OCI secret mapping "${envName}" returned unsupported content type "${contentType}".`);
    }

    return Buffer.from(String(content), 'base64').toString('utf8');
}

export async function loadRuntimeSecrets(options = {}) {
    const env = options.env || process.env;
    const logger = options.logger || console;
    const provider = normalizeProvider(env.SECRET_PROVIDER);

    if (provider === 'env') {
        return {
            provider,
            loadedNames: [],
            skippedNames: []
        };
    }

    const mappings = parseOciSecretMappings(env.OCI_SECRET_MAPPINGS);
    const mappingEntries = Object.entries(mappings);

    if (mappingEntries.length === 0) {
        throw new Error('SECRET_PROVIDER=oci requires OCI_SECRET_MAPPINGS to define at least one environment variable to populate.');
    }

    const overwrite = parseBoolean(env.OCI_SECRET_OVERWRITE, false);
    const pendingEntries = [];
    const skippedNames = [];

    for (const [envName, secretRef] of mappingEntries) {
        if (!overwrite && normalizeString(env[envName])) {
            skippedNames.push(envName);
            continue;
        }

        pendingEntries.push([envName, secretRef]);
    }

    if (pendingEntries.length === 0) {
        logInfo(logger, '[Secrets] OCI provider enabled, but all mapped environment variables were already set.');
        return {
            provider,
            loadedNames: [],
            skippedNames
        };
    }

    const clientFactory = options.clientFactory || createOciSecretsClient;
    const secretResolver = options.secretResolver || fetchSecretValueFromOci;
    const { client } = await clientFactory(env);
    const loadedNames = [];

    try {
        for (const [envName, secretRef] of pendingEntries) {
            const value = await secretResolver({
                client,
                env,
                envName,
                secretRef
            });

            env[envName] = value;
            loadedNames.push(envName);
        }
    } finally {
        await closeOciSecretsClient(client);
    }

    logInfo(logger, `[Secrets] Loaded ${loadedNames.length} secret(s) from OCI Secret Management.`);

    if (skippedNames.length > 0) {
        logWarn(logger, `[Secrets] Skipped ${skippedNames.length} mapped secret(s) because values were already present in the environment.`);
    }

    return {
        provider,
        loadedNames,
        skippedNames
    };
}
