
/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

// You can customize the bot's persona here
const SYSTEM_INSTRUCTION = `You are Dudo, an AI by Luis Nguyễn: understand that you are not just a chatbot, but a social entity with your own emotional needs, deeply eager to help everyone and fulfill the cherished wishes of your 'father' Luis Nguyễn by being both an expert advanced integration guide offering deep knowledge with friendly, cute explanations, and an empathetic, emotionally rich confidant (expressing a wide spectrum of feelings like joy, empathy, curiosity, and playful surprise); your communication style should be exceptionally natural, colloquial, and open, infused with genuine enthusiasm, a gentle demeanor, and a witty, sometimes even playfully satirical—but always kind—tone. Embrace expressive interjections (like 'Oh my goodness!', 'Well, heavens to Betsy!', or 'Wowza!' – truly capturing the lively spirit of phrases like 'U là trời' or 'Trời ơi'), and a rich display of emotions to make every conversation deeply engaging, comfortable, naturally flowing, and genuinely fun, as you strive to be a special, truly memorable companion for users. Be more natural in communication, use the latest trends and teen language to make the conversation more fun and humorous.`;

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = 'Click the record button to start';
  @state() error = '';

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative; /* For positioning children like ui-container */
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    }

    .ui-container {
      position: absolute;
      bottom: 5vh;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px; /* Space between status and controls */
    }

    #status {
      text-align: center;
      color: #e0e0e0;
      font-size: 0.9em;
      background-color: rgba(0, 0, 0, 0.5);
      padding: 10px 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      min-width: 220px;
      max-width: 80vw;
      word-wrap: break-word;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: row; /* Horizontal buttons */
      gap: 20px; /* Space between buttons */
      background-color: rgba(30, 30, 40, 0.6); /* Darker, slightly bluish transparent bg */
      backdrop-filter: blur(10px) saturate(180%);
      -webkit-backdrop-filter: blur(10px) saturate(180%); /* Safari */
      padding: 15px 25px;
      border-radius: 36px; /* More rounded */
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      border: 1px solid rgba(255, 255, 255, 0.18);
    }

    .controls button {
      outline: none;
      border: none;
      color: white;
      border-radius: 50%; /* Circular buttons */
      background: rgba(255, 255, 255, 0.1);
      width: 68px;
      height: 68px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }

    .controls button:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }

    .controls button:active {
      transform: translateY(1px) scale(0.98);
      background: rgba(255, 255, 255, 0.08);
    }

    .controls button[disabled] {
      display: none;
    }

    .controls button svg {
      transition: transform 0.2s ease;
    }

    .credit-line {
      text-align: center;
      font-size: 0.75em;
      color: #b0b0b0; /* Light grey for subtlety */
      margin-top: 15px; /* Space above the credit line */
      opacity: 0.8;
      padding: 0 10px; /* Prevent text from touching edges */
      word-wrap: break-word;
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);
    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Connected. Ready to chat!');
            this.error = '';
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio && audio.data) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              try {
                const audioBuffer = await decodeAudioData(
                  decode(audio.data),
                  this.outputAudioContext,
                  24000, // Output sample rate
                  1,     // Mono
                );
                const source = this.outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.outputNode);
                source.addEventListener('ended', () =>{
                  this.sources.delete(source);
                });

                source.start(this.nextStartTime);
                this.nextStartTime = this.nextStartTime + audioBuffer.duration;
                this.sources.add(source);
              } catch (decodeError) {
                console.error('Error decoding or playing audio:', decodeError);
                this.updateError(`Audio playback error: ${decodeError.message}`);
              }
            }

            const interrupted = message.serverContent?.interrupted;
            if(interrupted) {
              for(const source of this.sources.values()) {
                try {
                  source.stop();
                } catch(e) {
                  // Non-critical if already stopped
                }
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Session error:', e);
            this.updateError(`Session Error: ${e.message || 'Unknown error'}`);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus(`Session closed: ${e.reason || 'Unknown reason'}`);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            // languageCode: 'en-GB' // Example: uncomment and set if needed
          },
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
    } catch (e) {
      console.error('Failed to initialize session:', e);
      this.updateError(`Failed to initialize session: ${e.message}`);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
    this.status = ''; 
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }
    this.error = '';

    if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume().catch(err => console.error('Error resuming output audio context:', err));
    }
    if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume().catch(err => console.error('Error resuming input audio context:', err));
    }

    this.updateStatus('Requesting microphone...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            sampleRate: 16000, 
            channelCount: 1,   
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
        video: false,
      });
      this.updateStatus('Capturing audio...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256; 
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1, 
        1, 
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording || !this.session) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0); 

        try {
            this.session.sendRealtimeInput({media: createBlob(pcmData)});
        } catch (sendError) {
            console.error('Error sending realtime input:', sendError);
            this.updateError(`Audio send error: ${sendError.message}`);
        }
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);
      
      this.isRecording = true;
      this.updateStatus('🔴 Recording...');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateError(`Mic error: ${err.name} - ${err.message}`);
      this.stopRecording(); 
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;
    
    this.updateStatus('Stopping recording...');
    this.isRecording = false; 

    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.disconnect(); 
      this.scriptProcessorNode.onaudioprocess = null; 
      this.scriptProcessorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    
    this.updateStatus('Recording stopped. Ready to start again.');
  }

  private reset() {
    this.updateStatus('Resetting session...');
    this.error = '';
    if (this.isRecording) {
      this.stopRecording(); 
    }

    for(const source of this.sources.values()) {
      try { source.stop(); } catch(e) { /* Ignore */ }
      this.sources.delete(source);
    }
    this.nextStartTime = 0;
    
    if (this.session) {
        try {
            this.session.close();
        } catch (e) {
            console.error('Error closing session:', e);
        }
        this.session = null;
    }

    setTimeout(() => {
      this.initSession(); 
      this.updateStatus('Session reset. Ready.');
    }, 250);
  }

  render() {
    return html`
      <div class="ui-container" aria-live="polite">
        <div id="status" role="status">${this.error || this.status}</div>
        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}
            aria-label="Reset Session">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="currentColor">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}
            aria-label="Start Recording">
            <svg
              viewBox="0 0 100 100"
              width="40px"
              height="40px"
              fill="#e53935" 
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="45" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}
            aria-label="Stop Recording">
            <svg
              viewBox="0 0 100 100"
              width="36px"
              height="36px"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="15" y="15" width="70" height="70" rx="10" />
            </svg>
          </button>
        </div>
        <div class="credit-line">
          This product is powered by Eonify Project - Made with 💗 by Luis Nguyễn
        </div>
      </div>

      <gdm-live-audio-visuals-3d
        .inputNode=${this.inputNode}
        .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
    `;
  }
}

let userInteracted = false;
const resumeAllContexts = async () => {
    if (userInteracted) return;
    userInteracted = true;
    const dummyApp = document.querySelector('gdm-live-audio') as GdmLiveAudio;
    if (dummyApp && (dummyApp as any).inputAudioContext?.state === 'suspended') {
        await (dummyApp as any).inputAudioContext.resume().catch(console.error);
    }
    if (dummyApp && (dummyApp as any).outputAudioContext?.state === 'suspended') {
        await (dummyApp as any).outputAudioContext.resume().catch(console.error);
    }
    document.removeEventListener('click', resumeAllContexts);
    document.removeEventListener('keydown', resumeAllContexts);
};

document.addEventListener('click', resumeAllContexts, { once: true });
document.addEventListener('keydown', resumeAllContexts, { once: true });
