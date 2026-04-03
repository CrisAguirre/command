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
