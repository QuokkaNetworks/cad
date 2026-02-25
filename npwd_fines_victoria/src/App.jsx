import React, { useEffect, useState } from 'react';
import logo from './assets/FinesVicLogo.jpg';
import { fetchCadBridgeNui } from './utils/fetchNui.js';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '$0';
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}

function formatDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return text;
  try {
    return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(parsed));
  } catch {
    return text;
  }
}

function statusTone(notice) {
  if (notice?.can_pay_online) return { bg: 'rgba(22,163,74,0.18)', border: 'rgba(34,197,94,0.34)', text: '#bbf7d0' };
  const payable = String(notice?.payable_status || '').toLowerCase();
  if (payable === 'paid') return { bg: 'rgba(59,130,246,0.16)', border: 'rgba(96,165,250,0.3)', text: '#bfdbfe' };
  if (payable === 'court_listed') return { bg: 'rgba(245,158,11,0.16)', border: 'rgba(251,191,36,0.3)', text: '#fde68a' };
  return { bg: 'rgba(148,163,184,0.14)', border: 'rgba(148,163,184,0.22)', text: '#cbd5e1' };
}

function StatusBanner({ status }) {
  if (!status?.message) return null;
  const palette = status.type === 'error'
    ? { border: 'rgba(239,68,68,0.35)', bg: 'rgba(127,29,29,0.18)', text: '#fecaca' }
    : status.type === 'success'
      ? { border: 'rgba(34,197,94,0.35)', bg: 'rgba(20,83,45,0.18)', text: '#bbf7d0' }
      : { border: 'rgba(245,158,11,0.3)', bg: 'rgba(120,53,15,0.16)', text: '#fde68a' };
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.text,
        fontSize: 12.5,
        lineHeight: 1.35,
        padding: '10px 12px',
        whiteSpace: 'pre-wrap',
      }}
    >
      {status.message}
    </div>
  );
}

