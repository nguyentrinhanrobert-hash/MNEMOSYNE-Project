// MNEMOSYNE Live Voice — Âm thanh + Phụ đề chữ đi qua backend WebSocket.
function LiveVoicePanel({ currentFormula, onTranscript }) {
  const [state, setState] = React.useState('idle');
  const [notice, setNotice] = React.useState('');
  const [muted, setMuted] = React.useState(false);
  const [aiCaption, setAiCaption] = React.useState('');
  const [userCaption, setUserCaption] = React.useState('');

  const wsRef = React.useRef(null);
  const ctxRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const procRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const nextPlay = React.useRef(0);
  const activeRef = React.useRef(false);
  const mutedRef = React.useRef(false);
  const outputRef = React.useRef(null);
  const aiBufferRef = React.useRef('');
  const userBufferRef = React.useRef('');

  const close = React.useCallback(() => {
    activeRef.current = false;
    try { wsRef.current?.close(); } catch (e) {}
    wsRef.current = null;
    try { procRef.current?.disconnect(); } catch (e) {}
    try { sourceRef.current?.disconnect(); } catch (e) {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { ctxRef.current?.close(); } catch (e) {}
    try { outputRef.current?.close(); } catch (e) {}
    ctxRef.current = null;
    outputRef.current = null;
    streamRef.current = null;
    nextPlay.current = 0;
    setState('idle');
  }, []);

  React.useEffect(() => () => close(), [close]);

  const decode64 = (s) => {
    const raw = atob(s);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  };

  const encode64 = (bytes) => {
    let result = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      result += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(result);
  };

  const play = (b64, rate = 24000) => {
    const ctx = outputRef.current;
    if (!ctx) return;
    const bytes = decode64(b64);
    const pcm = new Int16Array(bytes.buffer);
    const buffer = ctx.createBuffer(1, pcm.length, rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const start = Math.max(ctx.currentTime + 0.03, nextPlay.current);
    src.start(start);
    nextPlay.current = start + buffer.duration;
  };

  const flushTranscripts = () => {
    if (userBufferRef.current.trim()) {
      onTranscript?.('user', userBufferRef.current.trim());
      userBufferRef.current = '';
    }
    if (aiBufferRef.current.trim()) {
      onTranscript?.('assistant', aiBufferRef.current.trim());
      aiBufferRef.current = '';
    }
  };

  const start = async () => {
    if (activeRef.current) return;
    setNotice('Đang xin quyền micro và kết nối...');
    setAiCaption('');
    setUserCaption('');
    aiBufferRef.current = '';
    userBufferRef.current = '';
    setState('connecting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Error('Cần chạy qua localhost hoặc HTTPS để dùng microphone.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      outputRef.current = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      await outputRef.current.resume();

      const base = (window.MNEMOSYNE_API_BASE || 'https://mnemosyne-project.onrender.com').replace(/\/$/, '');
      const url = base.replace(/^http/, 'ws') + '/api/live';
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start', current_formula: currentFormula || {} }));
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ready') {
          activeRef.current = true;
          setState('live');
          setNotice('Đang trò chuyện trực tiếp · dùng tai nghe để tránh vọng âm.');

          const src = ctx.createMediaStreamSource(stream);
          sourceRef.current = src;
          const proc = ctx.createScriptProcessor(4096, 1, 1);
          procRef.current = proc;
          const inRate = ctx.sampleRate;

          proc.onaudioprocess = (ev) => {
            if (!activeRef.current || mutedRef.current || ws.readyState !== 1) return;
            const f32 = ev.inputBuffer.getChannelData(0);
            const ratio = inRate / 16000;
            const len = Math.floor(f32.length / ratio);
            const pcm = new Int16Array(len);
            for (let i = 0; i < len; i++) {
              const s = Math.max(-1, Math.min(1, f32[Math.floor(i * ratio)] || 0));
              pcm[i] = s < 0 ? s * 32768 : s * 32767;
            }
            ws.send(JSON.stringify({ type: 'audio', data: encode64(new Uint8Array(pcm.buffer)) }));
          };
          src.connect(proc);
          proc.connect(ctx.destination);
        } else if (msg.type === 'audio' && msg.data) {
          play(msg.data, msg.sample_rate || 24000);
        } else if (msg.type === 'transcript' && msg.text) {
          if (msg.role === 'user') {
            if (aiBufferRef.current.trim()) {
              onTranscript?.('assistant', aiBufferRef.current.trim());
              aiBufferRef.current = '';
            }
            userBufferRef.current += msg.text;
            setUserCaption(userBufferRef.current);
          } else {
            if (userBufferRef.current.trim()) {
              onTranscript?.('user', userBufferRef.current.trim());
              userBufferRef.current = '';
            }
            aiBufferRef.current += msg.text;
            setAiCaption(aiBufferRef.current);
          }
        } else if (msg.type === 'turn_complete') {
          flushTranscripts();
        } else if (msg.type === 'interrupted') {
          nextPlay.current = 0;
          flushTranscripts();
        } else if (msg.type === 'error') {
          setNotice(msg.message || 'Lỗi phiên Live Voice');
          close();
        }
      };

      ws.onerror = () => {
        setNotice('Không kết nối được backend Live Voice.');
        close();
      };

      ws.onclose = () => {
        flushTranscripts();
        if (activeRef.current) {
          setNotice('Phiên Live đã kết thúc.');
          close();
        }
      };
    } catch (err) {
      setNotice(err.message || 'Không mở được micro.');
      close();
    }
  };

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
  };

  return (
    <div style={{
      border: '1px solid rgba(201, 169, 110, 0.35)',
      background: 'rgba(26, 20, 15, 0.72)',
      borderRadius: '10px',
      padding: '14px 16px',
      marginBottom: '14px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ letterSpacing: '0.12em', fontSize: '12px', color: '#e5c687', fontWeight: 600 }}>
          ✦ MNEMOSYNE LIVE
        </span>
        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(201,169,110,0.4)', color: '#c9a96e' }}>
          VOICE · BETA
        </span>
      </div>

      <div style={{ fontSize: '12px', color: '#b8a894', marginBottom: '10px' }}>
        Trò chuyện trực tiếp bằng tiếng Việt
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {state === 'idle' ? (
          <button
            type="button"
            onClick={start}
            style={{
              background: '#c9a96e',
              color: '#1a140f',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 14px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            🎙 Bắt đầu trò chuyện
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={close}
              style={{
                background: '#a64438',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              ■ Kết thúc cuộc gọi
            </button>
            <button
              type="button"
              onClick={toggleMute}
              style={{
                background: 'transparent',
                color: '#e5d8c5',
                border: '1px solid rgba(201,169,110,0.4)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {muted ? 'Bật micro' : 'Tắt micro'}
            </button>
            <span style={{ fontSize: '12px', color: state === 'live' ? '#81c784' : '#e5c687' }}>
              {state === 'live' ? '● Đang nghe' : '◌ Đang kết nối...'}
            </span>
          </>
        )}
      </div>

      {notice && (
        <div style={{ fontSize: '11.5px', color: '#a89882', marginTop: '8px' }}>
          {notice}
        </div>
      )}

      {(userCaption || aiCaption) && (
        <div style={{
          marginTop: '10px',
          padding: '10px 12px',
          borderRadius: '8px',
          background: 'rgba(15, 11, 8, 0.78)',
          border: '1px solid rgba(201, 169, 110, 0.25)',
          fontSize: '13px',
          lineHeight: 1.5
        }}>
          {userCaption && (
            <div style={{ color: '#b8a894', marginBottom: aiCaption ? '6px' : 0 }}>
              <strong style={{ color: '#c9a96e', fontSize: '11px', letterSpacing: '0.06em' }}>BẠN: </strong>
              {userCaption}
            </div>
          )}
          {aiCaption && (
            <div style={{ color: '#f3e9d8' }}>
              <strong style={{ color: '#e5c687', fontSize: '11px', letterSpacing: '0.06em' }}>MNEMOSYNE: </strong>
              {aiCaption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}