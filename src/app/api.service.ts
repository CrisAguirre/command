import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PanelData {
  _id?: string;
  id: string;
  name: string;
  color: string;
  colorRgb: string;
  icon: string;
  todos: string[];
}

export interface LoginResponse {
  message: string;
  token: string;
  user: {
    id: string;
    username: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'https://command-backend-production.up.railway.app/api';

  constructor(private http: HttpClient) { }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('command_token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  // --- Auth ---
  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, { username, password });
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

  // --- Panels ---
  getPanels(): Observable<PanelData[]> {
    return this.http.get<PanelData[]>(`${this.apiUrl}/panels`, { headers: this.getHeaders() });
  }

  createPanel(panel: Partial<PanelData>): Observable<PanelData> {
    return this.http.post<PanelData>(`${this.apiUrl}/panels`, panel, { headers: this.getHeaders() });
  }

  updatePanel(id: string, data: Partial<PanelData>): Observable<PanelData> {
    return this.http.put<PanelData>(`${this.apiUrl}/panels/${id}`, data, { headers: this.getHeaders() });
  }

  deletePanel(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/panels/${id}`, { headers: this.getHeaders() });
  }

  // --- Tasks ---
  addTask(panelId: string, task: string): Observable<PanelData> {
    return this.http.post<PanelData>(`${this.apiUrl}/panels/${panelId}/tasks`, { task }, { headers: this.getHeaders() });
  }

  updateTask(panelId: string, taskIndex: number, task: string): Observable<PanelData> {
    return this.http.put<PanelData>(`${this.apiUrl}/panels/${panelId}/tasks/${taskIndex}`, { task }, { headers: this.getHeaders() });
  }

  deleteTask(panelId: string, taskIndex: number): Observable<PanelData> {
    return this.http.delete<PanelData>(`${this.apiUrl}/panels/${panelId}/tasks/${taskIndex}`, { headers: this.getHeaders() });
  }
}
