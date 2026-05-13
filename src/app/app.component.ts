import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ApiService, PanelData, ServerStatus } from './api.service';
import { Subscription } from 'rxjs';

export interface PanelState extends PanelData {
  active: boolean;
  editingIndex: number | null;
  editValue: string;
}

interface Star {
  x: number; y: number; size: number; opacity: number;
  twinkleSpeed: number; twinklePhase: number;
  driftX: number; driftY: number; color: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starfieldCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private stars: Star[] = [];
  private animFrameId = 0;
  private resizeHandler = () => this.resizeCanvas();
  private subs = new Subscription();

  panels: PanelState[] = [];
  loaded = false;
  // true mientras recarga en background (ya hay cache visible)
  silentRefreshing = false;

  // Loading states
  serverStatus: ServerStatus = 'unknown';
  loadingLogin       = false;
  loadingPanels      = false;
  loadingCreatePanel = false;
  loadingDeletePanel = false;
  loadingTask        = false;
  processingTaskPanelId: string | null = null;

  // Cube state
  currentRotationY = 0;
  currentRotationX = -15;
  isDragging = false;
  startX = 0; startY = 0;
  startRotationY = 0; startRotationX = 0;
  dragAxis: 'none' | 'horizontal' | 'vertical' = 'none';
  activeFaceIndex = 0;
  activeFaceType: 'side' | 'top' | 'bottom' = 'side';

  // Login state
  isLoggedIn = false;
  loginUsername = ''; loginPassword = '';
  loginError = false;
  currentUserName = '';

  // Add panel modal
  showAddModal = false;
  newPanelName = ''; newPanelIcon = '📋';
  newPanelColor = '#10b981'; newPanelColorRgb = '16, 185, 129';
  newPanelPosition: 'side' | 'top' | 'bottom' = 'side';

  // Delete confirmation
  showDeleteConfirm = false;
  panelToDelete: PanelState | null = null;

  availableIcons = ['📋','📚','💼','🎯','🔍','📝','💰','💪','🥗','🎂','💬','🖥️','🚀','⚡','🎮','🎨','🎵','📱','🏠','🛒','📊','⏰','🔧','🌟','❤️','🧠'];
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
    this.subs.add(this.api.serverStatus$.subscribe(s => this.serverStatus = s));
    this.subs.add(this.api.loadingLogin$.subscribe(v => this.loadingLogin = v));
    this.subs.add(this.api.loadingPanels$.subscribe(v => this.loadingPanels = v));
    this.subs.add(this.api.loadingCreatePanel$.subscribe(v => this.loadingCreatePanel = v));
    this.subs.add(this.api.loadingDeletePanel$.subscribe(v => this.loadingDeletePanel = v));
    this.subs.add(this.api.loadingTask$.subscribe(v => this.loadingTask = v));

