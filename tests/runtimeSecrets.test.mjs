import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchSecretValueFromOci,
  getRuntimeSecretProvider,
  loadRuntimeSecrets,
  parseOciSecretMappings
} from '../utils/runtimeSecrets.js';

const silentLogger = {
  info() {},
  warn() {}
};

test('getRuntimeSecretProvider defaults to env and validates allowed values', () => {
  assert.equal(getRuntimeSecretProvider(undefined), 'env');
  assert.equal(getRuntimeSecretProvider('oci'), 'oci');
  assert.throws(
    () => getRuntimeSecretProvider('kms'),
    /SECRET_PROVIDER must be either "env" or "oci"/
  );
});

test('parseOciSecretMappings parses a JSON object of env names to secret refs', () => {
  const mappings = parseOciSecretMappings(JSON.stringify({
    JWT_SECRET: 'homeinventory-jwt-secret',
    APP_ENCRYPTION_KEY: 'ocid1.secret.oc1..example'
  }));

  assert.deepEqual(mappings, {
    JWT_SECRET: 'homeinventory-jwt-secret',
    APP_ENCRYPTION_KEY: 'ocid1.secret.oc1..example'
  });
});

test('loadRuntimeSecrets leaves the environment unchanged when provider is env', async () => {
  const env = {
    SECRET_PROVIDER: 'env',
    JWT_SECRET: 'already-set'
  };

  let clientFactoryCalled = false;

  const result = await loadRuntimeSecrets({
    env,
    logger: silentLogger,
    clientFactory: async () => {
      clientFactoryCalled = true;
      return { client: {} };
    }
  });

  assert.equal(clientFactoryCalled, false);
  assert.equal(env.JWT_SECRET, 'already-set');
  assert.deepEqual(result, {
    provider: 'env',
    loadedNames: [],
    skippedNames: []
  });
});

test('loadRuntimeSecrets populates missing values from OCI and preserves existing env values by default', async () => {
  const env = {
    SECRET_PROVIDER: 'oci',
    OCI_VAULT_ID: 'ocid1.vault.oc1..vault',
    OCI_SECRET_MAPPINGS: JSON.stringify({
      JWT_SECRET: 'jwt-secret',
      APP_ENCRYPTION_KEY: 'ocid1.secret.oc1..app-key'
    }),
    APP_ENCRYPTION_KEY: 'existing-key'
  };

  const resolved = [];
  let clientClosed = false;

  const result = await loadRuntimeSecrets({
    env,
    logger: silentLogger,
    clientFactory: async () => ({
      client: {
        async close() {
          clientClosed = true;
        }
      }
    }),
    secretResolver: async ({ envName, secretRef }) => {
      resolved.push({ envName, secretRef });
      return `${envName.toLowerCase()}-value`;
    }
  });

  assert.equal(env.JWT_SECRET, 'jwt_secret-value');
  assert.equal(env.APP_ENCRYPTION_KEY, 'existing-key');
  assert.equal(clientClosed, true);
  assert.deepEqual(resolved, [
    { envName: 'JWT_SECRET', secretRef: 'jwt-secret' }
  ]);
  assert.deepEqual(result, {
    provider: 'oci',
    loadedNames: ['JWT_SECRET'],
    skippedNames: ['APP_ENCRYPTION_KEY']
  });
});

test('loadRuntimeSecrets overwrites existing values when OCI_SECRET_OVERWRITE=true', async () => {
  const env = {
    SECRET_PROVIDER: 'oci',
    OCI_SECRET_OVERWRITE: 'true',
    OCI_SECRET_MAPPINGS: JSON.stringify({
      JWT_SECRET: 'ocid1.secret.oc1..jwt',
      APP_ENCRYPTION_KEY: 'ocid1.secret.oc1..app-key'
    }),
    JWT_SECRET: 'old-jwt',
    APP_ENCRYPTION_KEY: 'old-app-key'
  };

  const result = await loadRuntimeSecrets({
    env,
    logger: silentLogger,
    clientFactory: async () => ({
      client: {}
    }),
    secretResolver: async ({ envName }) => `${envName.toLowerCase()}-fresh`
  });

  assert.equal(env.JWT_SECRET, 'jwt_secret-fresh');
  assert.equal(env.APP_ENCRYPTION_KEY, 'app_encryption_key-fresh');
  assert.deepEqual(result, {
    provider: 'oci',
    loadedNames: ['JWT_SECRET', 'APP_ENCRYPTION_KEY'],
    skippedNames: []
  });
});

test('fetchSecretValueFromOci requires OCI_VAULT_ID when using secret names', async () => {
  await assert.rejects(
    () => fetchSecretValueFromOci({
      client: {},
      env: {},
      envName: 'JWT_SECRET',
      secretRef: 'jwt-secret'
    }),
    /OCI_VAULT_ID is required/
  );
});

test('fetchSecretValueFromOci decodes base64 secret bundle content', async () => {
  const value = await fetchSecretValueFromOci({
    client: {
      async getSecretBundle({ secretId, stage }) {
        assert.equal(secretId, 'ocid1.secret.oc1..jwt');
        assert.equal(stage, 'CURRENT');

        return {
          secretBundle: {
            secretBundleContent: {
              contentType: 'BASE64',
              content: Buffer.from('jwt-secret-value').toString('base64')
            }
          }
        };
      }
    },
    env: {},
    envName: 'JWT_SECRET',
    secretRef: 'ocid1.secret.oc1..jwt'
  });

  assert.equal(value, 'jwt-secret-value');
});
