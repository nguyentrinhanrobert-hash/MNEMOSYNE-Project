// MNEMOSYNE Live Voice — âm thanh đi qua backend WebSocket, không để API key trong frontend.
function LiveVoicePanel({currentFormula, onTranscript}) {
  const [state,setState]=React.useState('idle');
  const [notice,setNotice]=React.useState('');
  const [muted,setMuted]=React.useState(false);
  const wsRef=React.useRef(null), ctxRef=React.useRef(null), streamRef=React.useRef(null);
  const procRef=React.useRef(null), sourceRef=React.useRef(null), nextPlay=React.useRef(0);
  const activeRef=React.useRef(false), mutedRef=React.useRef(false);
  const outputRef=React.useRef(null);
  const close=React.useCallback(()=>{
    activeRef.current=false;
    try{wsRef.current?.close()}catch(e){}
    wsRef.current=null;
    try{procRef.current?.disconnect()}catch(e){}
    try{sourceRef.current?.disconnect()}catch(e){}
    streamRef.current?.getTracks().forEach(t=>t.stop());
    try{ctxRef.current?.close()}catch(e){}
    try{outputRef.current?.close()}catch(e){}
    ctxRef.current=null; outputRef.current=null; streamRef.current=null;
    nextPlay.current=0; setState('idle');
  },[]);
  React.useEffect(()=>()=>close(),[close]);
  const decode64=(s)=>{const raw=atob(s), bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes};
  const encode64=(bytes)=>{let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result)};
  const play=(b64,rate=24000)=>{
    const ctx=outputRef.current;if(!ctx)return;
    const bytes=decode64(b64), pcm=new Int16Array(bytes.buffer);
    const buffer=ctx.createBuffer(1,pcm.length,rate), channel=buffer.getChannelData(0);
    for(let i=0;i<pcm.length;i++)channel[i]=pcm[i]/32768;
    const src=ctx.createBufferSource();src.buffer=buffer;src.connect(ctx.destination);
    const start=Math.max(ctx.currentTime+0.03,nextPlay.current);
    src.start(start);nextPlay.current=start+buffer.duration;
  };
  const start=async()=>{
    if(activeRef.current)return;
    setNotice('Đang xin quyền micro và kết nối...');setState('connecting');
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Cần chạy qua localhost hoặc HTTPS để dùng microphone.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      streamRef.current=stream;
      const ctx=new (window.AudioContext||window.webkitAudioContext)();ctxRef.current=ctx;
      outputRef.current=new (window.AudioContext||window.webkitAudioContext)();
      await ctx.resume();await outputRef.current.resume();
      const base=(window.MNEMOSYNE_API_BASE||'https://mnemosyne-project.onrender.com').replace(/\/$/,'');
      const url=base.replace(/^http/,'ws')+'/api/live';
      const ws=new WebSocket(url);wsRef.current=ws;
      ws.onopen=()=>{ws.send(JSON.stringify({type:'start',current_formula:currentFormula}));};
      ws.onmessage=(event)=>{
        let msg;try{msg=JSON.parse(event.data)}catch(e){return}
        if(msg.type==='ready'){
          activeRef.current=true;setState('listening');setNotice('Đang trò chuyện trực tiếp · dùng tai nghe để tránh vọng âm.');
          const source=ctx.createMediaStreamSource(stream), proc=ctx.createScriptProcessor(4096,1,1);
          sourceRef.current=source;procRef.current=proc;
          proc.onaudioprocess=(e)=>{
            if(!activeRef.current||mutedRef.current||ws.readyState!==1)return;
            const input=e.inputBuffer.getChannelData(0), srcRate=ctx.sampleRate, count=Math.floor(input.length*16000/srcRate);
            const bytes=new Uint8Array(count*2), view=new DataView(bytes.buffer);
            for(let i=0;i<count;i++){
              const pos=i*srcRate/16000, j=Math.floor(pos), f=pos-j;
              const sample=Math.max(-1,Math.min(1,(input[j]||0)*(1-f)+(input[Math.min(j+1,input.length-1)]||0)*f));
              view.setInt16(i*2,sample<0?sample*32768:sample*32767,true);
            }
            if(ws.bufferedAmount<300000)ws.send(JSON.stringify({type:'audio',data:encode64(bytes)}));
          };
          source.connect(proc);proc.connect(ctx.destination);
        } else if(msg.type==='audio') {play(msg.data,msg.sample_rate||24000);setState('speaking');}
        else if(msg.type==='turn_complete'){setState('listening');}
        else if(msg.type==='interrupted'){nextPlay.current=0;try{outputRef.current?.close()}catch(e){}outputRef.current=new AudioContext();}
        else if(msg.type==='transcript'&&msg.text){setNotice('Đã nhận lời nói: '+msg.text);if(msg.role==='user')onTranscript?.(msg.text);}
        else if(msg.type==='error'){setNotice('Lỗi Live API: '+msg.message);setState('error');}
      };
      ws.onerror=()=>{setNotice('Không kết nối được backend Live. Kiểm tra backend và GEMINI_API_KEY.');setState('error')};
      ws.onclose=()=>{if(activeRef.current||state==='connecting'){setNotice('Phiên Live đã kết thúc.');}close()};
    }catch(e){close();setNotice('Không thể bắt đầu: '+e.message);setState('error')}
  };
  return <div className="live-panel"><div className="live-title">✦ MNEMOSYNE LIVE <span className="live-pill">VOICE · BETA</span></div>
    <p className="hint">Trò chuyện trực tiếp bằng tiếng Việt.</p>
    <div className="live-actions"><button type="button" className="primary" onClick={state==='idle'||state==='error'?start:close}>{state==='idle'||state==='error'?'🎙 Bắt đầu trò chuyện':'■ Kết thúc cuộc gọi'}</button>
    {state!=='idle'&&state!=='error'&&<button type="button" className="secondary" onClick={()=>{mutedRef.current=!mutedRef.current;setMuted(mutedRef.current)}}>{muted?'Bật micro':'Tắt micro'}</button>}
    <span className="hint">{state==='connecting'?'Đang kết nối':state==='listening'?'● Đang nghe':state==='speaking'?'◉ AI đang nói':state==='error'?'Chưa kết nối':''}</span></div>
    {notice&&<p className="live-notice" role="status">{notice}</p>}</div>;
}