    this.api.pingServer();

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
    if (this.isLoggedIn) this.initStarfield();
  }

  ngOnDestroy() {
    this.destroyStarfield();
    this.subs.unsubscribe();
  }

  get serverStatusLabel(): string {
    switch (this.serverStatus) {
      case 'waking': return '⏳ Conectando servidor…';
      case 'ready':  return '🟢 Servidor listo';
      case 'error':  return '🔴 Sin conexión';
      default:       return '';
    }
  }

  get isServerWaking(): boolean { return this.serverStatus === 'waking'; }

  // ══════════════════════════════════════════════════════════════════
  // CARGA DE PANELES — estrategia cache-first
  // ══════════════════════════════════════════════════════════════════
  loadPanels() {
    const cached = this.api.getCache();

    if (cached && cached.length > 0) {
      // 1. Mostrar cache inmediatamente → usuario ve datos al instante
      this.panels = this.mapPanels(cached);
      this.loaded = true;
      this.silentRefreshing = true; // indicador sutil en header

      // 2. Refrescar en background sin bloquear la UI
      this.api.getPanels().subscribe({
        next: (fresh) => {
          this.panels = this.mapPanels(fresh);
          this.silentRefreshing = false;
        },
        error: (err) => {
          this.silentRefreshing = false;
          if (err.status === 401) this.logout();
        }
      });

    } else {
      // Sin cache: carga normal con spinner
      this.api.getPanels().subscribe({
        next: (data) => {
          this.panels = this.mapPanels(data);
          this.loaded = true;
        },
        error: (err) => {
          if (err.status === 401) this.logout();
          this.loaded = true;
        }
      });
    }
  }

  private mapPanels(data: PanelData[]): PanelState[] {
    return data.map(p => ({
      ...p,
      position: p.position || 'side',
      order: p.order || 0,
      active: false,
      editingIndex: null,
      editValue: ''
    }));
  }

  /** Sincroniza el cache local con el estado actual de panels */
  private syncCache() {
    this.api.saveCache(this.panels.map(({ active, editingIndex, editValue, ...p }) => p));
  }

  // ══════════════════════════════════════════════════════════════════
  // CREAR PANEL — optimistic UI completo
  // ══════════════════════════════════════════════════════════════════
  createPanel() {
    if (!this.newPanelName.trim()) return;

    const panelId = this.newPanelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newOrder = this.panels.length;

    // Objeto temporal para mostrar inmediatamente
    const optimistic: PanelState = {
      _id: undefined,          // aún no tiene _id real
      id: panelId,
      name: this.newPanelName.trim(),
      color: this.newPanelColor,
      colorRgb: this.newPanelColorRgb,
      icon: this.newPanelIcon,
      todos: [],
      position: this.newPanelPosition,
      order: newOrder,
      active: false,
      editingIndex: null,
      editValue: ''
    };

    // 1. Agregar a la UI al instante y cerrar modal
    this.panels.push(optimistic);
    this.closeAddModal();

    // 2. Confirmar con backend
    this.api.createPanel({
      id: panelId,
      name: optimistic.name,
      color: optimistic.color,
      colorRgb: optimistic.colorRgb,
      icon: optimistic.icon,
      todos: [],
      position: optimistic.position,
      order: newOrder
    }).subscribe({
      next: (created) => {
        // Reemplazar el optimistic con el objeto real (tiene _id)
        const idx = this.panels.findIndex(p => p.id === panelId && !p._id);
        if (idx !== -1) {
          this.panels[idx] = { ...created, active: false, editingIndex: null, editValue: '' };
        }
        this.syncCache();
      },
      error: (err) => {
        console.error('Error creando panel:', err);
        // Revertir: quitar el panel optimistic
        this.panels = this.panels.filter(p => !(p.id === panelId && !p._id));
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ELIMINAR PANEL — optimistic UI
  // ══════════════════════════════════════════════════════════════════
  executeDelete() {
    if (!this.panelToDelete || !this.panelToDelete._id) return;

    const deleted = this.panelToDelete;

    // 1. Quitar de UI y cerrar modal al instante
    this.panels = this.panels.filter(p => p._id !== deleted._id);
    this.showDeleteConfirm = false;
    this.panelToDelete = null;
    this.currentRotationY = 0;
    this.activeFaceIndex = 0;
    if (this.activeFaceType === 'top' && !this.topPanel) this.navigateToSides();
    if (this.activeFaceType === 'bottom' && !this.bottomPanel) this.navigateToSides();

    this.syncCache();

    // 2. Confirmar con backend
    this.api.deletePanel(deleted._id!).subscribe({
      error: (err) => {
        console.error('Error eliminando panel:', err);
        // Revertir: devolver el panel
        this.panels.push(deleted);
        this.panels.sort((a, b) => a.order - b.order);
        this.syncCache();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // TAREAS — ya eran optimistic, ahora también sincronizan cache
  // ══════════════════════════════════════════════════════════════════
  addTask(panel: PanelState) {
    const newTask = 'Nueva tarea';
    this.processingTaskPanelId = panel._id || null;

    panel.todos.push(newTask);
    const idx = panel.todos.length - 1;

    this.api.addTask(panel._id!, newTask).subscribe({
      next: (updated) => {
        panel.todos = updated.todos;
        this.startEditing(panel, panel.todos.length - 1);
        this.processingTaskPanelId = null;
        this.syncCache();
      },
      error: (err) => {
        console.error('Error agregando tarea:', err);
        panel.todos.splice(idx, 1);
        this.processingTaskPanelId = null;
      }
    });
  }

  removeTask(panel: PanelState, taskIndex: number, event: Event) {
    event.stopPropagation();
    const removedTask = panel.todos[taskIndex];
    this.processingTaskPanelId = panel._id || null;

    panel.todos.splice(taskIndex, 1);
    if (panel.editingIndex === taskIndex) panel.editingIndex = null;
    this.syncCache(); // cache se actualiza optimistamente

    this.api.deleteTask(panel._id!, taskIndex).subscribe({
      next: (updated) => {
        panel.todos = updated.todos;
        this.processingTaskPanelId = null;
        this.syncCache();
      },
      error: () => {
        panel.todos.splice(taskIndex, 0, removedTask);
        this.processingTaskPanelId = null;
        this.syncCache();
      }
    });
  }

  confirmEdit(panel: PanelState) {
    if (panel.editingIndex !== null && panel.editValue.trim()) {
      const oldValue = panel.todos[panel.editingIndex];
      const newValue = panel.editValue.trim();
      panel.todos[panel.editingIndex] = newValue;
      this.processingTaskPanelId = panel._id || null;
      this.syncCache();

      this.api.updateTask(panel._id!, panel.editingIndex, newValue).subscribe({
        next: () => { this.processingTaskPanelId = null; },
        error: () => {
          if (panel.editingIndex !== null) panel.todos[panel.editingIndex] = oldValue;
          this.processingTaskPanelId = null;
          this.syncCache();
        }
      });
    }
    panel.editingIndex = null;
    panel.editValue = '';
  }

  // ══════════════════════════════════════════════════════════════════
  // RESTO DEL COMPONENTE (sin cambios funcionales)
  // ══════════════════════════════════════════════════════════════════
  togglePanel(panel: PanelState) {
    if (panel.active) {
      panel.active = false; panel.editingIndex = null;
    } else {
      this.panels.forEach(p => { p.active = false; p.editingIndex = null; });
      panel.active = true;
    }
  }

  get sidePanels(): PanelState[] { return this.panels.filter(p => p.position === 'side'); }
  get topPanel(): PanelState | null { return this.panels.find(p => p.position === 'top') || null; }
  get bottomPanel(): PanelState | null { return this.panels.find(p => p.position === 'bottom') || null; }
  get hasTopBottom(): boolean { return !!(this.topPanel || this.bottomPanel); }
  get faceCount(): number { return this.sidePanels.length || 4; }
  get faceAngle(): number { return 360 / this.faceCount; }
  get cubeFaceWidth(): number { return this.faceCount <= 4 ? 260 : 200; }
  get cubeTranslateZ(): number { return this.cubeFaceWidth / (2 * Math.tan(Math.PI / this.faceCount)); }

  getFaceTransform(i: number): string { return `rotateY(${this.faceAngle * i}deg) translateZ(${this.cubeTranslateZ}px)`; }
  getTopFaceTransform(): string { return `rotateX(90deg) translateZ(130px)`; }
  getBottomFaceTransform(): string { return `rotateX(-90deg) translateZ(130px)`; }

  get activePanel(): PanelState {
    if (this.activeFaceType === 'top' && this.topPanel) return this.topPanel;
    if (this.activeFaceType === 'bottom' && this.bottomPanel) return this.bottomPanel;
    return this.sidePanels[this.activeFaceIndex] || this.sidePanels[0] || this.panels[0];
  }

  hasActivePanel(): boolean { return this.panels.some(p => p.active); }

  startEditing(panel: PanelState, taskIndex: number) {
    panel.editingIndex = taskIndex;
    panel.editValue = panel.todos[taskIndex];
  }

  cancelEdit(panel: PanelState) { panel.editingIndex = null; panel.editValue = ''; }
  stopProp(e: Event) { e.stopPropagation(); }

  openAddModal() {
    this.newPanelName = ''; this.newPanelIcon = '📋';
    this.newPanelColor = '#10b981'; this.newPanelColorRgb = '16, 185, 129';
    this.newPanelPosition = 'side'; this.showAddModal = true;
  }

  closeAddModal() { this.showAddModal = false; }
  selectIcon(icon: string) { this.newPanelIcon = icon; }
  selectColor(c: { hex: string; rgb: string }) { this.newPanelColor = c.hex; this.newPanelColorRgb = c.rgb; }

  canAddPosition(pos: 'side' | 'top' | 'bottom'): boolean {
    if (pos === 'side') return true;
    if (pos === 'top') return !this.topPanel;
    if (pos === 'bottom') return !this.bottomPanel;
    return true;
  }

  confirmDeletePanel(panel: PanelState, event: Event) {
    event.stopPropagation();
    this.panelToDelete = panel;
    this.showDeleteConfirm = true;
  }

  cancelDelete() { this.showDeleteConfirm = false; this.panelToDelete = null; }

  login() {
    this.api.login(this.loginUsername, this.loginPassword).subscribe({
      next: (response) => {
        this.api.saveSession(response);
        this.currentUserName = response.user.username;
        this.isLoggedIn = true;
        this.loginError = false;
        setTimeout(() => this.initStarfield(), 200);
        this.loadPanels();
      },
      error: () => { this.loginError = true; }
    });
  }

  logout() {
    this.api.clearSession(); // también limpia cache
    this.isLoggedIn = false;
    this.loginUsername = ''; this.loginPassword = '';
    this.currentUserName = '';
    this.panels = []; this.loaded = false;
    this.currentRotationY = 0; this.currentRotationX = -15;
    this.activeFaceIndex = 0; this.activeFaceType = 'side';
    this.destroyStarfield();
    this.api.pingServer();
  }

  // ── Cube interaction ──────────────────────────────────────────────
  onPointerDown(e: MouseEvent | TouchEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('.side-task-wrapper') || t.closest('.site-header') || t.closest('.btn-logout')) return;
    this.isDragging = true;
    this.startX = this.getClientX(e); this.startY = this.getClientY(e);
    this.startRotationY = this.currentRotationY; this.startRotationX = this.currentRotationX;
    this.dragAxis = 'none';
  }

  onPointerMove(e: MouseEvent | TouchEvent) {
    if (!this.isDragging) return;
    const dx = this.getClientX(e) - this.startX;
    const dy = this.getClientY(e) - this.startY;
    if (this.dragAxis === 'none') {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5)
        this.dragAxis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      else return;
    }
    if (this.dragAxis === 'horizontal') this.currentRotationY = this.startRotationY + dx * 0.4;
    else if (this.dragAxis === 'vertical' && this.hasTopBottom)
      this.currentRotationX = Math.max(-90, Math.min(90, this.startRotationX - dy * 0.4));
  }

  onPointerUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.dragAxis === 'horizontal') {
      this.currentRotationY = Math.round(this.currentRotationY / this.faceAngle) * this.faceAngle;
      this.updateActiveFace();
    } else if (this.dragAxis === 'vertical' && this.hasTopBottom) this.snapVertical();
    this.dragAxis = 'none';
  }

  snapVertical() {
    const r = this.currentRotationX;
    if (r < -50 && this.topPanel) { this.currentRotationX = -90; this.activeFaceType = 'top'; }
    else if (r > 50 && this.bottomPanel) { this.currentRotationX = 90; this.activeFaceType = 'bottom'; }
    else { this.currentRotationX = -15; this.activeFaceType = 'side'; }
  }

  getClientX(e: MouseEvent | TouchEvent): number {
    if (e instanceof MouseEvent) return e.clientX;
    return e.touches?.length ? e.touches[0].clientX : (e as TouchEvent).changedTouches[0].clientX;
  }

  getClientY(e: MouseEvent | TouchEvent): number {
    if (e instanceof MouseEvent) return e.clientY;
    return e.touches?.length ? e.touches[0].clientY : (e as TouchEvent).changedTouches[0].clientY;
  }

  updateActiveFace() {
    let n = Math.round(this.currentRotationY) % 360;
    if (n > 0) n -= 360;
    let i = Math.round(-n / this.faceAngle) % this.faceCount;
    if (i < 0) i += this.faceCount;
    if (i >= this.faceCount) i = 0;
    this.activeFaceIndex = i;
    this.activeFaceType = 'side';
  }

  onFaceClick(panel: PanelState, index: number, faceType: 'side' | 'top' | 'bottom' = 'side') {
    if (Math.abs(this.currentRotationY - this.startRotationY) > 5) return;
    if (Math.abs(this.currentRotationX - this.startRotationX) > 5) return;
    if (faceType === 'side') this.rotateToFace(index);
    this.activeFaceType = faceType;
    this.togglePanel(panel);
  }

  rotateToFace(index: number) {
    const target = -this.faceAngle * index;
    const cur = this.currentRotationY % 360;
    let diff = target - cur;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    this.currentRotationY += diff;
    this.updateActiveFace();
  }

  navigateToTop() {
    if (!this.topPanel) return;
    this.panels.forEach(p => { p.active = false; p.editingIndex = null; });
    this.currentRotationX = -90; this.activeFaceType = 'top';
  }

  navigateToBottom() {
    if (!this.bottomPanel) return;
    this.panels.forEach(p => { p.active = false; p.editingIndex = null; });
    this.currentRotationX = 90; this.activeFaceType = 'bottom';
  }

  navigateToSides() { this.currentRotationX = -15; this.activeFaceType = 'side'; }

  // ── Starfield ─────────────────────────────────────────────────────
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
    if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = 0; }
    window.removeEventListener('resize', this.resizeHandler);
  }

  private resizeCanvas() {
    if (!this.canvasRef) return;
    const c = this.canvasRef.nativeElement;
    c.width = window.innerWidth;
    c.height = document.documentElement.scrollHeight || window.innerHeight;
  }

  private createStars(w: number, h: number) {
    this.stars = [];
    const colors = ['rgba(180,200,255,','rgba(220,220,255,','rgba(255,240,220,','rgba(160,180,255,','rgba(200,170,255,','rgba(255,255,255,'];
    const n = Math.min(Math.floor((w * h) / 2800), 450);
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * w, y: Math.random() * h,
        size: Math.random() * 1.6 + 0.3, opacity: Math.random() * 0.5 + 0.1,
        twinkleSpeed: Math.random() * 0.008 + 0.002, twinklePhase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 0.08, driftY: (Math.random() - 0.5) * 0.04 - 0.02,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  private animateStarfield(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.drawNebula(ctx, canvas);
      for (const s of this.stars) {
        s.twinklePhase += s.twinkleSpeed;
        const a = s.opacity * (Math.sin(s.twinklePhase) * 0.3 + 0.7);
        s.x += s.driftX; s.y += s.driftY;
        if (s.x < -2) s.x = canvas.width + 2;
        if (s.x > canvas.width + 2) s.x = -2;
        if (s.y < -2) s.y = canvas.height + 2;
        if (s.y > canvas.height + 2) s.y = -2;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color + a.toFixed(3) + ')'; ctx.fill();
        if (s.size > 1.0) {
          ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = s.color + (a * 0.08).toFixed(3) + ')'; ctx.fill();
        }
      }
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  private drawNebula(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const t = Date.now() * 0.00003;
    const patches = [
      { x: canvas.width * 0.25, y: canvas.height * 0.3, r: 200, color: '80,100,200' },
      { x: canvas.width * 0.7,  y: canvas.height * 0.6, r: 250, color: '120,80,160' },
      { x: canvas.width * 0.5,  y: canvas.height * 0.8, r: 180, color: '60,120,140' },
    ];
    for (const p of patches) {
      const b = Math.sin(t + p.x * 0.01) * 0.008 + 0.025;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(${p.color},${b})`);
      g.addColorStop(1, `rgba(${p.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
  }
}
