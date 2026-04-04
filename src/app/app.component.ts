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

const STORAGE_KEY = 'command_panels_db_v4';

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

  get activePanel(): PanelState {
    return this.panels[this.activeFaceIndex] || this.panels[0];
  }

  hasActivePanel(): boolean {
    return this.panels.some(p => p.active);
  }

  // Login state
  isLoggedIn = false;
  loginUsername = '';
  loginPassword = '';
  loginError = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    const saved = localStorage.getItem(STORAGE_KEY);
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
        localStorage.removeItem(STORAGE_KEY);
        this.loadFromFile();
      }
    } else {
      this.loadFromFile();
    }
  }

  loadFromFile() {
    this.http.get<PanelData[]>('assets/data/panels-db.json').subscribe({
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
        console.error('No se pudo cargar panels-db.json');
        this.loaded = true;
      }
    });
  }

  saveData() {
    // Only persist the data fields, not UI state
    const toSave: PanelData[] = this.panels.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      colorRgb: p.colorRgb,
      icon: p.icon,
      todos: [...p.todos]
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }

  togglePanel(panel: PanelState) {
    if (panel.active) {
      panel.active = false;
      panel.editingIndex = null;
    } else {
      // Close all others first
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
    if (target.closest('.task-overlay') || target.closest('.site-header') || target.closest('.btn-logout')) return;
    this.isDragging = true;
    this.startX = this.getClientX(e);
    this.startRotation = this.currentRotation;
  }

  onPointerMove(e: MouseEvent | TouchEvent) {
    if (!this.isDragging) return;
    const x = this.getClientX(e);
    const deltaX = x - this.startX;
    // Adjust speed here
    this.currentRotation = this.startRotation + deltaX * 0.4;
  }

  onPointerUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    // Snap to nearest 90 degrees
    const snapAngle = Math.round(this.currentRotation / 90) * 90;
    this.currentRotation = snapAngle;
    this.updateActiveFace();
  }

  getClientX(e: MouseEvent | TouchEvent): number {
    if (e instanceof MouseEvent) {
      return e.clientX;
    }
    // Only return defined if it's a TouchEvent with touches
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    // Fallback for touchend
    return e.changedTouches ? e.changedTouches[0].clientX : 0;
  }

  updateActiveFace() {
    let angle = Math.round(this.currentRotation) % 360;
    if (angle <= -180) angle += 360;
    if (angle > 180) angle -= 360;
    
    // angle ranges from -180 to ~180.
    // 0 = front (0)
    // -90 = right (1)
    // -180 or 180 = back (2)
    // 90 = left (3)
    
    if (angle === 0) this.activeFaceIndex = 0;
    else if (angle === -90) this.activeFaceIndex = 1;
    else if (Math.abs(angle) === 180) this.activeFaceIndex = 2;
    else if (angle === 90) this.activeFaceIndex = 3;
  }

  getFaceClass(index: number): string {
    switch(index) {
      case 0: return 'face-front';
      case 1: return 'face-right';
      case 2: return 'face-back';
      case 3: return 'face-left';
      default: return '';
    }
  }

  onFaceClick(panel: PanelState, index: number) {
    // If we just dragged, ignore
    if (Math.abs(this.currentRotation - this.startRotation) > 5) return;

    // Regardless of rotation, if they click a face, make it active and rotate to it
    this.rotateToFace(index);
    this.togglePanel(panel);
  }

  rotateToFace(index: number) {
    let targetAngle = 0;
    switch(index) {
      case 0: targetAngle = 0; break;
      case 1: targetAngle = -90; break;
      case 2: targetAngle = -180; break;
      case 3: targetAngle = -270; break;
    }
    
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
    // Immediately enter edit mode on the new task
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
    localStorage.removeItem(STORAGE_KEY);
    this.loadFromFile();
  }

  // --- Login ---
  login() {
    if (this.loginUsername === 'Noldor87' && this.loginPassword === 'Feanor1987@') {
      this.isLoggedIn = true;
      this.loginError = false;
    } else {
      this.loginError = true;
    }
  }

  logout() {
    this.isLoggedIn = false;
    this.loginUsername = '';
    this.loginPassword = '';
    // Optional: could also close any open panels
    this.panels.forEach(p => p.active = false);
  }
}
