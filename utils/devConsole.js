const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    gray: '\x1b[90m',
    cyan: '\x1b[36m',
    green: '\x1b[32m'
};

const COLOR_ENABLED = Boolean(process.stdout?.isTTY) && !('NO_COLOR' in process.env);
const LABEL_WIDTH = 10;

function paint(code, value) {
    const text = String(value);
    return COLOR_ENABLED ? `${code}${text}${ANSI.reset}` : text;
}

function formatValue(value, tone = 'accent') {
    if (tone === 'success') {
        return paint(`${ANSI.bold}${ANSI.green}`, value);
    }

    if (tone === 'muted') {
        return paint(ANSI.gray, value);
    }

    return paint(ANSI.cyan, value);
}

function buildSummaryRow(label, value) {
    return `${String(label).padEnd(LABEL_WIDTH)} ${String(value)}`;
}

function renderSummaryLine(content, contentWidth) {
    return `${paint(ANSI.gray, '│')} ${content.padEnd(contentWidth)} ${paint(ANSI.gray, '│')}`;
}

export function stripLogNamespace(message) {
    return String(message).replace(/^\[[^\]]+\]\s*/, '');
}

export function formatScopedLog(scope, message) {
    return `${paint(ANSI.gray, `[${scope}]`)} ${String(message)}`;
}

export function renderStartupSummary({
    appName,
    status = 'Ready',
    frontendUrl,
    backendUrl,
    lanAppUrl,
    lanApiUrl,
    helpText = 'Press Ctrl+C to stop'
}) {
    const title = `${appName} ${paint(ANSI.gray, '•')} ${paint(ANSI.dim, 'Development')}`;
    const titlePlain = `${appName} • Development`;
    const rows = [
        { label: 'Status', value: status, tone: String(status).toLowerCase() === 'ready' ? 'success' : 'muted' },
        { label: 'Frontend', value: frontendUrl, tone: 'accent' },
        { label: 'Backend', value: backendUrl, tone: 'accent' },
        { label: 'LAN App', value: lanAppUrl || 'Unavailable', tone: lanAppUrl ? 'accent' : 'muted' },
        { label: 'LAN API', value: lanApiUrl || 'Unavailable', tone: lanApiUrl ? 'accent' : 'muted' }
    ];
    const helpRow = helpText ? { label: 'Help', value: helpText, tone: 'muted' } : null;
    const plainRows = [...rows, ...(helpRow ? [helpRow] : [])].map(({ label, value }) => buildSummaryRow(label, value));
    const contentWidth = Math.max(titlePlain.length + 2, ...plainRows.map((row) => row.length));
    const topFill = Math.max(0, contentWidth - titlePlain.length - 1);
    const formattedRows = rows.map(({ label, value, tone }) => (
        renderSummaryLine(
            `${paint(ANSI.dim, String(label).padEnd(LABEL_WIDTH))} ${formatValue(value, tone)}`,
            contentWidth
        )
    ));

    if (helpRow) {
        formattedRows.push(
            renderSummaryLine(
                `${paint(ANSI.dim, String(helpRow.label).padEnd(LABEL_WIDTH))} ${formatValue(helpRow.value, helpRow.tone)}`,
                contentWidth
            )
        );
    }

    return [
        '',
        `${paint(ANSI.gray, '╭─')} ${title} ${paint(ANSI.gray, '─'.repeat(topFill) + '╮')}`,
        ...formattedRows,
        `${paint(ANSI.gray, `╰${'─'.repeat(contentWidth + 2)}╯`)}`,
        ''
    ].join('\n');
}

export const formatStartupBanner = renderStartupSummary;
