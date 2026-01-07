/**
 * SmartIntercom Card - Custom Lovelace Card with WebSocket Audio Streaming
 */

class SmartIntercomCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._hass = null;
        this._config = null;
        this._ws = null;
        this._audioContext = null;
        this._mediaStream = null;
        this._isStreaming = false;
        this._streamMode = 'idle';
        this._authenticated = false;
        this._nextPlayTime = 0;
    }

    set hass(hass) {
        this._hass = hass;
    }

    setConfig(config) {
        if (!config.host) throw new Error('Specify host (IP)');
        this._config = {
            host: config.host,
            port: config.port || 80,
            secret_key: config.secret_key || '',
            name: config.name || 'SmartIntercom',
            show_controls: config.show_controls !== false,
            show_gain: config.show_gain !== false,
        };
        this._render();
    }

    _render() {
        this.shadowRoot.innerHTML = `
      <style>
        .card { background: var(--ha-card-background, white); border-radius: 12px; padding: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); font-family: sans-serif; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .title { font-weight: bold; font-size: 1.1em; }
        .status { font-size: 0.8em; padding: 4px 10px; border-radius: 10px; }
        .status.connected { background: #e8f5e9; color: #2e7d32; }
        .status.disconnected { background: #ffebee; color: #c62828; }
        .status.streaming { background: #e3f2fd; color: #1565c0; font-weight: bold; }
        .audio-controls { background: #f5f5f5; border-radius: 10px; padding: 12px; margin-bottom: 15px; }
        .btn-group { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .btn { border: none; padding: 10px 5px; border-radius: 8px; cursor: pointer; background: var(--primary-color, #2196f3); color: white; display: flex; flex-direction: column; align-items: center; font-size: 0.75em; transition: 0.2s; }
        .btn:hover { filter: brightness(1.1); }
        .btn.active { background: #4caf50; }
        .btn.stop { background: #f44336; margin-top: 10px; width: 100%; grid-column: span 3; display: none; }
        .btn span.icon { font-size: 20px; margin-bottom: 3px; }
        .gain-group { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
        .gain-slider { display: flex; flex-direction: column; }
        .gain-slider label { font-size: 0.75em; color: #666; margin-bottom: 5px; }
        .visualizer { height: 30px; background: #000; border-radius: 5px; margin-bottom: 10px; display: flex; align-items: flex-end; justify-content: center; gap: 1px; padding: 2px; }
        .bar { width: 3px; background: #4caf50; height: 2px; }
        .error { color: #f44336; font-size: 0.8em; margin-top: 10px; display: none; }
      </style>
      <div class="card">
        <div class="header">
          <span class="title">🔊 ${this._config.name}</span>
          <span class="status disconnected" id="status">Disconnected</span>
        </div>
        <div class="audio-controls">
          <div class="visualizer" id="visualizer">
            ${Array(20).fill('<div class="bar"></div>').join('')}
          </div>
          <div class="btn-group">
            <button class="btn" onclick="this.getRootNode().host._startStreaming('full_duplex', true, true)" id="btn-fd"><span class="icon">📞</span>Full-Duplex</button>
            <button class="btn" onclick="this.getRootNode().host._startStreaming('listen', true, false)" id="btn-listen"><span class="icon">👂</span>Listen</button>
            <button class="btn" onclick="this.getRootNode().host._startStreaming('speak', false, true)" id="btn-speak"><span class="icon">📢</span>Speak</button>
            <button class="btn stop" id="btn-stop" onclick="this.getRootNode().host._stopStreaming()"><span class="icon">⏹️</span>STOP STREAM</button>
          </div>
        </div>
        <div class="btn-group" style="${this._config.show_controls ? '' : 'display:none'}">
          <button class="btn" style="background:#757575" onclick="this.getRootNode().host._sendCommand('doorbell')">🔔 Bell</button>
          <button class="btn" style="background:#757575" onclick="this.getRootNode().host._sendCommand('start_alarm')">🚨 Alarm</button>
          <button class="btn" style="background:#f44336" onclick="this.getRootNode().host._sendCommand('stop_alarm')">🔇 Stop</button>
        </div>
        <div class="gain-group" style="${this._config.show_gain ? '' : 'display:none'}">
          <div class="gain-slider">
            <label>Mic Gain</label>
            <input type="range" min="0.1" max="5" step="0.1" value="1" onchange="this.getRootNode().host._sendCommand('set_mic_gain', {value: parseFloat(this.value)})">
          </div>
          <div class="gain-slider">
            <label>Speaker Gain</label>
            <input type="range" min="0.1" max="3" step="0.1" value="1" onchange="this.getRootNode().host._sendCommand('set_speaker_gain', {value: parseFloat(this.value)})">
          </div>
        </div>
        <div class="error" id="error"></div>
      </div>
    `;
        setTimeout(() => this._connect(), 500);
    }

    _connect() {
        if (this._ws) this._ws.close();
        const wsUrl = `ws://${this._config.host}:${this._config.port}/audio_stream`;
        this._ws = new WebSocket(wsUrl);
        this._ws.binaryType = 'arraybuffer';
        this._ws.onopen = () => this._ws.send(JSON.stringify({ cmd: 'auth', key: this._config.secret_key }));
        this._ws.onmessage = (e) => {
            if (typeof e.data === 'string') {
                const data = JSON.parse(e.data);
                if (data.type === 'auth_success') {
                    this._authenticated = true;
                    this._updateStatus('Connected', 'connected');
                }
            } else if (this._isStreaming && this._enablePlayback) {
                this._playAudio(e.data);
            }
        };
        this._ws.onclose = () => {
            this._updateStatus('Disconnected', 'disconnected');
            setTimeout(() => this._connect(), 5000);
        };
    }

    async _startStreaming(mode, playback, mic) {
        if (!this._authenticated) return;
        try {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            this._nextPlayTime = this._audioContext.currentTime;
            if (mic) {
                this._mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
                const source = this._audioContext.createMediaStreamSource(this._mediaStream);
                const processor = this._audioContext.createScriptProcessor(1024, 1, 1);
                processor.onaudioprocess = (e) => {
                    if (this._isStreaming && this._ws.readyState === 1) {
                        const input = e.inputBuffer.getChannelData(0);
                        const pcm = new Int16Array(input.length);
                        for (let i = 0; i < input.length; i++) pcm[i] = input[i] < 0 ? input[i] * 0x8000 : input[i] * 0x7FFF;
                        this._ws.send(pcm.buffer);
                    }
                };
                source.connect(processor); processor.connect(this._audioContext.destination);
                this._micNodes = { source, processor };
            }
            this._isStreaming = true; this._enablePlayback = playback;
            this._ws.send(JSON.stringify({ cmd: mode === 'full_duplex' ? 'start_stream' : mode === 'listen' ? 'start_listen' : 'start_speak' }));
            this._updateStatus(mode.toUpperCase(), 'streaming');
            this.shadowRoot.getElementById('btn-stop').style.display = 'block';
        } catch (err) { this._showError(err.message); }
    }

    _stopStreaming() {
        if (this._mediaStream) this._mediaStream.getTracks().forEach(t => t.stop());
        if (this._micNodes) { this._micNodes.source.disconnect(); this._micNodes.processor.disconnect(); }
        if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify({ cmd: 'stop_stream' }));
        this._isStreaming = false;
        this._updateStatus('Connected', 'connected');
        this.shadowRoot.getElementById('btn-stop').style.display = 'none';
    }

    _playAudio(data) {
        if (!this._audioContext) return;
        const int16 = new Int16Array(data);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
        const buffer = this._audioContext.createBuffer(1, float32.length, 16000);
        buffer.getChannelData(0).set(float32);
        const source = this._audioContext.createBufferSource();
        source.buffer = buffer; source.connect(this._audioContext.destination);
        if (this._nextPlayTime < this._audioContext.currentTime) this._nextPlayTime = this._audioContext.currentTime;
        source.start(this._nextPlayTime);
        this._nextPlayTime += buffer.duration;
        this._updateVisualizer(float32);
    }

    _updateVisualizer(data) {
        const bars = this.shadowRoot.querySelectorAll('.bar');
        const step = Math.floor(data.length / bars.length);
        bars.forEach((bar, i) => {
            let sum = 0; for (let j = 0; j < step; j++) sum += Math.abs(data[i * step + j] || 0);
            bar.style.height = `${Math.max(2, Math.min(28, (sum / step) * 150))}px`;
        });
    }

    _sendCommand(cmd, params = {}) { if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify({ cmd, ...params })); }
    _updateStatus(txt, cls) { const s = this.shadowRoot.getElementById('status'); s.textContent = txt; s.className = `status ${cls}`; }
    _showError(m) { const e = this.shadowRoot.getElementById('error'); e.textContent = m; e.style.display = 'block'; }
}

customElements.define('smart-intercom-card', SmartIntercomCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'smart-intercom-card', name: 'SmartIntercom Card', preview: true });
