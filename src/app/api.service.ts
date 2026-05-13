import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, of, timeout } from 'rxjs';
import { environment } from '../environments/environment';

export interface PanelData {
  _id?: string;
  id: string;
  name: string;
  color: string;
  colorRgb: string;
  icon: string;
  todos: string[];
  position: 'side' | 'top' | 'bottom';
  order: number;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: {
    id: string;
    username: string;
  };
}

export type ServerStatus = 'unknown' | 'waking' | 'ready' | 'error';

const CACHE_KEY    = 'command_panels_cache';
const CACHE_TS_KEY = 'command_panels_cache_ts';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

@Injectable({ providedIn: 'root' })
export class ApiService {
  private apiUrl = environment.apiUrl;

  private _serverStatus       = new BehaviorSubject<ServerStatus>('unknown');
  private _loadingPanels      = new BehaviorSubject<boolean>(false);
  private _loadingLogin       = new BehaviorSubject<boolean>(false);
  private _loadingCreatePanel = new BehaviorSubject<boolean>(false);
  private _loadingDeletePanel = new BehaviorSubject<boolean>(false);
  private _loadingTask        = new BehaviorSubject<boolean>(false);

  serverStatus$       = this._serverStatus.asObservable();
  loadingPanels$      = this._loadingPanels.asObservable();
  loadingLogin$       = this._loadingLogin.asObservable();
  loadingCreatePanel$ = this._loadingCreatePanel.asObservable();
  loadingDeletePanel$ = this._loadingDeletePanel.asObservable();
  loadingTask$        = this._loadingTask.asObservable();

  constructor(private http: HttpClient) {}

  // ── Wake-up ping ──────────────────────────────────────────────────
  pingServer(): void {
    if (this._serverStatus.value === 'ready') return;
    this._serverStatus.next('waking');

    this.http.get(`${this.apiUrl}/health`, { responseType: 'text' })
      .pipe(
        timeout(30000),
        catchError(() =>
          this.http.get(`${this.apiUrl}/api/panels`, {
            headers: new HttpHeaders({ 'Authorization': '' }),
            responseType: 'text'
          }).pipe(
            catchError(() => { this._serverStatus.next('ready'); return of('ok'); })
          )
        )
      )
      .subscribe({
        next: () => this._serverStatus.next('ready'),
        error: () => this._serverStatus.next('error')
      });
  }

  // ── Cache local ───────────────────────────────────────────────────
  saveCache(panels: PanelData[]): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(panels));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch (_) {}
  }

  getCache(fresh = false): PanelData[] | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      if (fresh) {
        const ts = Number(localStorage.getItem(CACHE_TS_KEY) || 0);
        if (Date.now() - ts > CACHE_TTL_MS) return null;
      }
      return JSON.parse(raw) as PanelData[];
    } catch (_) { return null; }
  }

  clearCache(): void {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TS_KEY);
  }

  // ── Auth ──────────────────────────────────────────────────────────
  login(username: string, password: string): Observable<LoginResponse> {
    this._loadingLogin.next(true);
    return this.http.post<LoginResponse>(`${this.apiUrl}/api/auth/login`, { username, password })
      .pipe(tap({
        next: () => { this._loadingLogin.next(false); this._serverStatus.next('ready'); },
        error: () => this._loadingLogin.next(false)
      }));
  }

  saveSession(r: LoginResponse): void {
    localStorage.setItem('command_token', r.token);
    localStorage.setItem('command_user', JSON.stringify(r.user));
  }

  getStoredUser(): { id: string; username: string } | null {
    const u = localStorage.getItem('command_user');
    return u ? JSON.parse(u) : null;
  }

  getToken(): string | null { return localStorage.getItem('command_token'); }

  clearSession(): void {
    localStorage.removeItem('command_token');
    localStorage.removeItem('command_user');
    this.clearCache();
  }

  isAuthenticated(): boolean { return !!this.getToken(); }

  private getHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  // ── Panels ────────────────────────────────────────────────────────
  getPanels(): Observable<PanelData[]> {
    this._loadingPanels.next(true);
    return this.http.get<PanelData[]>(`${this.apiUrl}/api/panels`, { headers: this.getHeaders() })
      .pipe(tap({
        next: (panels) => { this.saveCache(panels); this._loadingPanels.next(false); },
        error: () => this._loadingPanels.next(false)
      }));
  }

  createPanel(panel: Partial<PanelData>): Observable<PanelData> {
    this._loadingCreatePanel.next(true);
    return this.http.post<PanelData>(`${this.apiUrl}/api/panels`, panel, { headers: this.getHeaders() })
      .pipe(tap({
        next: () => this._loadingCreatePanel.next(false),
        error: () => this._loadingCreatePanel.next(false)
      }));
  }

  updatePanel(id: string, data: Partial<PanelData>): Observable<PanelData> {
    return this.http.put<PanelData>(`${this.apiUrl}/api/panels/${id}`, data, { headers: this.getHeaders() });
  }

  deletePanel(id: string): Observable<any> {
    this._loadingDeletePanel.next(true);
    return this.http.delete(`${this.apiUrl}/api/panels/${id}`, { headers: this.getHeaders() })
      .pipe(tap({
        next: () => this._loadingDeletePanel.next(false),
        error: () => this._loadingDeletePanel.next(false)
      }));
  }

  // ── Tasks ─────────────────────────────────────────────────────────
  addTask(panelId: string, task: string): Observable<PanelData> {
    this._loadingTask.next(true);
    return this.http.post<PanelData>(`${this.apiUrl}/api/panels/${panelId}/tasks`, { task }, { headers: this.getHeaders() })
      .pipe(tap({ next: () => this._loadingTask.next(false), error: () => this._loadingTask.next(false) }));
  }

  updateTask(panelId: string, taskIndex: number, task: string): Observable<PanelData> {
    this._loadingTask.next(true);
    return this.http.put<PanelData>(`${this.apiUrl}/api/panels/${panelId}/tasks/${taskIndex}`, { task }, { headers: this.getHeaders() })
      .pipe(tap({ next: () => this._loadingTask.next(false), error: () => this._loadingTask.next(false) }));
  }

  deleteTask(panelId: string, taskIndex: number): Observable<PanelData> {
    this._loadingTask.next(true);
    return this.http.delete<PanelData>(`${this.apiUrl}/api/panels/${panelId}/tasks/${taskIndex}`, { headers: this.getHeaders() })
      .pipe(tap({ next: () => this._loadingTask.next(false), error: () => this._loadingTask.next(false) }));
  }
}
