import { buildDefaultIndexNowUrls, getIndexNowConfig, submitIndexNowUrls } from '../utils/indexNow.js';

async function main() {
    const config = getIndexNowConfig();
    if (!config.enabled) {
        console.error(`[IndexNow] ${config.reason}`);
        process.exit(1);
    }

    const cliUrls = process.argv.slice(2);
    const urls = cliUrls.length ? cliUrls : buildDefaultIndexNowUrls(config.baseUrl);
    const result = await submitIndexNowUrls(urls);

    console.log(`[IndexNow] Submitted ${result.submitted} URL(s). HTTP ${result.status}`);
}

main().catch((error) => {
    console.error(`[IndexNow] ${error.message}`);
    process.exit(1);
});

