import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface PanelData {
  id: string;
  name: string;
  color: string;
  colorRgb: string;
  icon: string;
  todos: string[];
}

export interface PanelState extends PanelData {
  active: boolean;
  editingIndex: number | null;
  editValue: string;
}

interface UserAccount {
  username: string;
  password: string;
  dataFile: string;
  storageKey: string;
}

const USERS: UserAccount[] = [
  {
    username: 'Noldor87',
    password: 'Feanor1987@',
    dataFile: 'assets/data/panels-db.json',
    storageKey: 'command_panels_noldor87_v5'
  },
  {
    username: 'Luna',
    password: 'Keke2620',
    dataFile: 'assets/data/panels-db-luna.json',
    storageKey: 'command_panels_luna_v5'
  }
];

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  panels: PanelState[] = [];
  loaded = false;

  // Cube state
  currentRotation = 0;
  isDragging = false;
  startX = 0;
  startRotation = 0;
  activeFaceIndex = 0;

  // Login state
  isLoggedIn = false;
  loginUsername = '';
  loginPassword = '';
  loginError = false;
  currentUser: UserAccount | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {}

  // --- Dynamic geometry based on panel count ---
  get faceCount(): number {
    return this.panels.length || 4;
  }

  get faceAngle(): number {
    return 360 / this.faceCount;
  }

  get cubeFaceWidth(): number {
    return this.faceCount <= 4 ? 260 : 200;
  }

  get cubeTranslateZ(): number {
    return this.cubeFaceWidth / (2 * Math.tan(Math.PI / this.faceCount));
  }

  getFaceTransform(index: number): string {
    const angle = this.faceAngle * index;
    return `rotateY(${angle}deg) translateZ(${this.cubeTranslateZ}px)`;
  }

  get activePanel(): PanelState {
    return this.panels[this.activeFaceIndex] || this.panels[0];
  }

  hasActivePanel(): boolean {
    return this.panels.some(p => p.active);
  }

  // --- Data loading (per-user) ---
  loadData() {
    if (!this.currentUser) return;
    const saved = localStorage.getItem(this.currentUser.storageKey);
    if (saved) {
      try {
        const parsed: PanelData[] = JSON.parse(saved);
        this.panels = parsed.map(p => ({
          ...p,
          active: false,
          editingIndex: null,
          editValue: ''
        }));
        this.loaded = true;
      } catch {
        localStorage.removeItem(this.currentUser.storageKey);
        this.loadFromFile();
      }
    } else {
      this.loadFromFile();
    }
  }

  loadFromFile() {
    if (!this.currentUser) return;
    this.http.get<PanelData[]>(this.currentUser.dataFile).subscribe({
      next: (data) => {
        this.panels = data.map(p => ({
          ...p,
          active: false,
          editingIndex: null,
          editValue: ''
        }));
        this.saveData();
        this.loaded = true;
      },
      error: () => {
        console.error('No se pudo cargar el archivo de datos');
        this.loaded = true;
      }
    });
  }

  saveData() {
    if (!this.currentUser) return;
    const toSave: PanelData[] = this.panels.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      colorRgb: p.colorRgb,
      icon: p.icon,
      todos: [...p.todos]
    }));
    localStorage.setItem(this.currentUser.storageKey, JSON.stringify(toSave));
  }

  togglePanel(panel: PanelState) {
    if (panel.active) {
      panel.active = false;
      panel.editingIndex = null;
    } else {
      this.panels.forEach(p => {
        p.active = false;
        p.editingIndex = null;
      });
      panel.active = true;
    }
  }

  // --- Cube Interaction ---
  onPointerDown(e: MouseEvent | TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.side-task-wrapper') || target.closest('.site-header') || target.closest('.btn-logout')) return;
    this.isDragging = true;
    this.startX = this.getClientX(e);
    this.startRotation = this.currentRotation;
  }

  onPointerMove(e: MouseEvent | TouchEvent) {
    if (!this.isDragging) return;
    const x = this.getClientX(e);
    const deltaX = x - this.startX;
    this.currentRotation = this.startRotation + deltaX * 0.4;
  }

  onPointerUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    // Snap to nearest face angle
    const snapAngle = Math.round(this.currentRotation / this.faceAngle) * this.faceAngle;
    this.currentRotation = snapAngle;
    this.updateActiveFace();
  }

  getClientX(e: MouseEvent | TouchEvent): number {
    if (e instanceof MouseEvent) {
      return e.clientX;
    }
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    return e.changedTouches ? e.changedTouches[0].clientX : 0;
  }

  updateActiveFace() {
    let normalizedRotation = Math.round(this.currentRotation) % 360;
    if (normalizedRotation > 0) normalizedRotation -= 360;
    // normalizedRotation is now between -359 and 0
    let faceIndex = Math.round(-normalizedRotation / this.faceAngle) % this.faceCount;
    if (faceIndex < 0) faceIndex += this.faceCount;
    if (faceIndex >= this.faceCount) faceIndex = 0;
    this.activeFaceIndex = faceIndex;
  }

  onFaceClick(panel: PanelState, index: number) {
    // If we just dragged, ignore
    if (Math.abs(this.currentRotation - this.startRotation) > 5) return;
    this.rotateToFace(index);
    this.togglePanel(panel);
  }

  rotateToFace(index: number) {
    const targetAngle = -this.faceAngle * index;
    const curMod = this.currentRotation % 360;
    let diff = targetAngle - curMod;

    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    this.currentRotation += diff;
    this.updateActiveFace();
  }

  // --- Editing tasks ---
  startEditing(panel: PanelState, taskIndex: number) {
    panel.editingIndex = taskIndex;
    panel.editValue = panel.todos[taskIndex];
  }

  confirmEdit(panel: PanelState) {
    if (panel.editingIndex !== null && panel.editValue.trim()) {
      panel.todos[panel.editingIndex] = panel.editValue.trim();
      this.saveData();
    }
    panel.editingIndex = null;
    panel.editValue = '';
  }

  cancelEdit(panel: PanelState) {
    panel.editingIndex = null;
    panel.editValue = '';
  }

  addTask(panel: PanelState) {
    panel.todos.push('Nueva tarea');
    this.saveData();
    this.startEditing(panel, panel.todos.length - 1);
  }

  removeTask(panel: PanelState, taskIndex: number, event: Event) {
    event.stopPropagation();
    panel.todos.splice(taskIndex, 1);
    if (panel.editingIndex === taskIndex) {
      panel.editingIndex = null;
    }
    this.saveData();
  }

  stopProp(event: Event) {
    event.stopPropagation();
  }

  resetToDefaults() {
    if (!this.currentUser) return;
    localStorage.removeItem(this.currentUser.storageKey);
    this.loadFromFile();
  }

  // --- Login ---
  login() {
    const user = USERS.find(u => u.username === this.loginUsername && u.password === this.loginPassword);
    if (user) {
      this.currentUser = user;
      this.isLoggedIn = true;
      this.loginError = false;
      this.loadData();
    } else {
      this.loginError = true;
    }
  }

  logout() {
    this.isLoggedIn = false;
    this.loginUsername = '';
    this.loginPassword = '';
    this.currentUser = null;
    this.panels = [];
    this.loaded = false;
    this.currentRotation = 0;
    this.activeFaceIndex = 0;
  }
}
