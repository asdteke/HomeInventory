import { spawnSync } from 'node:child_process';

const allowedAdvisories = new Map([
    [
        'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
        'HomeInventory uses declarative BrowserRouter APIs and does not use React Router unstable RSC APIs.'
    ]
]);
const blockedSeverities = new Set(['moderate', 'high', 'critical']);

export function evaluateAuditReport(report) {
    const vulnerabilities = report?.vulnerabilities || {};
    const allowedPackages = new Set();
    let changed = true;

    while (changed) {
        changed = false;
        for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
            if (allowedPackages.has(name) || !Array.isArray(vulnerability.via) || vulnerability.via.length === 0) continue;

            const isAllowed = vulnerability.via.every((entry) => {
                if (typeof entry === 'string') return allowedPackages.has(entry);
                return allowedAdvisories.has(entry?.url);
            });

            if (isAllowed) {
                allowedPackages.add(name);
                changed = true;
            }
        }
    }

    const blocked = Object.entries(vulnerabilities)
        .filter(([name, vulnerability]) => blockedSeverities.has(vulnerability?.severity) && !allowedPackages.has(name))
        .map(([name, vulnerability]) => ({ name, severity: vulnerability.severity, via: vulnerability.via }));

    return { allowedPackages: [...allowedPackages].sort(), blocked };
}

function run() {
    const audit = spawnSync('npm', ['audit', '--json', '--prefix', 'client'], {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
    });

    let report;
    try {
        report = JSON.parse(audit.stdout);
    } catch {
        process.stderr.write(audit.stderr || audit.stdout || 'npm audit did not return valid JSON.\n');
        process.exit(1);
    }

    const result = evaluateAuditReport(report);
    for (const [url, reason] of allowedAdvisories) {
        process.stdout.write(`Allowed advisory: ${url}\nReason: ${reason}\n`);
    }

    if (result.blocked.length > 0) {
        process.stderr.write(`${JSON.stringify({ blocked: result.blocked }, null, 2)}\n`);
        process.exit(1);
    }

    process.stdout.write(
        `Client audit passed; narrowly allowed packages: ${result.allowedPackages.join(', ') || 'none'}.\n`
    );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    run();
}
