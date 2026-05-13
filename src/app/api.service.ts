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

// Estado del servidor para mostrar en UI
export type ServerStatus = 'unknown' | 'waking' | 'ready' | 'error';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  // ─── Estado del servidor (observable para que el componente lo consuma) ───
  private _serverStatus = new BehaviorSubject<ServerStatus>('unknown');
  serverStatus$ = this._serverStatus.asObservable();

  // ─── Loading granular por operación ───
  private _loadingPanels   = new BehaviorSubject<boolean>(false);
  private _loadingLogin    = new BehaviorSubject<boolean>(false);
  private _loadingCreatePanel = new BehaviorSubject<boolean>(false);
  private _loadingDeletePanel = new BehaviorSubject<boolean>(false);
  private _loadingTask     = new BehaviorSubject<boolean>(false);

  loadingPanels$      = this._loadingPanels.asObservable();
  loadingLogin$       = this._loadingLogin.asObservable();
  loadingCreatePanel$ = this._loadingCreatePanel.asObservable();
  loadingDeletePanel$ = this._loadingDeletePanel.asObservable();
  loadingTask$        = this._loadingTask.asObservable();

  constructor(private http: HttpClient) {}

  // ─────────────────────────────────────────────────────────
  // WAKE-UP PING  — llamar apenas carga la página de login
  // Hace un GET liviano al backend para despertarlo antes de
  // que el usuario termine de escribir sus credenciales.
  // ─────────────────────────────────────────────────────────
  pingServer(): void {
    if (this._serverStatus.value === 'ready') return;
    this._serverStatus.next('waking');

    this.http.get(`${this.apiUrl}/health`, { responseType: 'text' })
      .pipe(
        timeout(30000),               // hasta 30 s para despertar
        catchError(() =>
          // Si no hay /health, intentar con /auth/login OPTIONS (más liviano)
          this.http.get(`${this.apiUrl}/panels`, {
            headers: new HttpHeaders({ 'Authorization': '' }),
            responseType: 'text'
          }).pipe(
            catchError(() => {
              // 401 también significa que el servidor YA despertó
              this._serverStatus.next('ready');
              return of('ok');
            })
          )
        )
      )
      .subscribe({
        next: () => this._serverStatus.next('ready'),
        error: () => this._serverStatus.next('error')
      });
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('command_token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  // ─── Auth ───
  login(username: string, password: string): Observable<LoginResponse> {
    this._loadingLogin.next(true);
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, { username, password })
      .pipe(
        tap({
          next: () => {
            this._loadingLogin.next(false);
            this._serverStatus.next('ready');
          },
          error: () => this._loadingLogin.next(false)
        })
      );
  }

  saveSession(response: LoginResponse): void {
    localStorage.setItem('command_token', response.token);
    localStorage.setItem('command_user', JSON.stringify(response.user));
  }

  getStoredUser(): { id: string; username: string } | null {
    const user = localStorage.getItem('command_user');
    return user ? JSON.parse(user) : null;
  }

  getToken(): string | null {
    return localStorage.getItem('command_token');
  }

  clearSession(): void {
    localStorage.removeItem('command_token');
    localStorage.removeItem('command_user');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // ─── Panels ───
  getPanels(): Observable<PanelData[]> {
    this._loadingPanels.next(true);
    return this.http.get<PanelData[]>(`${this.apiUrl}/panels`, { headers: this.getHeaders() })
      .pipe(
        tap({
          next: () => this._loadingPanels.next(false),
          error: () => this._loadingPanels.next(false)
        })
      );
  }

  createPanel(panel: Partial<PanelData>): Observable<PanelData> {
    this._loadingCreatePanel.next(true);
    return this.http.post<PanelData>(`${this.apiUrl}/panels`, panel, { headers: this.getHeaders() })
      .pipe(
        tap({
          next: () => this._loadingCreatePanel.next(false),
          error: () => this._loadingCreatePanel.next(false)
        })
      );
  }

  updatePanel(id: string, data: Partial<PanelData>): Observable<PanelData> {
    return this.http.put<PanelData>(`${this.apiUrl}/panels/${id}`, data, { headers: this.getHeaders() });
  }

  deletePanel(id: string): Observable<any> {
    this._loadingDeletePanel.next(true);
    return this.http.delete(`${this.apiUrl}/panels/${id}`, { headers: this.getHeaders() })
      .pipe(
        tap({
          next: () => this._loadingDeletePanel.next(false),
          error: () => this._loadingDeletePanel.next(false)
        })
      );
  }

  // ─── Tasks ───
  addTask(panelId: string, task: string): Observable<PanelData> {
    this._loadingTask.next(true);
    return this.http.post<PanelData>(`${this.apiUrl}/panels/${panelId}/tasks`, { task }, { headers: this.getHeaders() })
      .pipe(
        tap({
          next: () => this._loadingTask.next(false),
          error: () => this._loadingTask.next(false)
        })
      );
  }

  updateTask(panelId: string, taskIndex: number, task: string): Observable<PanelData> {
    this._loadingTask.next(true);
    return this.http.put<PanelData>(`${this.apiUrl}/panels/${panelId}/tasks/${taskIndex}`, { task }, { headers: this.getHeaders() })
      .pipe(
        tap({
          next: () => this._loadingTask.next(false),
          error: () => this._loadingTask.next(false)
        })
      );
  }

  deleteTask(panelId: string, taskIndex: number): Observable<PanelData> {
    this._loadingTask.next(true);
    return this.http.delete<PanelData>(`${this.apiUrl}/panels/${panelId}/tasks/${taskIndex}`, { headers: this.getHeaders() })
      .pipe(
        tap({
          next: () => this._loadingTask.next(false),
          error: () => this._loadingTask.next(false)
        })
      );
  }
}
