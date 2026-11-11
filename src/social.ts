/**
 * Deskmate — Social Body Doubling & Ghost Deskmate
 *
 * Implements synchronized focus sessions:
 * 1. Ghost Deskmate: Peaceful synthetic ambient presence with scripted focus rhythm.
 * 2. Friend Mode: Real-time body doubling over lightweight WebSocket relay.
 * Automatic fallback to Ghost mode on network disconnect or timeout.
 */

export type CompanionMode = 'ghost' | 'friend';

export interface PresenceState {
  mode: CompanionMode;
  isConnected: boolean;
  roomCode: string;
  partnerName: string;
  partnerIsFocusing: boolean;
  partnerRemainingSeconds: number;
  partnerHandPosition: [number, number, number];
  partnerStatusMessage: string;
}

export type PresenceListener = (state: PresenceState) => void;

export class SocialPresenceManager {
  private mode: CompanionMode = 'ghost';
  private roomCode = 'DESK-01';
  private partnerName = 'Ghost Companion';
  private partnerIsFocusing = false;
  private partnerRemainingSeconds = 25 * 60;
  private partnerHandPosition: [number, number, number] = [-0.5, 0.76, -0.6];
  private isConnected = false;
  private socket: WebSocket | null = null;
  private listeners: Set<PresenceListener> = new Set();
  private idleTimeoutId: number | null = null;
  private ghostIntervalId: number | null = null;

  constructor() {
    this.startGhostSimulation();
  }

  public subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  public getState(): PresenceState {
    return {
      mode: this.mode,
      isConnected: this.isConnected,
      roomCode: this.roomCode,
      partnerName: this.partnerName,
      partnerIsFocusing: this.partnerIsFocusing,
      partnerRemainingSeconds: this.partnerRemainingSeconds,
      partnerHandPosition: [...this.partnerHandPosition],
      partnerStatusMessage:
        this.mode === 'ghost'
          ? this.partnerIsFocusing
            ? 'Ghost Deskmate is in deep focus beside you'
            : 'Ghost Deskmate is on a calming 5m tea break'
          : this.isConnected
            ? `Focused beside ${this.partnerName} (Room ${this.roomCode})`
            : 'Connecting to focus room...',
    };
  }

  /**
   * Offline Ghost Deskmate simulation with scripted 25m focus / 5m break rhythm
   */
  private startGhostSimulation(): void {
    if (this.ghostIntervalId !== null) return;

    this.ghostIntervalId = (typeof window !== 'undefined'
      ? window.setInterval(() => {
          if (this.mode !== 'ghost') return;

          if (this.partnerRemainingSeconds > 0) {
            this.partnerRemainingSeconds -= 1;
          } else {
            // Flip between 25m focus and 5m break
            this.partnerIsFocusing = !this.partnerIsFocusing;
            this.partnerRemainingSeconds = this.partnerIsFocusing ? 25 * 60 : 5 * 60;
          }
          this.notify();
        }, 1000)
      : null) as unknown as number;
  }

  /**
   * Switch to Ghost Deskmate mode
   */
  public useGhostMode(): void {
    this.mode = 'ghost';
    this.partnerName = 'Ghost Companion';
    this.isConnected = true;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.notify();
  }

  /**
   * Join a shared body-doubling focus room with a friend
   */
  public joinFriendRoom(roomCode: string, relayUrl = 'ws://localhost:8080'): void {
    this.mode = 'friend';
    this.roomCode = roomCode.toUpperCase().trim() || 'DESK-01';
    this.partnerName = 'Friend';
    this.isConnected = false;
    this.notify();

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      this.fallbackToGhost('WebSocket unavailable');
      return;
    }

    try {
      if (this.socket) {
        this.socket.close();
      }
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.socket?.send(
          JSON.stringify({
            type: 'join',
            room: this.roomCode,
            clientName: 'Deskmate User',
          }),
        );
        this.resetIdleTimeout();
        this.notify();
      };

      this.socket.onmessage = (event) => {
        this.resetIdleTimeout();
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'peer_joined') {
            this.partnerName = data.clientName || 'Focus Partner';
            this.notify();
          } else if (data.type === 'presence_sync') {
            if (typeof data.isFocusing === 'boolean') {
              this.partnerIsFocusing = data.isFocusing;
            }
            if (typeof data.remainingSeconds === 'number') {
              this.partnerRemainingSeconds = data.remainingSeconds;
            }
            if (Array.isArray(data.handPosition) && data.handPosition.length === 3) {
              this.partnerHandPosition = data.handPosition as [number, number, number];
            }
            this.notify();
          }
        } catch {
          // parse error
        }
      };

      this.socket.onerror = () => {
        this.fallbackToGhost('Network relay unreachable. Reverted to Ghost companion.');
      };

      this.socket.onclose = () => {
        if (this.mode === 'friend') {
          this.fallbackToGhost('Friend session closed. Reverted to Ghost companion.');
        }
      };
    } catch {
      this.fallbackToGhost('Could not establish connection');
    }
  }

  public broadcastMyState(isFocusing: boolean, remainingSeconds: number): void {
    if (this.mode === 'friend' && this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(
          JSON.stringify({
            type: 'presence_sync',
            room: this.roomCode,
            isFocusing,
            remainingSeconds,
          }),
        );
      } catch {
        // network issue
      }
    }
  }

  private resetIdleTimeout(): void {
    if (this.idleTimeoutId !== null) {
      clearTimeout(this.idleTimeoutId);
    }
    // 30-second idle timeout requirement from blueprint
    this.idleTimeoutId = (typeof window !== 'undefined'
      ? window.setTimeout(() => {
          if (this.mode === 'friend') {
            this.fallbackToGhost('Room idle for 30s. Reverted to Ghost Companion.');
          }
        }, 30000)
      : null) as unknown as number;
  }

  private fallbackToGhost(reason: string): void {
    console.info('[Social] Fallback to Ghost mode:', reason);
    this.useGhostMode();
  }

  public destroy(): void {
    if (this.ghostIntervalId !== null) {
      clearInterval(this.ghostIntervalId);
      this.ghostIntervalId = null;
    }
    if (this.idleTimeoutId !== null) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
  }
}

export const socialPresence = new SocialPresenceManager();
