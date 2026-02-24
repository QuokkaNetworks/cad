import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function formatDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString();
}

function normalizeAnnouncements(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 8).map((row) => ({
    id: row?.id,
    title: String(row?.title || 'Announcement'),
    content: String(row?.content || ''),
    created_at: row?.created_at || null,
    expires_at: row?.expires_at || null,
  }));
}

function BackgroundCarousel({ images }) {
  const slides = Array.isArray(images) && images.length > 0 ? images : ['/1080.png', '/96.png'];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [slides.length]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {slides.map((src, slideIndex) => (
        <img
          key={`${src}-${slideIndex}`}
          src={src}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            slideIndex === index ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(0,82,194,0.20),transparent_42%),radial-gradient(circle_at_85%_14%,rgba(216,180,108,0.16),transparent_42%),linear-gradient(180deg,rgba(6,10,18,0.25),rgba(6,10,18,0.78))]" />
      <div className="absolute inset-0 bg-cad-bg/35" />
      {slides.length > 1 && (
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5">
          {slides.map((_, dotIndex) => (
            <button
              key={dotIndex}
              type="button"
              onClick={() => setIndex(dotIndex)}
              aria-label={`Go to carousel slide ${dotIndex + 1}`}
              className={`h-2 rounded-full transition-all ${
                dotIndex === index ? 'w-6 bg-cad-gold' : 'w-2 bg-white/35 hover:bg-white/55'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleUpdatePopup({ rules, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-cad-border bg-cad-card shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-cad-border bg-red-500/8">
          <p className="text-[10px] uppercase tracking-[0.18em] text-red-300">Important</p>
          <h2 className="text-lg font-semibold text-cad-ink mt-1">Rule amendments/changes/additions</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-cad-muted">
            Rules version <span className="text-cad-ink font-semibold">{rules?.version || 'Current'}</span> requires your acknowledgement before department access.
          </p>
          <div className="rounded-xl border border-cad-border bg-cad-surface/60 p-3">
            <p className="text-xs text-cad-muted whitespace-pre-wrap leading-5">
              {String(rules?.changes_summary || '').trim() || 'Review the updated rules page for the latest amendments, changes, and additions.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-cad-border bg-cad-surface text-cad-muted hover:text-cad-ink transition-colors text-sm"
            >
              Dismiss
            </button>
            <Link
              to="/rules"
              className="px-3 py-1.5 rounded-lg bg-cad-accent hover:bg-cad-accent-light text-white text-sm font-medium transition-colors"
            >
              Review Rules
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnnouncementsPanel({ announcements, loading, error }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md shadow-xl h-full flex flex-col min-h-[320px]">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-cad-muted">Updates</p>
          <h2 className="text-lg font-semibold text-cad-ink">Announcements</h2>
        </div>
        <Link to="/rules" className="text-xs text-cad-muted hover:text-cad-ink transition-colors">
          Rules
        </Link>
      </div>

      <div className="p-4 flex-1 min-h-0">
        {loading && <p className="text-sm text-cad-muted">Loading announcements...</p>}
        {!loading && error && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/6 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {!loading && !error && announcements.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-sm font-medium text-cad-ink">No active announcements</p>
            <p className="text-xs text-cad-muted mt-1">Admins can post announcements from the admin panel.</p>
          </div>
        )}
        {!loading && announcements.length > 0 && (
          <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
            {announcements.map((item) => (
              <article key={item.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-cad-ink">{item.title}</h3>
                  <span className="text-[10px] text-cad-muted whitespace-nowrap">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
                {item.content ? (
                  <p className="text-xs text-cad-muted mt-2 whitespace-pre-wrap leading-5">{item.content}</p>
                ) : null}
                {item.expires_at ? (
                  <p className="text-[10px] text-cad-muted mt-2">Expires: {formatDateTime(item.expires_at)}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const { user, currentRulesVersion, hasAcceptedCurrentRules } = useAuth();
  const [cms, setCms] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cmsError, setCmsError] = useState('');
  const [announcementsError, setAnnouncementsError] = useState('');
  const [dismissedRulesVersion, setDismissedRulesVersion] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setCmsError('');
      setAnnouncementsError('');

      const [cmsRes, annRes] = await Promise.allSettled([
        api.get('/api/cms/content'),
        api.get('/api/announcements'),
      ]);

      if (!active) return;

      if (cmsRes.status === 'fulfilled') {
        setCms(cmsRes.value);
      } else {
        setCmsError(cmsRes.reason?.message || 'Failed to load home content');
      }

      if (annRes.status === 'fulfilled') {
        setAnnouncements(normalizeAnnouncements(annRes.value));
      } else {
        setAnnouncements([]);
        setAnnouncementsError(annRes.reason?.message || 'Failed to load announcements');
      }

      setLoading(false);
    }

    load();
    return () => { active = false; };
  }, []);

  const homeContent = cms?.home || {};
  const rulesContent = cms?.rules || {};
  const cmsRulesVersion = String(rulesContent?.version || '').trim();
  const effectiveRulesVersion = String(currentRulesVersion || cmsRulesVersion || '').trim();
  const agreedRulesVersion = String(user?.rules_agreed_version || '').trim();
  const rulesOutdated = effectiveRulesVersion !== '' && !hasAcceptedCurrentRules && agreedRulesVersion !== effectiveRulesVersion;

  useEffect(() => {
    setDismissedRulesVersion('');
  }, [effectiveRulesVersion]);

  const showRulesPopup = rulesOutdated && dismissedRulesVersion !== effectiveRulesVersion;

  const greetingName = useMemo(() => {
    const raw = String(user?.steam_name || '').trim();
    return raw ? raw.split(' ')[0] : 'Operator';
  }, [user?.steam_name]);

  return (
    <div className="w-full h-full flex flex-col">
      {showRulesPopup ? (
        <RuleUpdatePopup
          rules={{ ...rulesContent, version: effectiveRulesVersion || rulesContent?.version }}
          onClose={() => setDismissedRulesVersion(effectiveRulesVersion)}
        />
      ) : null}

      {rulesOutdated ? (
        <section className="mx-4 mt-4 rounded-2xl border border-red-500/25 bg-red-500/6 px-4 py-3 shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-red-300">Rule amendments/changes/additions</p>
              <p className="text-sm text-red-100 mt-1">
                You must agree to rules version <span className="font-semibold">{effectiveRulesVersion}</span> before entering Departments.
              </p>
              <p className="text-xs text-cad-muted mt-1 whitespace-pre-wrap">
                {String(rulesContent?.changes_summary || '').trim() || 'Open the Rules page to review the latest changes.'}
              </p>
            </div>
            <Link to="/rules" className="text-sm text-cad-ink underline underline-offset-2 hover:text-white transition-colors">
              Review on Rules page
            </Link>
          </div>
        </section>
      ) : null}

      <section className={`relative overflow-hidden ${rulesOutdated ? 'min-h-[520px] flex-1 mt-4' : 'min-h-full flex-1'}`}>
        <BackgroundCarousel images={homeContent.carousel_images} />
        <div className="absolute inset-0 cad-ambient-grid opacity-20 pointer-events-none" />

        <div className={`relative z-10 p-4 sm:p-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 ${rulesOutdated ? 'min-h-[520px]' : 'min-h-full'}`}>
          <div className="flex flex-col justify-between gap-4">
            <div className="max-w-3xl">
              {cmsError ? (
                <div className="inline-flex items-center rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 mb-3">
                  {cmsError}
                </div>
              ) : null}
              <p className="text-[10px] uppercase tracking-[0.2em] text-cad-muted">CAD Home</p>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-cad-ink mt-2 leading-tight">
                {String(homeContent.title || '').trim() || `Welcome back, ${greetingName}`}
              </h1>
              <p className="text-sm sm:text-base text-cad-muted mt-3 max-w-2xl leading-6">
                {String(homeContent.subtitle || '').trim() || 'Community updates, rules, and department access in one place.'}
              </p>
              {String(homeContent.body || '').trim() ? (
                <p className="text-sm text-cad-muted/90 mt-3 whitespace-pre-wrap leading-6 max-w-2xl">
                  {String(homeContent.body || '').trim()}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-white/10 bg-black/25 backdrop-blur-sm px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-cad-muted">Rules Status</p>
                <p className={`text-sm font-semibold mt-1 ${rulesOutdated ? 'text-red-200' : 'text-emerald-200'}`}>
                  {rulesOutdated ? 'Agreement Required' : 'Up To Date'}
                </p>
                <p className="text-[11px] text-cad-muted mt-1">
                  {effectiveRulesVersion ? `Current v${effectiveRulesVersion}` : 'No version set'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 backdrop-blur-sm px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-cad-muted">Discord</p>
                <p className="text-sm font-semibold mt-1 text-cad-ink">
                  {user?.discord_name ? user.discord_name : 'Not linked'}
                </p>
                <p className="text-[11px] text-cad-muted mt-1">
                  {user?.discord_id ? 'Linked for access sync' : 'Link in settings to sync access'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 backdrop-blur-sm px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-cad-muted">Last Agreement</p>
                <p className="text-sm font-semibold mt-1 text-cad-ink">
                  {user?.rules_agreed_at ? formatDateTime(user.rules_agreed_at) : 'Not recorded'}
                </p>
                <p className="text-[11px] text-cad-muted mt-1">
                  {agreedRulesVersion ? `Agreed v${agreedRulesVersion}` : 'No rules agreement yet'}
                </p>
              </div>
            </div>
          </div>

          <AnnouncementsPanel
            announcements={announcements}
            loading={loading}
            error={announcementsError}
          />
        </div>
      </section>
    </div>
  );
}