function NoticeCard({ notice, payingNoticeId, onPay }) {
  const tone = statusTone(notice);
  const isPaying = Number(payingNoticeId) === Number(notice?.id);
  const payableStatus = String(notice?.payable_status || '').replace(/_/g, ' ').trim() || 'unknown';
  const dueDate = formatDate(notice?.due_date);
  const courtDate = formatDate(notice?.court_date);

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(15,23,42,0.5)',
        padding: 12,
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fbff', lineHeight: 1.25 }}>
            {String(notice?.title || '').trim() || 'Infringement Notice'}
          </div>
          <div style={{ fontSize: 11.5, color: '#b8cae6', marginTop: 2 }}>
            {String(notice?.notice_number || `Notice #${notice?.id || '?'}`)}
            {String(notice?.vehicle_plate || '').trim() ? ` • ${String(notice.vehicle_plate).trim()}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff6d6' }}>{formatCurrency(notice?.amount)}</div>
          <div
            style={{
              marginTop: 4,
              borderRadius: 999,
              border: `1px solid ${tone.border}`,
              background: tone.bg,
              color: tone.text,
              padding: '3px 8px',
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'inline-block',
            }}
          >
            {notice?.can_pay_online ? 'Pay Online' : payableStatus}
          </div>
        </div>
      </div>

      {(dueDate || courtDate || notice?.department_short_name) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {notice?.department_short_name && (
            <span style={{ fontSize: 10.5, color: '#dbeafe', border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(37,99,235,0.08)', borderRadius: 999, padding: '2px 7px' }}>
              {notice.department_short_name}
            </span>
          )}
          {dueDate && (
            <span style={{ fontSize: 10.5, color: '#e5e7eb', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 999, padding: '2px 7px' }}>
              Due {dueDate}
            </span>
          )}
          {courtDate && (
            <span style={{ fontSize: 10.5, color: '#fde68a', border: '1px solid rgba(245,158,11,0.22)', background: 'rgba(245,158,11,0.05)', borderRadius: 999, padding: '2px 7px' }}>
              Court {courtDate}
            </span>
          )}
        </div>
      )}

      {String(notice?.description || '').trim() && (
        <div style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.35 }}>
          {String(notice.description).trim()}
        </div>
      )}

      {notice?.can_pay_online ? (
        <button
          type="button"
          onClick={() => onPay(notice)}
          disabled={isPaying}
          style={{
            border: '1px solid rgba(234,179,8,0.35)',
            background: isPaying
              ? 'linear-gradient(135deg, rgba(161,98,7,0.7), rgba(146,64,14,0.65))'
              : 'linear-gradient(135deg, #f5c84c, #eab308)',
            color: '#1f1400',
            borderRadius: 10,
            padding: '9px 10px',
            fontSize: 12.5,
            fontWeight: 800,
            cursor: isPaying ? 'default' : 'pointer',
            opacity: isPaying ? 0.9 : 1,
          }}
        >
          {isPaying ? 'Processing Payment...' : `Pay ${formatCurrency(notice?.amount)}`}
        </button>
      ) : (
        <div
          style={{
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.16)',
            background: 'rgba(15,23,42,0.35)',
            color: '#9fb4d1',
            padding: '8px 10px',
            fontSize: 11.5,
            lineHeight: 1.35,
          }}
        >
          {String(notice?.pay_block_reason || '').trim() || 'This notice cannot be paid online.'}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payingNoticeId, setPayingNoticeId] = useState(0);
  const [confirmNotice, setConfirmNotice] = useState(null);
  const [notices, setNotices] = useState([]);
  const [summary, setSummary] = useState({ total_outstanding: 0, payable_count: 0, total_notices: 0 });
  const [account, setAccount] = useState('bank');
  const [characterName, setCharacterName] = useState('');
  const [status, setStatus] = useState({
    type: 'info',
    message: 'Load your infringement notices and pay eligible fines online through Fines Victoria.',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;

    const reportBlockedDialog = (kind, message) => {
      const text = String(message || '').trim();
      const detail = text ? ` (${text.slice(0, 180)})` : '';
      setStatus({
        type: 'error',
        message: `A native browser ${kind} dialog was blocked inside the phone app${detail}. This usually means an old app bundle or browser fallback path was triggered.`,
      });
      try {
        // Helpful for F8/CEF devtools if available.
        // eslint-disable-next-line no-console
        console.warn(`[FinesVictoria] Blocked native ${kind} dialog`, message);
      } catch {
        // no-op
      }
    };

    window.alert = (message) => {
      reportBlockedDialog('alert', message);
    };
    window.confirm = (message) => {
      reportBlockedDialog('confirm', message);
      return false;
    };
    window.prompt = (message) => {
      reportBlockedDialog('prompt', message);
      return null;
    };

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
      window.prompt = originalPrompt;
    };
  }, []);

  async function loadNotices({ silent = false } = {}) {
    if (loading || refreshing || payingNoticeId > 0) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    if (!silent) {
      setStatus({ type: 'info', message: 'Loading your infringement notices...' });
    }

    try {
      const res = await fetchCadBridgeNui('cadBridgeNpwdFinesVicList', {}, { timeoutMs: 15000 });
      const ok = res?.ok === true || res?.success === true;
      if (!ok) {
        setNotices([]);
        setSummary({ total_outstanding: 0, payable_count: 0, total_notices: 0 });
        setStatus({
          type: 'error',
          message: String(res?.message || 'Unable to load infringement notices from Fines Victoria.'),
        });
        return;
      }

      const nextNotices = Array.isArray(res?.notices) ? res.notices : [];
      setNotices(nextNotices);
      setSummary({
        total_outstanding: Number(res?.summary?.total_outstanding || 0) || 0,
        payable_count: Number(res?.summary?.payable_count || 0) || 0,
        total_notices: Number(res?.summary?.total_notices || nextNotices.length || 0) || 0,
      });
      setAccount(String(res?.account || 'bank'));
      setCharacterName(String(res?.character_name || '').trim());

      if (!nextNotices.length) {
        setStatus({ type: 'success', message: 'No infringement notices were found for your current character.' });
      } else if ((Number(res?.summary?.payable_count || 0) || 0) > 0) {
        setStatus({
          type: 'success',
          message: `Loaded ${nextNotices.length} notice${nextNotices.length === 1 ? '' : 's'}. ${Number(res?.summary?.payable_count || 0)} can be paid online now.`,
        });
      } else {
        setStatus({
          type: 'info',
          message: `Loaded ${nextNotices.length} notice${nextNotices.length === 1 ? '' : 's'}. None are currently payable online.`,
        });
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: `Unable to contact CAD bridge: ${String(err?.message || err || 'unknown error')}`,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadNotices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePayNotice(notice) {
    const noticeId = Number(notice?.id || 0);
    if (!noticeId || payingNoticeId > 0) return;
    if (notice?.can_pay_online !== true) return;
    setConfirmNotice(notice);
  }

  async function handleConfirmPayNotice() {
    const notice = confirmNotice;
    const noticeId = Number(notice?.id || 0);
    if (!noticeId || payingNoticeId > 0) return;
    if (notice?.can_pay_online !== true) {
      setConfirmNotice(null);
      return;
    }
    setConfirmNotice(null);

    setPayingNoticeId(noticeId);
    setStatus({
      type: 'info',
      message: `Processing payment for ${String(notice?.notice_number || `Notice #${noticeId}`)}...`,
    });

    try {
      // eslint-disable-next-line no-console
      console.log('[FinesVictoria] Starting payment request', { noticeId });
      const res = await fetchCadBridgeNui('cadBridgeNpwdFinesVicPay', { notice_id: noticeId }, { timeoutMs: 30000 });
      // eslint-disable-next-line no-console
      console.log('[FinesVictoria] Payment response', res);
      const ok = res?.ok === true || res?.success === true;
      if (!ok) {
        const fundsDeducted = res?.funds_deducted === true;
        setStatus({
          type: 'error',
          message: String(
            res?.message
            || (fundsDeducted
              ? 'Funds were deducted, but CAD could not confirm the payment. Please contact staff.'
              : 'Payment failed.')
          ),
        });
        await loadNotices({ silent: true });
        return;
      }

      const paidNotice = res?.notice || null;
      setStatus({
        type: 'success',
        message: String(
          res?.message
          || `Payment successful for ${String(paidNotice?.notice_number || notice?.notice_number || `Notice #${noticeId}`)}.`
        ),
      });
      await loadNotices({ silent: true });
    } catch (err) {
      setStatus({
        type: 'error',
        message: `Payment failed: ${String(err?.message || err || 'unknown error')}`,
      });
    } finally {
      setPayingNoticeId(0);
    }
  }

  const payableNotices = notices.filter((notice) => notice?.can_pay_online);
  const nonPayableNotices = notices.filter((notice) => !notice?.can_pay_online);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: '#f8fbff',
        background:
          'radial-gradient(circle at 12% 6%, rgba(245, 200, 76, 0.18), transparent 46%), linear-gradient(180deg, #1a1303 0%, #201706 55%, #130d03 100%)',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      }}
    >
      <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: '#fff8df',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 8px 18px rgba(0,0,0,0.25)',
          }}
        >
          <img src={logo} alt="Fines Victoria" style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: 6 }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.05, color: '#fff7db' }}>Fines Victoria</div>
          <div style={{ color: '#d8c27e', fontSize: 11.5 }}>
            Pay infringement notices online{characterName ? ` • ${characterName}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadNotices({ silent: false })}
          disabled={loading || refreshing || payingNoticeId > 0}
          style={{
            borderRadius: 10,
            border: '1px solid rgba(245,200,76,0.25)',
            background: 'rgba(245,200,76,0.09)',
            color: '#ffe8a3',
            fontSize: 11.5,
            fontWeight: 700,
            padding: '7px 10px',
            cursor: loading || refreshing || payingNoticeId > 0 ? 'default' : 'pointer',
            opacity: loading || refreshing || payingNoticeId > 0 ? 0.7 : 1,
          }}
        >
          {loading || refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12, overflow: 'auto' }}>
        <div
          style={{
            borderRadius: 14,
            border: '1px solid rgba(245,200,76,0.2)',
            background: 'linear-gradient(180deg, rgba(245,200,76,0.08), rgba(15,23,42,0.35))',
            padding: 12,
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: '#cdb56f', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Outstanding Online Payable</div>
              <div style={{ marginTop: 2, fontSize: 22, fontWeight: 900, color: '#fff3bf' }}>
                {formatCurrency(summary?.total_outstanding)}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11.5, color: '#d4d4d8' }}>
              <div>{Number(summary?.payable_count || 0)} payable</div>
              <div>{Number(summary?.total_notices || notices.length || 0)} total notices</div>
              <div style={{ color: '#aab9d3', marginTop: 2 }}>Debit account: {String(account || 'bank')}</div>
            </div>
          </div>
        </div>

        <StatusBanner status={status} />

        {confirmNotice ? (
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(245,200,76,0.28)',
              background: 'linear-gradient(180deg, rgba(245,200,76,0.08), rgba(15,23,42,0.42))',
              padding: 12,
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 11, color: '#d6c27f', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Confirm Payment
            </div>
            <div style={{ fontSize: 12.5, color: '#f8fbff', lineHeight: 1.35 }}>
              Pay <strong>{formatCurrency(confirmNotice?.amount)}</strong> for{' '}
              <strong>{String(confirmNotice?.notice_number || `Notice #${confirmNotice?.id || '?'}`)}</strong>?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmNotice(null)}
                disabled={payingNoticeId > 0}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.22)',
                  background: 'rgba(15,23,42,0.35)',
                  color: '#dbeafe',
                  padding: '9px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: payingNoticeId > 0 ? 'default' : 'pointer',
                  opacity: payingNoticeId > 0 ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayNotice}
                disabled={payingNoticeId > 0}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  border: '1px solid rgba(234,179,8,0.35)',
                  background: 'linear-gradient(135deg, #f5c84c, #eab308)',
                  color: '#1f1400',
                  padding: '9px 10px',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: payingNoticeId > 0 ? 'default' : 'pointer',
                  opacity: payingNoticeId > 0 ? 0.7 : 1,
                }}
              >
                Confirm Pay
              </button>
            </div>
          </div>
        ) : null}

        {loading && notices.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#cbd5e1', padding: '4px 2px' }}>Loading notices...</div>
        ) : null}

        {payableNotices.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#d6c27f', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Pay Online Now
            </div>
            {payableNotices.map((notice) => (
              <NoticeCard
                key={`payable-${notice.id}`}
                notice={notice}
                payingNoticeId={payingNoticeId}
                onPay={handlePayNotice}
              />
            ))}
          </div>
        )}

        {nonPayableNotices.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#b8c7e3', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Other Notices
            </div>
            {nonPayableNotices.map((notice) => (
              <NoticeCard
                key={`other-${notice.id}`}
                notice={notice}
                payingNoticeId={payingNoticeId}
                onPay={handlePayNotice}
              />
            ))}
          </div>
        )}

        {!loading && notices.length === 0 && (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.14)',
              background: 'rgba(15,23,42,0.32)',
              padding: 12,
              fontSize: 12,
              color: '#aab9d3',
              lineHeight: 1.4,
            }}
          >
            No infringement notices were found for your current character. If you expected a notice, refresh after a few seconds.
          </div>
        )}
      </div>
    </div>
  );
}
