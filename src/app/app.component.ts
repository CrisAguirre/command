import { Component, OnInit } from '@angular/core';
import { ApiService, PanelData } from './api.service';

export interface PanelState extends PanelData {
  active: boolean;
  editingIndex: number | null;
  editValue: string;
}

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
  currentUserName = '';

  constructor(private api: ApiService) {}

  ngOnInit() {
    // Auto-login if token exists
    if (this.api.isAuthenticated()) {
      const user = this.api.getStoredUser();
      if (user) {
        this.currentUserName = user.username;
        this.isLoggedIn = true;
        this.loadPanels();
      }
    }
  }

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

  // --- Data loading from API ---
  loadPanels() {
    this.api.getPanels().subscribe({
      next: (data) => {
        this.panels = data.map(p => ({
          ...p,
          active: false,
          editingIndex: null,
          editValue: ''
        }));
        this.loaded = true;
      },
      error: (err) => {
        console.error('Error cargando paneles:', err);
        if (err.status === 401) {
          this.logout();
        }
        this.loaded = true;
      }
    });
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
    let faceIndex = Math.round(-normalizedRotation / this.faceAngle) % this.faceCount;
    if (faceIndex < 0) faceIndex += this.faceCount;
    if (faceIndex >= this.faceCount) faceIndex = 0;
    this.activeFaceIndex = faceIndex;
  }

  onFaceClick(panel: PanelState, index: number) {
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

  // --- Editing tasks (now synced with backend) ---
  startEditing(panel: PanelState, taskIndex: number) {
    panel.editingIndex = taskIndex;
    panel.editValue = panel.todos[taskIndex];
  }

  confirmEdit(panel: PanelState) {
    if (panel.editingIndex !== null && panel.editValue.trim()) {
      const oldValue = panel.todos[panel.editingIndex];
      const newValue = panel.editValue.trim();
      panel.todos[panel.editingIndex] = newValue;

      // Sync with backend
      this.api.updateTask(panel._id!, panel.editingIndex, newValue).subscribe({
        error: () => {
          // Revert on error
          if (panel.editingIndex !== null) {
            panel.todos[panel.editingIndex] = oldValue;
          }
        }
      });
    }
    panel.editingIndex = null;
    panel.editValue = '';
  }

  cancelEdit(panel: PanelState) {
    panel.editingIndex = null;
    panel.editValue = '';
  }

  addTask(panel: PanelState) {
    const newTask = 'Nueva tarea';
    this.api.addTask(panel._id!, newTask).subscribe({
      next: (updated) => {
        panel.todos = updated.todos;
        this.startEditing(panel, panel.todos.length - 1);
      },
      error: (err) => console.error('Error agregando tarea:', err)
    });
  }

  removeTask(panel: PanelState, taskIndex: number, event: Event) {
    event.stopPropagation();
    const removedTask = panel.todos[taskIndex];

    this.api.deleteTask(panel._id!, taskIndex).subscribe({
      next: (updated) => {
        panel.todos = updated.todos;
        if (panel.editingIndex === taskIndex) {
          panel.editingIndex = null;
        }
      },
      error: () => {
        // Revert on error
        panel.todos.splice(taskIndex, 0, removedTask);
      }
    });

    // Optimistic UI update
    panel.todos.splice(taskIndex, 1);
    if (panel.editingIndex === taskIndex) {
      panel.editingIndex = null;
    }
  }

  stopProp(event: Event) {
    event.stopPropagation();
  }

  // --- Login ---
  login() {
    this.api.login(this.loginUsername, this.loginPassword).subscribe({
      next: (response) => {
        this.api.saveSession(response);
        this.currentUserName = response.user.username;
        this.isLoggedIn = true;
        this.loginError = false;
        this.loadPanels();
      },
      error: () => {
        this.loginError = true;
      }
    });
  }

  logout() {
    this.api.clearSession();
    this.isLoggedIn = false;
    this.loginUsername = '';
    this.loginPassword = '';
    this.currentUserName = '';
    this.panels = [];
    this.loaded = false;
    this.currentRotation = 0;
    this.activeFaceIndex = 0;
  }
}
