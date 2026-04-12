import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ApiService, PanelData } from './api.service';

export interface PanelState extends PanelData {
  active: boolean;
  editingIndex: number | null;
  editValue: string;
}

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
  driftX: number;
  driftY: number;
  color: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starfieldCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private stars: Star[] = [];
  private animFrameId: number = 0;
  private resizeHandler = () => this.resizeCanvas();
  panels: PanelState[] = [];
  loaded = false;

  // Cube state
  currentRotationY = 0;
  currentRotationX = -15; // slight tilt
  isDragging = false;
  startX = 0;
  startY = 0;
  startRotationY = 0;
  startRotationX = 0;
  dragAxis: 'none' | 'horizontal' | 'vertical' = 'none';
  activeFaceIndex = 0;
  activeFaceType: 'side' | 'top' | 'bottom' = 'side';

  // Login state
  isLoggedIn = false;
  loginUsername = '';
  loginPassword = '';
  loginError = false;
  currentUserName = '';

  // Add panel modal
  showAddModal = false;
  newPanelName = '';
  newPanelIcon = '📋';
  newPanelColor = '#10b981';
  newPanelColorRgb = '16, 185, 129';
  newPanelPosition: 'side' | 'top' | 'bottom' = 'side';

  // Delete confirmation
  showDeleteConfirm = false;
  panelToDelete: PanelState | null = null;

  // Emoji picker
  availableIcons = ['📋', '📚', '💼', '🎯', '🔍', '📝', '💰', '💪', '🥗', '🎂', '💬', '🖥️', '🚀', '⚡', '🎮', '🎨', '🎵', '📱', '🏠', '🛒', '📊', '⏰', '🔧', '🌟', '❤️', '🧠'];
  availableColors = [
    { hex: '#10b981', rgb: '16, 185, 129',  name: 'Esmeralda' },
    { hex: '#3b82f6', rgb: '59, 130, 246',  name: 'Azul' },
    { hex: '#ef4444', rgb: '239, 68, 68',   name: 'Rojo' },
    { hex: '#f59e0b', rgb: '245, 158, 11',  name: 'Ámbar' },
    { hex: '#8b5cf6', rgb: '139, 92, 246',  name: 'Violeta' },
    { hex: '#ec4899', rgb: '236, 72, 153',  name: 'Rosa' },
    { hex: '#06b6d4', rgb: '6, 182, 212',   name: 'Cyan' },
    { hex: '#f97316', rgb: '249, 115, 22',  name: 'Naranja' }
  ];

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

  ngAfterViewInit() {
    if (this.isLoggedIn) {
      this.initStarfield();
    }
  }

  ngOnDestroy() {
    this.destroyStarfield();
  }

  private initStarfield() {
    setTimeout(() => {
      if (!this.canvasRef) return;
      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      this.resizeCanvas();
      window.addEventListener('resize', this.resizeHandler);
      this.createStars(canvas.width, canvas.height);
      this.animateStarfield(ctx, canvas);
    }, 100);
  }

  private destroyStarfield() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    window.removeEventListener('resize', this.resizeHandler);
  }

  private resizeCanvas() {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = document.documentElement.scrollHeight || window.innerHeight;
  }

  private createStars(w: number, h: number) {
    this.stars = [];
    // Soft color palette — faint blues, warm whites, gentle purples
    const colors = [
      'rgba(180, 200, 255,',   // cool blue-white
      'rgba(220, 220, 255,',   // lavender white
      'rgba(255, 240, 220,',   // warm white
      'rgba(160, 180, 255,',   // soft blue
      'rgba(200, 170, 255,',   // gentle purple
      'rgba(255, 255, 255,',   // pure white
    ];
    const starCount = Math.min(Math.floor((w * h) / 2800), 450);
    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.6 + 0.3,
        opacity: Math.random() * 0.5 + 0.1,
        twinkleSpeed: Math.random() * 0.008 + 0.002,
        twinklePhase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 0.08,
        driftY: (Math.random() - 0.5) * 0.04 - 0.02,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  private animateStarfield(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Subtle nebula glow patches
      this.drawNebula(ctx, canvas);

      // Draw stars
      for (const star of this.stars) {
        star.twinklePhase += star.twinkleSpeed;
        const twinkle = Math.sin(star.twinklePhase) * 0.3 + 0.7;
        const alpha = star.opacity * twinkle;

        // Drift movement
        star.x += star.driftX;
        star.y += star.driftY;

        // Wrap around edges
        if (star.x < -2) star.x = canvas.width + 2;
        if (star.x > canvas.width + 2) star.x = -2;
        if (star.y < -2) star.y = canvas.height + 2;
        if (star.y > canvas.height + 2) star.y = -2;

        // Draw star with soft glow
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = star.color + alpha.toFixed(3) + ')';
        ctx.fill();

        // Soft glow for larger stars
        if (star.size > 1.0) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = star.color + (alpha * 0.08).toFixed(3) + ')';
          ctx.fill();
        }
      }

      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  private drawNebula(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    // Very subtle nebula patches to simulate galactic dust
    const time = Date.now() * 0.00003;
    const patches = [
      { x: canvas.width * 0.25, y: canvas.height * 0.3, r: 200, color: '80, 100, 200' },
      { x: canvas.width * 0.7, y: canvas.height * 0.6, r: 250, color: '120, 80, 160' },
      { x: canvas.width * 0.5, y: canvas.height * 0.8, r: 180, color: '60, 120, 140' },
    ];
    for (const p of patches) {
      const breathe = Math.sin(time + p.x * 0.01) * 0.008 + 0.025;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(${p.color}, ${breathe})`);
      grad.addColorStop(1, `rgba(${p.color}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
  }

  // --- Panels filtered by position ---
  get sidePanels(): PanelState[] {
    return this.panels.filter(p => p.position === 'side');
  }

  get topPanel(): PanelState | null {
    return this.panels.find(p => p.position === 'top') || null;
  }

  get bottomPanel(): PanelState | null {
    return this.panels.find(p => p.position === 'bottom') || null;
  }

  get hasTopBottom(): boolean {
    return !!(this.topPanel || this.bottomPanel);
  }

  // --- Dynamic geometry based on SIDE panel count ---
  get faceCount(): number {
    return this.sidePanels.length || 4;
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

  getTopFaceTransform(): string {
    return `rotateX(90deg) translateZ(${130}px)`;
  }

  getBottomFaceTransform(): string {
    return `rotateX(-90deg) translateZ(${130}px)`;
  }

  get activePanel(): PanelState {
    if (this.activeFaceType === 'top' && this.topPanel) return this.topPanel;
    if (this.activeFaceType === 'bottom' && this.bottomPanel) return this.bottomPanel;
    return this.sidePanels[this.activeFaceIndex] || this.sidePanels[0] || this.panels[0];
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
          position: p.position || 'side',
          order: p.order || 0,
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

  // --- Cube Interaction (horizontal + vertical) ---
  onPointerDown(e: MouseEvent | TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.side-task-wrapper') || target.closest('.site-header') || target.closest('.btn-logout')) return;
    this.isDragging = true;
    this.startX = this.getClientX(e);
    this.startY = this.getClientY(e);
    this.startRotationY = this.currentRotationY;
    this.startRotationX = this.currentRotationX;
    this.dragAxis = 'none';
  }

  onPointerMove(e: MouseEvent | TouchEvent) {
    if (!this.isDragging) return;
    const x = this.getClientX(e);
    const y = this.getClientY(e);
    const deltaX = x - this.startX;
    const deltaY = y - this.startY;

    // Determine drag axis on first significant movement
    if (this.dragAxis === 'none') {
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        this.dragAxis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      } else {
        return;
      }
    }

    if (this.dragAxis === 'horizontal') {
      this.currentRotationY = this.startRotationY + deltaX * 0.4;
    } else if (this.dragAxis === 'vertical' && this.hasTopBottom) {
      let newRotX = this.startRotationX - deltaY * 0.4;
      // Clamp vertical rotation
      newRotX = Math.max(-90, Math.min(90, newRotX));
      this.currentRotationX = newRotX;
    }
  }

  onPointerUp() {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (this.dragAxis === 'horizontal') {
      // Snap to nearest side face
      const snapAngle = Math.round(this.currentRotationY / this.faceAngle) * this.faceAngle;
      this.currentRotationY = snapAngle;
      this.updateActiveFace();
    } else if (this.dragAxis === 'vertical' && this.hasTopBottom) {
      // Snap to top, center, or bottom
      this.snapVertical();
    }

    this.dragAxis = 'none';
  }

  snapVertical() {
    const rotX = this.currentRotationX;
    if (rotX < -50 && this.topPanel) {
      // Show top face
      this.currentRotationX = -90;
      this.activeFaceType = 'top';
    } else if (rotX > 50 && this.bottomPanel) {
      // Show bottom face
      this.currentRotationX = 90;
      this.activeFaceType = 'bottom';
    } else {
      // Show side faces
      this.currentRotationX = -15;
      this.activeFaceType = 'side';
    }
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

  getClientY(e: MouseEvent | TouchEvent): number {
    if (e instanceof MouseEvent) {
      return e.clientY;
    }
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientY;
    }
    return e.changedTouches ? e.changedTouches[0].clientY : 0;
  }

  updateActiveFace() {
    let normalizedRotation = Math.round(this.currentRotationY) % 360;
    if (normalizedRotation > 0) normalizedRotation -= 360;
    let faceIndex = Math.round(-normalizedRotation / this.faceAngle) % this.faceCount;
    if (faceIndex < 0) faceIndex += this.faceCount;
    if (faceIndex >= this.faceCount) faceIndex = 0;
    this.activeFaceIndex = faceIndex;
    this.activeFaceType = 'side';
  }

  onFaceClick(panel: PanelState, index: number, faceType: 'side' | 'top' | 'bottom' = 'side') {
    if (Math.abs(this.currentRotationY - this.startRotationY) > 5) return;
    if (Math.abs(this.currentRotationX - this.startRotationX) > 5) return;

    if (faceType === 'side') {
      this.rotateToFace(index);
    }
    this.activeFaceType = faceType;
    this.togglePanel(panel);
  }

  rotateToFace(index: number) {
    const targetAngle = -this.faceAngle * index;
    const curMod = this.currentRotationY % 360;
    let diff = targetAngle - curMod;

    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    this.currentRotationY += diff;
    this.updateActiveFace();
  }

  // --- Navigate to top/bottom via buttons ---
  navigateToTop() {
    if (!this.topPanel) return;
    this.panels.forEach(p => { p.active = false; p.editingIndex = null; });
    this.currentRotationX = -90;
    this.activeFaceType = 'top';
  }

  navigateToBottom() {
    if (!this.bottomPanel) return;
    this.panels.forEach(p => { p.active = false; p.editingIndex = null; });
    this.currentRotationX = 90;
    this.activeFaceType = 'bottom';
  }

  navigateToSides() {
    this.currentRotationX = -15;
    this.activeFaceType = 'side';
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

  // --- Add Panel Modal ---
  openAddModal() {
    this.newPanelName = '';
    this.newPanelIcon = '📋';
    this.newPanelColor = '#10b981';
    this.newPanelColorRgb = '16, 185, 129';
    this.newPanelPosition = 'side';
    this.showAddModal = true;
  }

  closeAddModal() {
    this.showAddModal = false;
  }

  selectIcon(icon: string) {
    this.newPanelIcon = icon;
  }

  selectColor(color: { hex: string; rgb: string }) {
    this.newPanelColor = color.hex;
    this.newPanelColorRgb = color.rgb;
  }

  canAddPosition(pos: 'side' | 'top' | 'bottom'): boolean {
    if (pos === 'side') return true;
    if (pos === 'top') return !this.topPanel;
    if (pos === 'bottom') return !this.bottomPanel;
    return true;
  }

  createPanel() {
    if (!this.newPanelName.trim()) return;

    const panelId = this.newPanelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newOrder = this.panels.length;

    this.api.createPanel({
      id: panelId,
      name: this.newPanelName.trim(),
      color: this.newPanelColor,
      colorRgb: this.newPanelColorRgb,
      icon: this.newPanelIcon,
      todos: [],
      position: this.newPanelPosition,
      order: newOrder
    }).subscribe({
      next: (created) => {
        this.panels.push({
          ...created,
          active: false,
          editingIndex: null,
          editValue: ''
        });
        this.closeAddModal();
      },
      error: (err) => console.error('Error creando panel:', err)
    });
  }

  // --- Delete Panel ---
  confirmDeletePanel(panel: PanelState, event: Event) {
    event.stopPropagation();
    this.panelToDelete = panel;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.panelToDelete = null;
  }

  executeDelete() {
    if (!this.panelToDelete || !this.panelToDelete._id) return;

    this.api.deletePanel(this.panelToDelete._id).subscribe({
      next: () => {
        this.panels = this.panels.filter(p => p._id !== this.panelToDelete!._id);
        this.showDeleteConfirm = false;
        this.panelToDelete = null;
        // Reset cube rotation
        this.currentRotationY = 0;
        this.activeFaceIndex = 0;
        if (this.activeFaceType !== 'side') {
          // If deleted top/bottom, go back to sides
          if ((this.activeFaceType === 'top' && !this.topPanel) ||
              (this.activeFaceType === 'bottom' && !this.bottomPanel)) {
            this.navigateToSides();
          }
        }
      },
      error: (err) => {
        console.error('Error eliminando panel:', err);
        this.showDeleteConfirm = false;
        this.panelToDelete = null;
      }
    });
  }

  // --- Login ---
  login() {
    this.api.login(this.loginUsername, this.loginPassword).subscribe({
      next: (response) => {
        this.api.saveSession(response);
        this.currentUserName = response.user.username;
        this.isLoggedIn = true;
        this.loginError = false;
        // Initialize starfield after login view renders
        setTimeout(() => this.initStarfield(), 200);
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
    this.currentRotationY = 0;
    this.currentRotationX = -15;
    this.activeFaceIndex = 0;
    this.activeFaceType = 'side';
  }
}
