import { translateWithAzure } from './azure-translator.mjs';

async function test() {
    try {
        console.log('Testing Azure Translation...');
        const results = await translateWithAzure(['Hello world', 'How are you?'], 'tr');
        console.log('Results:', results);
    } catch (error) {
        console.error('Test Failed:', error.message);
    }
}

test();
