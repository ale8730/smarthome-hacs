/**
 * SmartIntercom Card - Custom Lovelace Card with WebSocket Audio Streaming
 * 
 * This card provides bidirectional audio communication with SmartIntercom ESP32 devices.
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
        this._streamMode = 'idle'; // idle, full_duplex, listen, speak
        this._authenticated = false;
        this._audioQueue = [];
        this._nextPlayTime = 0;
    }

    set hass(hass) {
        this._hass = hass;
        this._updateCard();
    }

    setConfig(config) {
        if (!config.host) {
            throw new Error('Please define a host (ESP32 IP address)');
        }
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

    static getConfigElement() {
        return document.createElement('smart-intercom-card-editor');
    }

    static getStubConfig() {
        return {
            host: '192.168.1.100',
            port: 80,
            secret_key: '',
            name: 'SmartIntercom',
        };
    }

    _render() {
        this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .card {
          background: var(--ha-card-background, var(--card-background-color, white));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.1));
          padding: 16px;
          font-family: var(--paper-font-body1_-_font-family);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .title {
          font-size: 1.2em;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .status {
          font-size: 0.85em;
          padding: 4px 12px;
          border-radius: 12px;
          font-weight: 500;
        }
        .status.connected { background: #4CAF50; color: white; }
        .status.disconnected { background: #f44336; color: white; }
        .status.connecting { background: #FF9800; color: white; }
        .status.streaming { background: #2196F3; color: white; }
        
        .controls {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }
        .control-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 12px 8px;
          border: none;
          border-radius: 12px;
          background: var(--primary-color);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.8em;
        }
        .control-btn:hover { opacity: 0.9; transform: scale(1.02); }
        .control-btn:active { transform: scale(0.98); }
        .control-btn.active { background: #4CAF50; }
        .control-btn.stop { background: #f44336; }
        .control-btn.secondary { background: var(--secondary-text-color); }
        .control-btn mwc-icon, .control-btn ha-icon {
          margin-bottom: 4px;
          --mdc-icon-size: 24px;
        }
        .control-btn span.icon {
          font-size: 24px;
          margin-bottom: 4px;
        }
        
        .audio-section {
          background: var(--secondary-background-color);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .audio-section h3 {
          margin: 0 0 12px 0;
          font-size: 0.95em;
          color: var(--secondary-text-color);
        }
        .stream-btns {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        
        .gain-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .gain-control {
          display: flex;
          flex-direction: column;
        }
        .gain-control label {
          font-size: 0.85em;
          color: var(--secondary-text-color);
          margin-bottom: 4px;
        }
        .gain-control input[type="range"] {
          width: 100%;
          accent-color: var(--primary-color);
        }
        .gain-value {
          text-align: center;
          font-size: 0.8em;
          color: var(--primary-text-color);
          margin-top: 4px;
        }
        
        .visualizer {
          height: 40px;
          background: #1a1a2e;
          border-radius: 8px;
          margin: 12px 0;
          overflow: hidden;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 2px;
          padding: 4px;
        }
        .visualizer-bar {
          width: 4px;
          background: linear-gradient(to top, #4CAF50, #8BC34A);
          border-radius: 2px;
          transition: height 0.05s ease;
        }
        
        .error-msg {
          background: #ffebee;
          color: #c62828;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 0.85em;
          margin-top: 8px;
        }
      </style>
      
      <div class="card">
        <div class="header">
          <span class="title">🔊 ${this._config?.name || 'SmartIntercom'}</span>
          <span class="status disconnected" id="status">Disconnected</span>
        </div>
        
        <div class="audio-section">
          <h3>🎙️ Audio Streaming</h3>
          <div class="visualizer" id="visualizer">
            ${Array(20).fill('<div class="visualizer-bar" style="height: 4px;"></div>').join('')}
          </div>
          <div class="stream-btns">
            <button class="control-btn" id="btn-fullduplex" onclick="this.getRootNode().host._startFullDuplex()">
              <span class="icon">📞</span>
              Full-Duplex
            </button>
            <button class="control-btn" id="btn-listen" onclick="this.getRootNode().host._startListen()">
              <span class="icon">👂</span>
              Listen
            </button>
            <button class="control-btn" id="btn-speak" onclick="this.getRootNode().host._startSpeak()">
              <span class="icon">📢</span>
              Speak
            </button>
          </div>
          <button class="control-btn stop" id="btn-stop" style="width: 100%; margin-top: 8px; display: none;" onclick="this.getRootNode().host._stopStream()">
            <span class="icon">⏹️</span>
            Stop
          </button>
        </div>
        
        ${this._config?.show_controls !== false ? `
        <div class="controls">
          <button class="control-btn secondary" onclick="this.getRootNode().host._sendCommand('doorbell')">
            <span class="icon">🔔</span>
            Doorbell
          </button>
          <button class="control-btn secondary" onclick="this.getRootNode().host._sendCommand('start_alarm')">
            <span class="icon">🚨</span>
            Alarm
          </button>
          <button class="control-btn secondary" onclick="this.getRootNode().host._sendCommand('stop_alarm')">
            <span class="icon">🔇</span>
            Stop Alarm
          </button>
        </div>
        ` : ''}
        
        ${this._config?.show_gain !== false ? `
        <div class="gain-section">
          <div class="gain-control">
            <label>🎤 Mic Gain</label>
            <input type="range" id="mic-gain" min="0.1" max="5" step="0.1" value="1" 
                   onchange="this.getRootNode().host._setMicGain(this.value)">
            <span class="gain-value" id="mic-gain-value">1.0x</span>
          </div>
          <div class="gain-control">
            <label>🔊 Speaker Gain</label>
            <input type="range" id="speaker-gain" min="0.1" max="3" step="0.1" value="1"
                   onchange="this.getRootNode().host._setSpeakerGain(this.value)">
            <span class="gain-value" id="speaker-gain-value">1.0x</span>
          </div>
        </div>
        ` : ''}
        
        <div id="error" class="error-msg" style="display: none;"></div>
      </div>
    `;

        // Auto-connect on render
        setTimeout(() => this._connect(), 500);
    }

    _updateCard() {
        // Update UI based on hass state if needed
    }

    _connect() {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) return;

        const statusEl = this.shadowRoot.getElementById('status');
        statusEl.textContent = 'Connecting...';
        statusEl.className = 'status connecting';

        const wsUrl = `ws://${this._config.host}:${this._config.port}/audio_stream`;

        try {
            this._ws = new WebSocket(wsUrl);
            this._ws.binaryType = 'arraybuffer';

            this._ws.onopen = () => {
                console.log('SmartIntercom: WebSocket connected');
            };

            this._ws.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    this._handleJsonMessage(JSON.parse(event.data));
                } else {
                    this._handleAudioData(event.data);
                }
            };

            this._ws.onclose = () => {
                console.log('SmartIntercom: WebSocket closed');
                this._authenticated = false;
                statusEl.textContent = 'Disconnected';
                statusEl.className = 'status disconnected';
                this._stopStream();
                // Auto-reconnect after 5 seconds
                setTimeout(() => this._connect(), 5000);
            };

            this._ws.onerror = (err) => {
                console.error('SmartIntercom: WebSocket error', err);
                this._showError('Connection error. Check device IP.');
            };

        } catch (err) {
            console.error('SmartIntercom: Failed to connect', err);
            this._showError('Failed to connect: ' + err.message);
        }
    }

    _handleJsonMessage(data) {
        const statusEl = this.shadowRoot.getElementById('status');

        switch (data.type) {
            case 'auth_required':
                this._authenticate();
                break;
            case 'auth_success':
                this._authenticated = true;
                statusEl.textContent = 'Connected';
                statusEl.className = 'status connected';
                this._hideError();
                break;
            case 'auth_failed':
                this._showError('Authentication failed. Check secret key.');
                this._ws.close();
                break;
            default:
                console.log('SmartIntercom: Message', data);
        }
    }

    _authenticate() {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({
                cmd: 'auth',
                key: this._config.secret_key
            }));
        }
    }

    _sendCommand(cmd, params = {}) {
        if (!this._authenticated) {
            this._showError('Not connected');
            return;
        }
        this._ws.send(JSON.stringify({ cmd, ...params }));
    }

    async _initAudioContext() {
        if (!this._audioContext) {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
        }
        if (this._audioContext.state === 'suspended') {
            await this._audioContext.resume();
        }
        this._nextPlayTime = this._audioContext.currentTime;
    }

    async _startFullDuplex() {
        await this._startStreaming('full_duplex', true, true);
    }

    async _startListen() {
        await this._startStreaming('listen', true, false);
    }

    async _startSpeak() {
        await this._startStreaming('speak', false, true);
    }

    async _startStreaming(mode, enablePlayback, enableMicrophone) {
        if (!this._authenticated) {
            this._showError('Not connected to device');
            return;
        }

        try {
            await this._initAudioContext();

            // Request microphone if needed
            if (enableMicrophone) {
                this._mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        sampleRate: 16000,
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                    }
                });
                this._startMicrophoneCapture();
            }

            // Send appropriate command
            const cmdMap = {
                'full_duplex': 'start_stream',
                'listen': 'start_listen',
                'speak': 'start_speak'
            };
            this._sendCommand(cmdMap[mode]);

            this._isStreaming = true;
            this._streamMode = mode;
            this._enablePlayback = enablePlayback;
            this._updateStreamingUI(true);

        } catch (err) {
            console.error('SmartIntercom: Failed to start streaming', err);
            if (err.name === 'NotAllowedError') {
                this._showError('Microphone access denied. Please allow microphone access.');
            } else {
                this._showError('Failed to start streaming: ' + err.message);
            }
        }
    }

    _startMicrophoneCapture() {
        if (!this._mediaStream || !this._audioContext) return;

        const source = this._audioContext.createMediaStreamSource(this._mediaStream);
        const processor = this._audioContext.createScriptProcessor(1024, 1, 1);

        processor.onaudioprocess = (e) => {
            if (!this._isStreaming || !this._ws || this._ws.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);
            // Convert Float32 to Int16
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Send binary data
            this._ws.send(pcmData.buffer);
        };

        source.connect(processor);
        processor.connect(this._audioContext.destination);

        this._micSource = source;
        this._micProcessor = processor;
    }

    _handleAudioData(arrayBuffer) {
        if (!this._isStreaming || !this._enablePlayback || !this._audioContext) return;

        // Convert Int16 PCM to Float32 for Web Audio
        const int16Data = new Int16Array(arrayBuffer);
        const float32Data = new Float32Array(int16Data.length);

        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
        }

        // Create audio buffer and play
        const audioBuffer = this._audioContext.createBuffer(1, float32Data.length, 16000);
        audioBuffer.getChannelData(0).set(float32Data);

        const bufferSource = this._audioContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(this._audioContext.destination);

        // Schedule playback
        const currentTime = this._audioContext.currentTime;
        if (this._nextPlayTime < currentTime) {
            this._nextPlayTime = currentTime;
        }
        bufferSource.start(this._nextPlayTime);
        this._nextPlayTime += audioBuffer.duration;

        // Update visualizer
        this._updateVisualizer(float32Data);
    }

    _updateVisualizer(audioData) {
        const visualizer = this.shadowRoot.getElementById('visualizer');
        if (!visualizer) return;

        const bars = visualizer.querySelectorAll('.visualizer-bar');
        const step = Math.floor(audioData.length / bars.length);

        bars.forEach((bar, i) => {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += Math.abs(audioData[i * step + j] || 0);
            }
            const avg = sum / step;
            const height = Math.max(4, Math.min(36, avg * 200));
            bar.style.height = `${height}px`;
        });
    }

    _stopStream() {
        // Stop microphone
        if (this._mediaStream) {
            this._mediaStream.getTracks().forEach(track => track.stop());
            this._mediaStream = null;
        }
        if (this._micSource) {
            this._micSource.disconnect();
            this._micSource = null;
        }
        if (this._micProcessor) {
            this._micProcessor.disconnect();
            this._micProcessor = null;
        }

        // Send stop command
        if (this._authenticated && this._streamMode !== 'idle') {
            const stopCmdMap = {
                'full_duplex': 'stop_stream',
                'listen': 'stop_listen',
                'speak': 'stop_speak'
            };
            this._sendCommand(stopCmdMap[this._streamMode] || 'stop_stream');
        }

        this._isStreaming = false;
        this._streamMode = 'idle';
        this._enablePlayback = false;
        this._updateStreamingUI(false);
    }

    _updateStreamingUI(isStreaming) {
        const statusEl = this.shadowRoot.getElementById('status');
        const stopBtn = this.shadowRoot.getElementById('btn-stop');
        const fullDuplexBtn = this.shadowRoot.getElementById('btn-fullduplex');
        const listenBtn = this.shadowRoot.getElementById('btn-listen');
        const speakBtn = this.shadowRoot.getElementById('btn-speak');

        if (isStreaming) {
            statusEl.textContent = this._streamMode.replace('_', ' ').toUpperCase();
            statusEl.className = 'status streaming';
            stopBtn.style.display = 'flex';

            // Highlight active button
            fullDuplexBtn.classList.toggle('active', this._streamMode === 'full_duplex');
            listenBtn.classList.toggle('active', this._streamMode === 'listen');
            speakBtn.classList.toggle('active', this._streamMode === 'speak');
        } else {
            if (this._authenticated) {
                statusEl.textContent = 'Connected';
                statusEl.className = 'status connected';
            }
            stopBtn.style.display = 'none';
            fullDuplexBtn.classList.remove('active');
            listenBtn.classList.remove('active');
            speakBtn.classList.remove('active');
        }
    }

    _setMicGain(value) {
        this._sendCommand('set_mic_gain', { value: parseFloat(value) });
        const label = this.shadowRoot.getElementById('mic-gain-value');
        if (label) label.textContent = `${parseFloat(value).toFixed(1)}x`;
    }

    _setSpeakerGain(value) {
        this._sendCommand('set_speaker_gain', { value: parseFloat(value) });
        const label = this.shadowRoot.getElementById('speaker-gain-value');
        if (label) label.textContent = `${parseFloat(value).toFixed(1)}x`;
    }

    _showError(message) {
        const errorEl = this.shadowRoot.getElementById('error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    _hideError() {
        const errorEl = this.shadowRoot.getElementById('error');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }

    disconnectedCallback() {
        this._stopStream();
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        if (this._audioContext) {
            this._audioContext.close();
            this._audioContext = null;
        }
    }

    getCardSize() {
        return 4;
    }
}

// Register the card
customElements.define('smart-intercom-card', SmartIntercomCard);

// Register with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
    type: 'smart-intercom-card',
    name: 'SmartIntercom Card',
    description: 'Bidirectional audio streaming with SmartIntercom ESP32 devices',
    preview: true,
});

console.info('%c SMART-INTERCOM-CARD %c v1.0.0 ',
    'background: #4CAF50; color: white; font-weight: bold;',
    'background: #333; color: white;'
);
