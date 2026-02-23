import { createContext, useContext, useEffect, useRef } from 'react';

const EventSourceContext = createContext(null);

const SSE_EVENTS = [
  'unit:online', 'unit:offline', 'unit:update',
  'call:create', 'call:update', 'call:close', 'call:assign', 'call:unassign',
  'bolo:create', 'bolo:resolve', 'bolo:cancel',
  'warrant:create', 'warrant:serve', 'warrant:cancel',
  'trafficstop:create', 'evidence:create', 'evidence:delete', 'shiftnote:create', 'pursuit:update', 'pursuit:outcome_create',
  'announcement:new', 'sync:department',
];

export function EventSourceProvider({ children }) {
  // Persistent SSE connection shared across the whole app
  const esRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const destroyedRef = useRef(false);
  // Map of event name -> Set of handler functions
  const listenersRef = useRef(new Map());
  // Registered es.addEventListener handlers (so we can remove them on reconnect)
  const esHandlersRef = useRef(new Map());

  function dispatch(event, data) {
    const set = listenersRef.current.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(data); } catch { /* ignore handler errors */ }
    }
  }

  function attachHandlers(es) {
    esHandlersRef.current.clear();
    for (const event of SSE_EVENTS) {
      const handler = (e) => {
        try {
          const data = JSON.parse(e.data);
          dispatch(event, data);
        } catch { /* ignore parse errors */ }
      };
      esHandlersRef.current.set(event, handler);
      es.addEventListener(event, handler);
    }
  }

  function connect() {
    if (destroyedRef.current) return;

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource('/api/events');
    esRef.current = es;

    es.onopen = () => {
      console.log('[SSE] Connected');
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (destroyedRef.current) return;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, 5000);
    };

    attachHandlers(es);
  }

  useEffect(() => {
    destroyedRef.current = false;
    connect();
    return () => {
      destroyedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable subscribe/unsubscribe API exposed via context
  const api = useRef({
    on(event, handler) {
      if (!listenersRef.current.has(event)) {
        listenersRef.current.set(event, new Set());
      }
      listenersRef.current.get(event).add(handler);
    },
    off(event, handler) {
      listenersRef.current.get(event)?.delete(handler);
    },
  });

  return (
    <EventSourceContext.Provider value={api.current}>
      {children}
    </EventSourceContext.Provider>
  );
}

export function useEventSourceContext() {
  const ctx = useContext(EventSourceContext);
  if (!ctx) throw new Error('useEventSourceContext must be used within EventSourceProvider');
  return ctx;
}
