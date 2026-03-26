import fs from 'node:fs';

const DEFAULT_DOCKER_SECRETS_DIR = '/run/secrets';

export function getDockerSecretsDir(env = process.env) {
    const configuredDir = String(env?.DOCKER_SECRETS_DIR || '').trim();
    return configuredDir || DEFAULT_DOCKER_SECRETS_DIR;
}

export function getEnvOrSecret(keyName, secretName, options = {}) {
    const env = options.env || process.env;
    const fsModule = options.fs || fs;
    const dockerSecretsDir = options.secretsDir || getDockerSecretsDir(env);

    try {
        return fsModule.readFileSync(`${dockerSecretsDir}/${secretName}`, 'utf8').trim();
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            throw error;
        }
    }

    return env[keyName];
}
