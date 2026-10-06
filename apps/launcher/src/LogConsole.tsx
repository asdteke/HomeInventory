import { ArrowDownToLine, Check, Copy, Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from './App';
import { useLauncherI18n } from './i18n';

type LogFilter = 'all' | 'errors' | 'warnings';

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
const BOX_EDGE_PATTERN = /^\s*[│┃║╎┆]\s?|\s*[│┃║╎┆]\s*$/g;
const BOX_ONLY_PATTERN = /^[\s─━═┄┈╌┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬╭╮╯╰│┃║╎┆]*$/;
const WARNING_PATTERN = /\bwarn(ing)?\b/i;

/* Server output is meant for a terminal: drop colour codes and box-drawing
 * frames so the text reads cleanly in a proportional, wrapping layout. */
export function cleanLogMessage(message: string): string {
  return message
    .replace(ANSI_PATTERN, '')
    .split('\n')
    .map(line => line.replace(/\r/g, '').replace(BOX_EDGE_PATTERN, ''))
    .filter(line => !BOX_ONLY_PATTERN.test(line))
    .join('\n');
}

type CleanEntry = LogEntry & { text: string; warning: boolean };

function formatTime(timestamp: number) {
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LogConsole({ logs }: { logs: LogEntry[] }) {
  const { t } = useLauncherI18n();
  const [filter, setFilter] = useState<LogFilter>('all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<CleanEntry[]>(() => logs
    .map(entry => {
      const text = cleanLogMessage(entry.message);
      return { ...entry, text, warning: entry.level !== 'error' && WARNING_PATTERN.test(text) };
    })
    .filter(entry => entry.text.trim()), [logs]);

  const counts = useMemo(() => ({
    errors: entries.filter(entry => entry.level === 'error').length,
    warnings: entries.filter(entry => entry.warning).length,
  }), [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(entry => {
      if (filter === 'errors' && entry.level !== 'error') return false;
      if (filter === 'warnings' && !entry.warning) return false;
      return !needle || entry.text.toLowerCase().includes(needle) || entry.source.toLowerCase().includes(needle);
    });
  }, [entries, filter, query]);

  // Follow new output while the reader is at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [visible, pinned]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
    setPinned(true);
  };

  const copyVisible = async () => {
    const text = visible
      .map(entry => `[${formatTime(entry.timestamp)}] [${entry.source}] ${entry.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const filters: { key: LogFilter; label: string; count?: number }[] = [
    { key: 'all', label: t('logs.filterAll') },
    { key: 'errors', label: t('logs.filterErrors'), count: counts.errors },
    { key: 'warnings', label: t('logs.filterWarnings'), count: counts.warnings },
  ];

  return (
    <div className="log-console">
      <div className="log-toolbar">
        <div className="log-filters" role="tablist" aria-label={t('logs.filterLabel')}>
          {filters.map(item => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={filter === item.key ? 'active' : ''}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              {item.count ? <span className={`log-count ${item.key}`}>{item.count}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" className="log-tool" onClick={copyVisible} disabled={!visible.length} title={t('logs.copy')} aria-label={t('logs.copy')}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <label className="log-search">
        <Search size={12} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('logs.search')} aria-label={t('logs.search')} />
      </label>

      <div className="log-scroll" ref={scrollRef} onScroll={onScroll}>
        {!visible.length ? (
          <div className="empty-log">{entries.length ? t('logs.noMatches') : t('dev.noLogs')}</div>
        ) : visible.map((entry, index) => (
          <div className={`log-line ${entry.level}${entry.warning ? ' warning' : ''}`} key={`${entry.timestamp}-${index}`}>
            <div className="log-meta">
              <span className="log-time">{formatTime(entry.timestamp)}</span>
              <span className="log-source" title={entry.source}>{entry.source}</span>
            </div>
            <pre className="log-text">{entry.text}</pre>
          </div>
        ))}
      </div>

      {!pinned && (
        <button type="button" className="log-jump" onClick={jumpToLatest}>
          <ArrowDownToLine size={13} /> {t('logs.jumpLatest')}
        </button>
      )}
      {copied && <span className="log-copied" role="status">{t('logs.copied')}</span>}
    </div>
  );
}
